"""
Anatomical Pathology router — histopathology, cytology, IHC, image analysis.

Endpoints:
  Histopathology
    GET    /anapath/histology
    POST   /anapath/histology              — create a draft report
    PATCH  /anapath/histology/{id}         — update draft (rejected if locked)
    POST   /anapath/histology/{id}/order-ihc
    POST   /anapath/histology/{id}/validate — sign-off (pathologist) → auto-archive if malignant
  Cytology
    GET    /anapath/cytology
    POST   /anapath/cytology
    POST   /anapath/cytology/{id}/validate
  IHC
    GET    /anapath/ihc
    POST   /anapath/ihc                    — add a stain to a histology report
    POST   /anapath/ihc/{id}/validate
  Image analysis
    GET    /anapath/image-analysis
    POST   /anapath/image-analysis         — submit AI result for pathologist review
    POST   /anapath/image-analysis/{id}/decision
"""
from __future__ import annotations
from typing import Optional
from datetime import date as date_t, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.anapath import HistopathologyReport, CytologyResult, IHCResult, ImageAnalysisResult
from services import book_service

router = APIRouter(prefix='/anapath', tags=['Anatomical Pathology'])

PATH_ROLES = {'pathologist', 'lab_manager', 'super_admin'}


def _gen_id(prefix: str, db: Session, model, field: str) -> str:
    year = date_t.today().year
    col  = getattr(model, field)
    n    = db.query(model).filter(col.like(f'{prefix}-{year}-%')).count()
    return f'{prefix}-{year}-{str(n+1).zfill(5)}'


# ── Histopathology ────────────────────────────────────────────────────────────

class HistoIn(BaseModel):
    lab_request_id: Optional[int] = None
    patient_id:     int
    pid:            Optional[str] = None
    specimen_type:  str
    organ_site:     str
    clinical_history: Optional[str] = None
    blocks_count:   Optional[int] = None
    slides_count:   Optional[int] = None


class HistoUpdate(BaseModel):
    diagnosis_category: Optional[str] = None
    tumour_type:        Optional[str] = None
    grade:              Optional[str] = None
    stage:              Optional[str] = None
    margin_status:      Optional[str] = None
    margin_distance_mm: Optional[float] = None
    ln_examined:        Optional[int] = None
    ln_positive:        Optional[int] = None
    pTNM:               Optional[str] = None
    macroscopic:        Optional[str] = None
    microscopic:        Optional[str] = None
    full_report:        Optional[str] = None
    notes:              Optional[str] = None


@router.get('/histology')
def list_histology(
    diagnosis_category: Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db), _u: User = Depends(get_current_user),
):
    q = db.query(HistopathologyReport)
    if diagnosis_category:
        q = q.filter(HistopathologyReport.diagnosis_category == diagnosis_category)
    return q.order_by(desc(HistopathologyReport.created_at)).offset(skip).limit(limit).all()


@router.post('/histology', status_code=201)
def create_histology(
    body: HistoIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    accession = _gen_id('ANA', db, HistopathologyReport, 'accession_no')
    r = HistopathologyReport(
        accession_no = accession,
        entered_by_id = user.id,
        status = 'DRAFT',
        **body.model_dump(),
    )
    db.add(r); db.commit(); db.refresh(r)
    return r


@router.patch('/histology/{rid}')
def update_histology(
    rid:  int,
    body: HistoUpdate,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    r = db.query(HistopathologyReport).filter(HistopathologyReport.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(r, k, v)
    db.commit(); db.refresh(r)
    return r


@router.post('/histology/{rid}/order-ihc')
def order_ihc(
    rid: int,
    markers: list[str],
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    r = db.query(HistopathologyReport).filter(HistopathologyReport.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    r.ihc_ordered = 'Yes - pending'
    r.status = 'IHC_ORDERED'
    for m in markers:
        db.add(IHCResult(
            accession_no = r.accession_no, histology_id = r.id,
            lab_request_id = r.lab_request_id, patient_id = r.patient_id,
            pid = r.pid, marker = m, entered_by_id = user.id, status = 'PENDING',
        ))
    db.commit()
    return {'status': 'ihc_ordered', 'markers': markers}


@router.post('/histology/{rid}/validate')
def validate_histology(
    rid:  int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    if user.role not in PATH_ROLES:
        raise HTTPException(403, 'Pathologist sign-off required')
    r = db.query(HistopathologyReport).filter(HistopathologyReport.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    if not r.diagnosis_category:
        raise HTTPException(400, 'Diagnosis category is required before validation')
    if r.diagnosis_category == 'Malignant':
        r.is_critical = True; r.flag = 'HH'
    r.pathologist_id = user.id
    book_service.lock_for_validation(r, user.id)
    db.commit(); db.refresh(r)
    if r.diagnosis_category == 'Malignant':
        book_service.archive_critical_if_needed(
            'laboratory', r, user.id, db,
            test_name = f'Histology · {r.organ_site}',
            result_value = f'{r.tumour_type or "Malignancy"} ({r.grade or ""})'.strip(),
        )
    return r


# ── Cytology ──────────────────────────────────────────────────────────────────

CYTO_HSIL = {'HSIL', 'ASC-H', 'SCC', 'AGC', 'AIS', 'Adenocarcinoma',
             'Malignant - other', 'Suspicious for malignancy'}


class CytoIn(BaseModel):
    lab_request_id: Optional[int] = None
    patient_id:     int
    pid:            Optional[str] = None
    cyto_type:      str
    specimen_site:  Optional[str] = None
    adequacy:       Optional[str] = None
    bethesda_category: Optional[str] = None
    organism_seen:  Optional[str] = None
    reactive_changes: Optional[str] = None
    recommendation: Optional[str] = None
    full_report:    Optional[str] = None


@router.get('/cytology')
def list_cytology(
    cyto_type: Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db), _u: User = Depends(get_current_user),
):
    q = db.query(CytologyResult)
    if cyto_type: q = q.filter(CytologyResult.cyto_type == cyto_type)
    return q.order_by(desc(CytologyResult.created_at)).offset(skip).limit(limit).all()


@router.post('/cytology', status_code=201)
def create_cytology(
    body: CytoIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    r = CytologyResult(
        accession_no = _gen_id('CYT', db, CytologyResult, 'accession_no'),
        entered_by_id = user.id, status = 'DRAFT',
        **body.model_dump(),
    )
    db.add(r); db.commit(); db.refresh(r)
    return r


@router.post('/cytology/{rid}/validate')
def validate_cytology(
    rid:  int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    if user.role not in PATH_ROLES:
        raise HTTPException(403, 'Cytopathologist sign-off required')
    r = db.query(CytologyResult).filter(CytologyResult.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    if r.bethesda_category in CYTO_HSIL:
        r.is_critical = True; r.flag = 'HH'
    r.cytopathologist_id = user.id
    book_service.lock_for_validation(r, user.id)
    db.commit(); db.refresh(r)
    if r.is_critical:
        book_service.archive_critical_if_needed(
            'laboratory', r, user.id, db,
            test_name = f'Cytology · {r.cyto_type}',
            result_value = r.bethesda_category or '',
        )
    return r


# ── IHC ───────────────────────────────────────────────────────────────────────

class IHCIn(BaseModel):
    accession_no:   str
    histology_id:   Optional[int] = None
    lab_request_id: Optional[int] = None
    patient_id:     int
    pid:            Optional[str] = None
    marker:         str
    clone_antibody: Optional[str] = None
    intensity:      Optional[str] = None
    percent_positive: Optional[float] = None
    h_score:        Optional[int] = None
    interpretation: Optional[str] = None
    notes:          Optional[str] = None


@router.get('/ihc')
def list_ihc(
    accession_no: Optional[str] = None,
    marker:       Optional[str] = None,
    skip: int = 0, limit: int = 200,
    db: Session = Depends(get_db), _u: User = Depends(get_current_user),
):
    q = db.query(IHCResult)
    if accession_no: q = q.filter(IHCResult.accession_no == accession_no)
    if marker:       q = q.filter(IHCResult.marker == marker)
    return q.order_by(desc(IHCResult.created_at)).offset(skip).limit(limit).all()


@router.post('/ihc', status_code=201)
def create_ihc(
    body: IHCIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    r = IHCResult(entered_by_id = user.id, status = 'PENDING', **body.model_dump())
    db.add(r); db.commit(); db.refresh(r)
    return r


@router.post('/ihc/{rid}/validate')
def validate_ihc(
    rid:  int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    r = db.query(IHCResult).filter(IHCResult.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    book_service.lock_for_validation(r, user.id)
    # HER2 3+ on breast histology → flag for oncology
    if r.marker == 'HER2' and r.intensity and r.intensity.startswith('3+'):
        r.flag = 'H'; r.is_critical = True
    db.commit(); db.refresh(r)
    # Mark parent histology IHC complete if all stains done
    if r.histology_id:
        pending = db.query(IHCResult).filter(
            IHCResult.histology_id == r.histology_id,
            IHCResult.status.notin_(['VALIDATED', 'RELEASED', 'AMENDED']),
        ).count()
        if pending == 0:
            h = db.query(HistopathologyReport).filter(HistopathologyReport.id == r.histology_id).first()
            if h and h.ihc_ordered == 'Yes - pending':
                h.ihc_ordered = 'Completed'
                h.ihc_completed_at = datetime.now(timezone.utc)
                h.status = 'PENDING_PATHOLOGIST'
                db.commit()
    return r


# ── Image analysis ────────────────────────────────────────────────────────────

class ImageIn(BaseModel):
    linked_accession: Optional[str] = None
    histology_id:     Optional[int] = None
    patient_id:       Optional[int] = None
    pid:              Optional[str] = None
    image_type:       str
    image_path:       Optional[str] = None
    ai_model_version: Optional[str] = None
    ai_cellularity:   Optional[float] = None
    ai_mitoses:       Optional[float] = None
    ai_necrosis:      Optional[float] = None
    ai_ki67_estimate: Optional[float] = None
    ai_grade_suggestion: Optional[str] = None
    ai_confidence:    Optional[float] = None
    ai_raw_json:      Optional[str] = None


class ImageDecision(BaseModel):
    decision: str   # Accepted with modification|Accepted as-is|Rejected - manual review
    notes:    Optional[str] = None


@router.get('/image-analysis')
def list_image(
    accession: Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db), _u: User = Depends(get_current_user),
):
    q = db.query(ImageAnalysisResult)
    if accession: q = q.filter(ImageAnalysisResult.linked_accession == accession)
    return q.order_by(desc(ImageAnalysisResult.created_at)).offset(skip).limit(limit).all()


@router.post('/image-analysis', status_code=201)
def submit_image(
    body: ImageIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    r = ImageAnalysisResult(
        analysis_id = _gen_id('IMG', db, ImageAnalysisResult, 'analysis_id'),
        status = 'PENDING',
        **body.model_dump(),
    )
    db.add(r); db.commit(); db.refresh(r)
    return r


@router.post('/image-analysis/{rid}/decision')
def pathologist_decision(
    rid:  int,
    body: ImageDecision,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    if user.role not in PATH_ROLES:
        raise HTTPException(403, 'Pathologist decision required')
    r = db.query(ImageAnalysisResult).filter(ImageAnalysisResult.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    r.pathologist_decision = body.decision
    r.pathologist_notes    = body.notes
    if r.ai_grade_suggestion == 'G4': r.is_critical = True; r.flag = 'H'
    book_service.lock_for_validation(r, user.id)
    db.commit(); db.refresh(r)
    return r
