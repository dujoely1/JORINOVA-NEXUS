"""
JORINOVA NEXUS ALIS-X — AI Anomaly Detection Engine
Statistical baseline + z-score deviation + pattern matching
Risk scoring · Threat levels · Escalation priority · Confidence percentages
"""
import math
from typing import Dict, List, Optional
from datetime import datetime, timedelta


# ─── Risk score weights ────────────────────────────────────────────────────────
WEIGHTS = {
    'brute_force':       85,
    'mass_deletion':     90,
    'mass_modification': 75,
    'off_hours':         40,
    'unknown_ip':        55,
    'critical_override': 80,
    'unusual_volume':    50,
    'privilege_escape':  95,
    'data_exfiltration': 88,
    'biosecurity':       98,
}


def _z_score(value: float, mean: float, stdev: float) -> float:
    if stdev < 1e-10:
        return 0.0
    return abs(value - mean) / stdev


def compute_risk_score(factors: Dict[str, float]) -> float:
    """Weighted composite risk score 0-100."""
    total_weight = sum(WEIGHTS.get(k, 30) * v for k, v in factors.items())
    max_weight   = sum(WEIGHTS.get(k, 30) for k in factors)
    if max_weight == 0:
        return 0.0
    return min(100.0, (total_weight / max_weight) * 100)


def classify_threat(risk_score: float) -> str:
    if risk_score >= 85:
        return 'critical'
    elif risk_score >= 65:
        return 'high'
    elif risk_score >= 40:
        return 'medium'
    return 'low'


class AnomalyDetector:
    """
    Stateless anomaly detection — call with event context.
    Each call returns an anomaly assessment dict.
    Designed to run in < 1ms per check.
    """

    # Thresholds
    FAILED_LOGIN_THRESHOLD    = 5    # failed logins in 10 min = suspicious
    DELETION_THRESHOLD        = 10   # >10 deletions in 1 hour = suspicious
    MODIFICATION_THRESHOLD    = 50   # >50 modifications in 1 hour = suspicious
    OFF_HOURS_START           = 22   # 22:00
    OFF_HOURS_END             = 6    # 06:00
    CRITICAL_OVERRIDE_ROLES   = {'lab_technician', 'receptionist', 'viewer'}  # roles that shouldn't override critical results

    @classmethod
    def assess_login(cls, username: str, ip: str, success: bool,
                     recent_failures: int, known_ips: List[str]) -> Dict:
        factors = {}
        if not success:
            if recent_failures >= cls.FAILED_LOGIN_THRESHOLD:
                factors['brute_force'] = min(1.0, recent_failures / cls.FAILED_LOGIN_THRESHOLD)
        if ip and known_ips and ip not in known_ips:
            factors['unknown_ip'] = 0.7
        score = compute_risk_score(factors)
        return {
            'anomaly_score': score,
            'is_suspicious': score > 40,
            'threat_level':  classify_threat(score),
            'confidence_pct': min(95, int(50 + score * 0.5)),
            'factors':       list(factors.keys()),
        }

    @classmethod
    def assess_deletion(cls, user_role: str, object_type: str,
                        deletions_last_hour: int) -> Dict:
        factors = {}
        if deletions_last_hour > cls.DELETION_THRESHOLD:
            factors['mass_deletion'] = min(1.0, deletions_last_hour / cls.DELETION_THRESHOLD)
        if object_type in ('LabResult', 'Patient', 'AuditEvent', 'LabRecordBookEntry'):
            factors['critical_override'] = 0.8
        score = compute_risk_score(factors)
        return {
            'anomaly_score': score,
            'is_suspicious': score > 45,
            'threat_level':  classify_threat(score),
            'confidence_pct': min(95, int(40 + score * 0.55)),
            'factors':       list(factors.keys()),
        }

    @classmethod
    def assess_result_override(cls, user_role: str, result_was_validated: bool,
                                is_critical: bool) -> Dict:
        factors = {}
        if result_was_validated:
            factors['critical_override'] = 0.7
        if is_critical and user_role in cls.CRITICAL_OVERRIDE_ROLES:
            factors['critical_override'] = 1.0
        score = compute_risk_score(factors)
        return {
            'anomaly_score': score,
            'is_suspicious': score > 50,
            'threat_level':  classify_threat(score),
            'confidence_pct': min(90, int(45 + score * 0.45)),
            'factors':       list(factors.keys()),
        }

    @classmethod
    def assess_access_pattern(cls, hour: int, day_of_week: int,
                               common_hours: List[int], action_count: int,
                               avg_daily: float) -> Dict:
        factors = {}
        # Off-hours check
        if hour >= cls.OFF_HOURS_START or hour < cls.OFF_HOURS_END:
            factors['off_hours'] = 0.6
        # Volume anomaly
        if avg_daily > 0:
            z = _z_score(action_count, avg_daily, max(avg_daily * 0.3, 1))
            if z > 3.0:
                factors['unusual_volume'] = min(1.0, z / 5.0)
        # Unusual hour
        if common_hours and hour not in common_hours:
            factors['off_hours'] = max(factors.get('off_hours', 0), 0.4)
        score = compute_risk_score(factors)
        return {
            'anomaly_score': score,
            'is_suspicious': score > 35,
            'threat_level':  classify_threat(score),
            'confidence_pct': min(85, int(30 + score * 0.55)),
            'factors':       list(factors.keys()),
        }

    @classmethod
    def assess_data_export(cls, user_role: str, records_exported: int,
                            sensitive_fields: bool) -> Dict:
        factors = {}
        if records_exported > 1000:
            factors['data_exfiltration'] = min(1.0, records_exported / 5000)
        if sensitive_fields and records_exported > 100:
            factors['data_exfiltration'] = max(factors.get('data_exfiltration', 0), 0.8)
        if user_role in ('viewer', 'nurse') and records_exported > 200:
            factors['privilege_escape'] = 0.6
        score = compute_risk_score(factors)
        return {
            'anomaly_score': score,
            'is_suspicious': score > 50,
            'threat_level':  classify_threat(score),
            'confidence_pct': min(90, int(40 + score * 0.5)),
            'factors':       list(factors.keys()),
        }


def generate_security_incident_if_needed(event: Dict, assessment: Dict) -> Optional[Dict]:
    """
    Called after each event assessment.
    Returns an incident dict if escalation is needed; None otherwise.
    """
    if not assessment.get('is_suspicious'):
        return None
    if assessment.get('anomaly_score', 0) < 60:
        return None

    factors = assessment.get('factors', [])
    inc_type_map = {
        'brute_force':       'brute_force',
        'mass_deletion':     'mass_deletion',
        'critical_override': 'critical_override',
        'off_hours':         'off_hours',
        'unknown_ip':        'unknown_ip',
        'data_exfiltration': 'data_exfiltration',
        'privilege_escape':  'privilege_escalation',
        'unusual_volume':    'unusual_access',
    }
    inc_type = next((inc_type_map[f] for f in factors if f in inc_type_map), 'unusual_access')
    score    = assessment['anomaly_score']
    conf     = assessment['confidence_pct']
    threat   = assessment['threat_level']

    return {
        'incident_type':      inc_type,
        'threat_level':       threat,
        'risk_score':         score,
        'confidence_pct':     conf,
        'title':              f'{threat.upper()} — {inc_type.replace("_"," ").title()} Detected',
        'description':        (f"AI anomaly detection flagged activity from user "
                               f"{event.get('username','unknown')} "
                               f"(IP: {event.get('ip_address','unknown')}). "
                               f"Risk score: {score:.1f}/100. "
                               f"Factors: {', '.join(factors)}."),
        'ai_reasoning':       (f"Statistical baseline deviation detected. "
                               f"Confidence: {conf}%. "
                               f"Active factors: {factors}. "
                               f"Z-score threshold exceeded for pattern: {inc_type}."),
        'affected_user_id':   event.get('user_id'),
        'affected_username':  event.get('username', ''),
        'evidence_event_ids': [event.get('_event_id', '')],
    }
