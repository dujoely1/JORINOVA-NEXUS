"""
Amendments Router — the canonical way to correct an already-validated result.

A validated lab result is immutable. To correct it, file an amendment:
  POST /api/v1/amendments/{source_table}/{source_id}
        { "new_values": {...}, "reason": "...", "reason_detail": "..." }

Reads:
  GET  /api/v1/amendments/{source_table}/{source_id}  → full chain (oldest first)
  GET  /api/v1/amendments/recent                      → newest 100 across all tables

Allowed reasons (enforced):
  transcription_error · clinician_clarification · analyzer_recheck
  critical_recheck    · pre_release_correction · other
"""
from __future__ import annotations
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import get_current_user
from models.user import User
from services import book_service


router = APIRouter(prefix='/amendments', tags=['Amendments'])


# ── source_table → (SQLAlchemy model, department) ─────────────────────────────

def _resolve(source_table: str):
    """Return (Model, department) for a given source_table string."""
    st = source_table.lower()
    if st == 'lab_result':
        from models.laboratory import LabResult
        return LabResult, 'laboratory'
    if st == 'hem_result':
        from models.hematology import HemResult
        return HemResult, 'hematology'
    if st == 'biochem_result':
        from models.biochemistry import BiochemResult
        return BiochemResult, 'biochemistry'
    if st == 'coag_result':
        from models.coagulation import CoagResult
        return CoagResult, 'coagulation'
    if st == 'sero_result':
        from models.serology import SerologyResult
        return SerologyResult, 'serology'
    if st == 'dipstick_result':
        from models.urinalysis import DipstickResult
        return DipstickResult, 'urinalysis'
    if st == 'pcr_result':
        from models.molecular import PCRResult
        return PCRResult, 'molecular'
    if st == 'viral_load':
        from models.molecular import ViralLoad
        return ViralLoad, 'molecular'
    if st == 'micro_culture':
        from models.microbiology import MicroCulture
        return MicroCulture, 'microbiology'
    if st == 'parasitology_result':
        from models.microbiology import ParasitologyResult
        return ParasitologyResult, 'microbiology'
    # Anatomical pathology
    if st == 'histopathology_report':
        from models.anapath import HistopathologyReport
        return HistopathologyReport, 'laboratory'   # general critical book
    if st == 'cytology_result':
        from models.anapath import CytologyResult
        return CytologyResult, 'laboratory'
    if st == 'ihc_result':
        from models.anapath import IHCResult
        return IHCResult, 'laboratory'
    if st == 'image_analysis':
        from models.anapath import ImageAnalysisResult
        return ImageAnalysisResult, 'laboratory'
    # Toxicology
    if st == 'drug_screen':
        from models.toxicology import DrugScreenResult
        return DrugScreenResult, 'laboratory'
    if st == 'tdm':
        from models.toxicology import TDMResult
        return TDMResult, 'laboratory'
    if st == 'poisoning':
        from models.toxicology import PoisoningCase
        return PoisoningCase, 'laboratory'
    # Advanced molecular
    if st == 'sequencing_run':
        from models.molecular_advanced import SequencingRun
        return SequencingRun, 'molecular'
    if st == 'novel_pattern':
        from models.molecular_advanced import NovelPattern
        return NovelPattern, 'molecular'
    if st == 'genomic_prediction':
        from models.molecular_advanced import GenomicPrediction
        return GenomicPrediction, 'molecular'
    raise HTTPException(400, f'Unknown source_table "{source_table}". Allowed: '
                             'lab_result, hem_result, biochem_result, coag_result, '
                             'sero_result, dipstick_result, pcr_result, viral_load, '
                             'micro_culture, parasitology_result, '
                             'histopathology_report, cytology_result, ihc_result, image_analysis, '
                             'drug_screen, tdm, poisoning, '
                             'sequencing_run, novel_pattern, genomic_prediction')


# ── Request / response shapes ─────────────────────────────────────────────────

class AmendmentIn(BaseModel):
    new_values:    dict        = Field(..., description='Subset of mutable fields to overwrite')
    reason:        str         = Field(..., description=f'One of: {", ".join(sorted(book_service.AMENDMENT_REASONS))}')
    reason_detail: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post('/{source_table}/{source_id}')
def file_amendment(
    source_table: str,
    source_id:    int,
    body:         AmendmentIn,
    db:           Session = Depends(get_db),
    user:         User    = Depends(get_current_user),
):
    """File an amendment against a locked result. Append-only — never edits prior rows."""
    Model, dept = _resolve(source_table)
    obj = db.query(Model).filter(Model.id == source_id).first()
    if not obj:
        raise HTTPException(404, f'{source_table} {source_id} not found')
    if not book_service.is_locked(obj):
        raise HTTPException(
            400,
            'Result is not yet locked (status is mutable). Edit in place via the dept endpoint, '
            'then validate it — amendments are only for validated/released results.',
        )

    return book_service.amend_result(
        department    = dept,
        result_obj    = obj,
        source_table  = source_table.lower(),
        new_values    = body.new_values,
        reason        = body.reason,
        reason_detail = body.reason_detail,
        amender_id    = user.id,
        db            = db,
    )


@router.get('/{source_table}/{source_id}')
def get_chain(
    source_table: str,
    source_id:    int,
    db:           Session = Depends(get_db),
    _u:           User    = Depends(get_current_user),
):
    """Return the full amendment chain for a result, oldest first."""
    # Validate source_table early so callers get a clean 400
    _resolve(source_table)
    chain = book_service.get_amendment_chain(
        source_table=source_table.lower(), source_id=source_id, db=db,
    )
    return {'source_table': source_table.lower(), 'source_id': source_id,
            'count': len(chain), 'chain': chain}


@router.get('/recent')
def recent(
    limit:        int = 100,
    department:   Optional[str] = None,
    db:           Session = Depends(get_db),
    _u:           User    = Depends(get_current_user),
):
    """Cross-dept amendment feed — newest first."""
    from models.amendment import ResultAmendment
    q = db.query(ResultAmendment)
    if department:
        q = q.filter(ResultAmendment.department == department)
    rows = q.order_by(desc(ResultAmendment.amended_at)).limit(min(limit, 500)).all()
    return [
        {
            'amendment_number': a.amendment_number,
            'source_table':     a.source_table,
            'source_id':        a.source_id,
            'department':       a.department,
            'patient_id':       a.patient_id,
            'test_name':        a.test_name,
            'before_value':     a.before_value,
            'after_value':      a.after_value,
            'before_flag':      a.before_flag,
            'after_flag':       a.after_flag,
            'reason':           a.reason,
            'amended_at':       a.amended_at.isoformat() if a.amended_at else None,
            'critical_book_entry': a.critical_book_entry,
        }
        for a in rows
    ]
