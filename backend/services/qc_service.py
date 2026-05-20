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

    @staticmethod
    def evaluate_westgard(db: Session, lot_number: str, new_value: float) -> dict[str, Any]:
        """
        Evaluate a new IQC value against stored Levey-Jennings statistics.

        Parameters
        ----------
        db         : active SQLAlchemy session
        lot_number : lot_number on the IQCResult group (e.g. 'LOT-DEMO-001')
        new_value  : raw measured value

        Returns
        -------
        dict with keys: status, violations, z_score, mean, sd
        """
        from models.quality import IQCResult

        # Aggregate stats over all runs in this lot
        lot_rows = (
            db.query(IQCResult)
            .filter(IQCResult.lot_number == lot_number)
            .filter(IQCResult.target_mean.isnot(None))
            .filter(IQCResult.sd.isnot(None))
            .order_by(IQCResult.run_date.desc())
            .all()
        )

        if not lot_rows:
            raise ValueError(f'QC lot not found or has no statistics: {lot_number!r}')

        mean = lot_rows[0].target_mean
        sd   = lot_rows[0].sd

        z_score = (new_value - mean) / sd if sd else 0.0

        violations: list[str] = []
        status = 'PASS'

        # 1-3s Rule (rejection)
        if abs(z_score) > 3:
            violations.append('1_3s')
            status = 'REJECT'

        # 1-2s Rule (warning)
        elif abs(z_score) > 2:
            violations.append('1_2s')
            status = 'WARN'

        # 2-2s Rule (rejection — two consecutive > 2-sigma same side)
        if len(lot_rows) >= 1:
            import math
            prev_z = (lot_rows[0].result_value - mean) / sd if sd else 0
            if abs(z_score) > 2 and abs(prev_z) > 2 and (z_score * prev_z > 0):
                violations.append('2_2s')
                status = 'REJECT'

        # R-4s Rule (rejection — current + prev rand difference > 4 sigma)
        if len(lot_rows) >= 1:
            prev_z  = (lot_rows[0].result_value - mean) / sd if sd else 0
            if abs(z_score - prev_z) > 4:
                violations.append('R_4s')
                status = 'REJECT'

        return {
            'status':      status,
            'violations':  violations,
            'z_score':     round(z_score, 3),
            'mean':        mean,
            'sd':          sd,
            'lot_number':  lot_number,
        }

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
