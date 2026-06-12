"""
Advanced Molecular router — NGS sequencing, novel variant patterns,
clinical genomic predictions.

  Sequencing run
    GET    /molecular-advanced/runs
    POST   /molecular-advanced/runs                    — register a new run
    POST   /molecular-advanced/runs/{id}/qc            — submit QC metrics
    POST   /molecular-advanced/runs/{id}/variants      — submit variant call summary
    POST   /molecular-advanced/runs/{id}/validate

  Novel patterns
    GET    /molecular-advanced/novel
    POST   /molecular-advanced/novel                   — AI-flagged unknown variant
    POST   /molecular-advanced/novel/{id}/validate     — Alert/Emergency → critical archive

  Genomic predictions
    GET    /molecular-advanced/predictions
    POST   /molecular-advanced/predictions
    POST   /molecular-advanced/predictions/{id}/validate  — Pathogenic class → critical archive
"""
from __future__ import annotations
from typing import Optional
from datetime import date as date_t, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import get_current_user
from models.user import User
from models.molecular_advanced import SequencingRun, NovelPattern, GenomicPrediction
from services import book_service

router = APIRouter(prefix='/molecular-advanced', tags=['Molecular · Advanced'])

GENETICIST_ROLES = {'geneticist', 'molecular_scientist', 'lab_manager', 'super_admin', 'pathologist'}


def _gen_id(prefix: str, db: Session, model, field: str) -> str:
    year = date_t.today().year
    col  = getattr(model, field)
    n    = db.query(model).filter(col.like(f'{prefix}-{year}-%')).count()
    return f'{prefix}-{year}-{str(n+1).zfill(5)}'


# ── Sequencing runs ───────────────────────────────────────────────────────────

class RunIn(BaseModel):
    lab_request_id: Optional[int] = None
    patient_id:     Optional[int] = None
    pid:            Optional[str] = None
    ngs_type:       str
    panel_name:     Optional[str] = None
    sequencer:      Optional[str] = None
    library_kit:    Optional[str] = None
    flowcell_id:    Optional[str] = None
    target_coverage:Optional[float] = None


class QCIn(BaseModel):
    mean_coverage:   Optional[float] = None
    pct_above_20x:   Optional[float] = None
    q30_score:       Optional[float] = None
    total_reads_m:   Optional[float] = None
    mapping_rate:    Optional[float] = None
    duplication_rate:Optional[float] = None
    qc_pass:         bool = True


class VariantsIn(BaseModel):
    variants_found:      Optional[int] = None
    pathogenic_variants: Optional[int] = None
    vus_variants:        Optional[int] = None
    raw_vcf_path:        Optional[str] = None
    annotation_summary:  Optional[str] = None


@router.get('/runs')
def list_runs(
    ngs_type: Optional[str] = None,
    status:   Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db), _u: User = Depends(get_current_user),
):
    q = db.query(SequencingRun)
    if ngs_type: q = q.filter(SequencingRun.ngs_type == ngs_type)
    if status:   q = q.filter(SequencingRun.status == status)
    return q.order_by(desc(SequencingRun.created_at)).offset(skip).limit(limit).all()


@router.post('/runs', status_code=201)
def create_run(
    body: RunIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    r = SequencingRun(
        run_id = _gen_id('NGS', db, SequencingRun, 'run_id'),
        analyst_id = user.id,
        status = 'RUNNING',
        **body.model_dump(),
    )
    db.add(r); db.commit(); db.refresh(r)
    return r


@router.post('/runs/{rid}/qc')
def submit_qc(
    rid:  int,
    body: QCIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    r = db.query(SequencingRun).filter(SequencingRun.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    for k, v in body.model_dump(exclude_none=True).items(): setattr(r, k, v)
    r.status = 'VARIANT_CALLING' if r.qc_pass else 'FAILED'
    db.commit(); db.refresh(r)
    return r


@router.post('/runs/{rid}/variants')
def submit_variants(
    rid:  int,
    body: VariantsIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    r = db.query(SequencingRun).filter(SequencingRun.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    for k, v in body.model_dump(exclude_none=True).items(): setattr(r, k, v)
    if (r.pathogenic_variants or 0) > 0:
        r.flag = 'H'
    r.status = 'PENDING'
    db.commit(); db.refresh(r)
    return r


@router.post('/runs/{rid}/validate')
def validate_run(
    rid:  int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    if user.role not in GENETICIST_ROLES:
        raise HTTPException(403, 'Geneticist sign-off required')
    r = db.query(SequencingRun).filter(SequencingRun.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    if not r.qc_pass:
        raise HTTPException(400, 'Cannot validate a failed-QC run — repeat sequencing')
    book_service.lock_for_validation(r, user.id)
    db.commit(); db.refresh(r)
    return r


# ── Novel patterns ────────────────────────────────────────────────────────────

class NovelIn(BaseModel):
    run_id:           Optional[int] = None
    lab_request_id:   Optional[int] = None
    patient_id:       Optional[int] = None
    pid:              Optional[str] = None
    genome_position:  Optional[str] = None
    gene_name:        Optional[str] = None
    transcript:       Optional[str] = None
    mutation_type:    Optional[str] = None
    sequence_change:  Optional[str] = None
    organism:         Optional[str] = None
    database_match:   Optional[str] = None
    closest_match:    Optional[str] = None
    ai_confidence:    Optional[float] = None
    predicted_impact: Optional[str] = None
    alert_level:      Optional[str] = None


@router.get('/novel')
def list_novel(
    alert_level: Optional[str] = None,
    predicted_impact: Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db), _u: User = Depends(get_current_user),
):
    q = db.query(NovelPattern)
    if alert_level:      q = q.filter(NovelPattern.alert_level == alert_level)
    if predicted_impact: q = q.filter(NovelPattern.predicted_impact == predicted_impact)
    return q.order_by(desc(NovelPattern.created_at)).offset(skip).limit(limit).all()


@router.post('/novel', status_code=201)
def create_novel(
    body: NovelIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    is_crit = body.alert_level in {'Alert','Emergency'} or body.predicted_impact == 'Pathogenic'
    r = NovelPattern(
        novel_id = _gen_id('NOV', db, NovelPattern, 'novel_id'),
        assigned_geneticist_id = user.id,
        status = 'PENDING',
        flag = 'HH' if is_crit else ('H' if body.predicted_impact == 'Likely pathogenic' else None),
        is_critical = is_crit,
        **body.model_dump(),
    )
    db.add(r); db.commit(); db.refresh(r)
    return r


@router.post('/novel/{rid}/validate')
def validate_novel(
    rid:  int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    if user.role not in GENETICIST_ROLES:
        raise HTTPException(403, 'Geneticist review required')
    r = db.query(NovelPattern).filter(NovelPattern.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    book_service.lock_for_validation(r, user.id)
    db.commit(); db.refresh(r)
    if r.is_critical:
        book_service.archive_critical_if_needed(
            'molecular', r, user.id, db,
            test_name = f'Novel pattern · {r.gene_name or r.organism or "unknown"}',
            critical_reason = (r.alert_level or 'PATHOGENIC').upper(),
        )
    return r


# ── Genomic predictions ───────────────────────────────────────────────────────

class PredictionIn(BaseModel):
    run_id:                Optional[int] = None
    lab_request_id:        Optional[int] = None
    patient_id:            int
    pid:                   Optional[str] = None
    analysis_type:         str
    gene_target:           str
    mutation_detected:     Optional[str] = None
    zygosity:              Optional[str] = None
    acmg_class:            Optional[str] = None
    risk_score:            Optional[str] = None
    risk_percent:          Optional[float] = None
    clinical_significance: Optional[str] = None
    drug_metabolism_phenotype: Optional[str] = None
    recommended_action:    Optional[str] = None
    family_counselling:    Optional[str] = None


@router.get('/predictions')
def list_predictions(
    analysis_type: Optional[str] = None,
    acmg_class:    Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db), _u: User = Depends(get_current_user),
):
    q = db.query(GenomicPrediction)
    if analysis_type: q = q.filter(GenomicPrediction.analysis_type == analysis_type)
    if acmg_class:    q = q.filter(GenomicPrediction.acmg_class == acmg_class)
    return q.order_by(desc(GenomicPrediction.created_at)).offset(skip).limit(limit).all()


@router.post('/predictions', status_code=201)
def create_prediction(
    body: PredictionIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    is_crit = body.acmg_class in {'Pathogenic','Likely Pathogenic'}
    r = GenomicPrediction(
        prediction_id = _gen_id('GEN', db, GenomicPrediction, 'prediction_id'),
        geneticist_id = user.id,
        status = 'PENDING',
        flag = 'HH' if body.acmg_class == 'Pathogenic' else ('H' if body.acmg_class == 'Likely Pathogenic' else None),
        is_critical = is_crit,
        **body.model_dump(),
    )
    db.add(r); db.commit(); db.refresh(r)
    return r


@router.post('/predictions/{rid}/validate')
def validate_prediction(
    rid:  int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    if user.role not in GENETICIST_ROLES:
        raise HTTPException(403, 'Geneticist sign-off required')
    r = db.query(GenomicPrediction).filter(GenomicPrediction.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    book_service.lock_for_validation(r, user.id)
    db.commit(); db.refresh(r)
    if r.is_critical:
        book_service.archive_critical_if_needed(
            'molecular', r, user.id, db,
            test_name = f'{r.analysis_type} · {r.gene_target}',
            critical_reason = f'PATHOGENIC_{r.acmg_class.upper().replace(" ","_")}' if r.acmg_class else 'PATHOGENIC',
        )
    return r
