"""
QC (Quality Control) Westgard rule evaluation for ALIS-X.

Reads from:
  models.quality.IQCResult   — per-run IQC entries with stored mean & sd

No quality_control models are needed — IQCResult already stores the
lot target_mean and sd inline, so this service works with the real schema.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

log = logging.getLogger('qc_service')


class QCService:
    """Quality-control service for ALIS-X laboratory IQC."""

    # Westgard multi-rule set. Any REJECT rule fails the run; 1_2s alone = warning.
    _REJECT_RULES = ('1_3s', '2_2s', 'R_4s', '4_1s', '10x', '2of3_2s', '3_1s')

    @staticmethod
    def evaluate_westgard(db: Session, lot_number: str, new_value: float,
                          analyte_name: str | None = None,
                          control_level: str | None = None,
                          mean: float | None = None, sd: float | None = None) -> dict[str, Any]:
        """
        Evaluate a new IQC value with the FULL Westgard multi-rule set
        (1_2s, 1_3s, 2_2s, R_4s, 4_1s, 10x, 2of3_2s, 3_1s), assessed over the
        ordered z-score series for this lot (+ analyte + control level) with the
        new value appended. `mean`/`sd` may be supplied for a lot's first point.

        Returns: status, violations, rules_checked, z_score, mean, sd, lot_number.
        """
        from models.quality import IQCResult

        q = (db.query(IQCResult)
             .filter(IQCResult.lot_number == lot_number)
             .filter(IQCResult.target_mean.isnot(None), IQCResult.sd.isnot(None)))
        if analyte_name:
            q = q.filter(IQCResult.analyte_name == analyte_name)
        if control_level:
            q = q.filter(IQCResult.control_level == control_level)
        rows = q.order_by(IQCResult.run_date.asc(), IQCResult.created_at.asc()).all()

        if rows:
            mean = rows[-1].target_mean if mean is None else mean
            sd   = rows[-1].sd if sd is None else sd
        if mean is None or sd is None:
            raise ValueError(f'QC lot not found or has no statistics: {lot_number!r}')

        history = [((r.result_value - mean) / sd if sd else 0.0) for r in rows]
        z_new = (new_value - mean) / sd if sd else 0.0
        result = QCService._westgard_rules(history + [z_new])
        result.update({'z_score': round(z_new, 3), 'mean': mean, 'sd': sd,
                       'lot_number': lot_number, 'n_history': len(history)})
        return result

    @staticmethod
    def _westgard_rules(series: list[float]) -> dict[str, Any]:
        """Apply the Westgard rules to an ordered z-score series (newest last)."""
        z = series[-1]
        n = len(series)
        viol: list[str] = []

        def same_side(vals, thr):
            return all(v > thr for v in vals) or all(v < -thr for v in vals)

        if abs(z) > 3:
            viol.append('1_3s')
        if n >= 2 and same_side(series[-2:], 2):
            viol.append('2_2s')
        if n >= 3:                                    # 2 of last 3 >2s same side (current one of them)
            last3 = series[-3:]
            for side in (1, -1):
                if z * side > 2 and sum(1 for v in last3 if v * side > 2) >= 2:
                    viol.append('2of3_2s')
                    break
        if n >= 2 and (max(series[-2:]) - min(series[-2:])) > 4 and series[-1] * series[-2] < 0:
            viol.append('R_4s')
        if n >= 3 and same_side(series[-3:], 1):
            viol.append('3_1s')
        if n >= 4 and same_side(series[-4:], 1):
            viol.append('4_1s')
        if n >= 10 and (all(v > 0 for v in series[-10:]) or all(v < 0 for v in series[-10:])):
            viol.append('10x')

        if any(r in QCService._REJECT_RULES for r in viol):
            status = 'REJECT'
        elif abs(z) > 2:
            status = 'WARN'
            if '1_2s' not in viol:
                viol.append('1_2s')
        else:
            status = 'PASS'
        return {'status': status, 'violations': viol,
                'rules_checked': ['1_2s', '1_3s', '2_2s', '2of3_2s', 'R_4s', '3_1s', '4_1s', '10x']}

    @staticmethod
    def get_levey_jennings_data(
        db: Session,
        lot_number: str,
        analyte_name: str | None = None,
    ) -> dict[str, Any]:
        """
        Return Levey-Jennings chart data for a QC lot.

        Parameters
        ----------
        db            : active session
        lot_number    : lot identifier
        analyte_name  : optional filter; fetch all lots if None

        Returns
        -------
        dict with mean, sd, and ordered data_points
        """
        from models.quality import IQCResult

        query = (
            db.query(IQCResult)
            .filter(IQCResult.lot_number == lot_number)
        )
        if analyte_name:
            query = query.filter(IQCResult.analyte_name == analyte_name)

        rows = query.order_by(IQCResult.run_date.asc()).all()

        if not rows:
            return {
                'lot_number':  lot_number,
                'analyte':     analyte_name or '',
                'mean':        None,
                'sd':          None,
                'data_points': [],
            }

        mean = rows[0].target_mean
        sd   = rows[0].sd

        return {
            'lot_number':  lot_number,
            'analyte':     analyte_name or rows[0].analyte_name,
            'mean':        mean,
            'sd':          sd,
            'data_points': [
                {
                    'run_date':   r.run_date.isoformat() if r.run_date else None,
                    'value':      r.result_value,
                    'z_score':    r.z_score,
                    'status':     r.status,
                    'westgard':   r.westgard_rule,
                    'analyte':    r.analyte_name,
                    'control':    r.control_level,
                }
                for r in rows
            ],
        }
