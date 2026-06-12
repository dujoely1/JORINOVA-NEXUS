"""
Toxicology router — drug screens, TDM, poisoning cases.

  Drug screen
    GET    /toxicology/drug-screen
    POST   /toxicology/drug-screen
    POST   /toxicology/drug-screen/{id}/confirmatory   — log GC-MS result
    POST   /toxicology/drug-screen/{id}/validate

  TDM
    GET    /toxicology/tdm
    POST   /toxicology/tdm
    POST   /toxicology/tdm/{id}/validate                — toxic → critical archive

  Poisoning
    GET    /toxicology/poisoning
    POST   /toxicology/poisoning
    POST   /toxicology/poisoning/{id}/validate          — severe/critical/death → critical archive
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
from models.toxicology import DrugScreenResult, TDMResult, PoisoningCase
from services import book_service

router = APIRouter(prefix='/toxicology', tags=['Toxicology'])


def _gen_id(prefix: str, db: Session, model, field: str) -> str:
    year = date_t.today().year
    col  = getattr(model, field)
    n    = db.query(model).filter(col.like(f'{prefix}-{year}-%')).count()
    return f'{prefix}-{year}-{str(n+1).zfill(5)}'


# ── Drug Screen ───────────────────────────────────────────────────────────────

class DrugScreenIn(BaseModel):
    lab_request_id: Optional[int] = None
    patient_id:     int
    pid:            Optional[str] = None
    panel_type:     str = 'Standard 5'
    chain_of_custody: bool = False
    cup_lot:        Optional[str] = None
    thc:            Optional[str] = None
    opiates:        Optional[str] = None
    cocaine:        Optional[str] = None
    amphetamines:   Optional[str] = None
    benzodiazepines:Optional[str] = None
    methadone:      Optional[str] = None
    mdma:           Optional[str] = None
    barbiturates:   Optional[str] = None
    pcp:            Optional[str] = None
    tricyclics:     Optional[str] = None
    creatinine_mg_dl: Optional[float] = None
    specimen_valid: bool = True
    notes:          Optional[str] = None


class ConfirmatoryIn(BaseModel):
    method: str  # GC-MS|LC-MS/MS
    result: str


@router.get('/drug-screen')
def list_drug_screens(
    overall_result: Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db), _u: User = Depends(get_current_user),
):
    q = db.query(DrugScreenResult)
    if overall_result: q = q.filter(DrugScreenResult.overall_result == overall_result)
    return q.order_by(desc(DrugScreenResult.created_at)).offset(skip).limit(limit).all()


@router.post('/drug-screen', status_code=201)
def create_drug_screen(
    body: DrugScreenIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    data = body.model_dump()
    # Compute overall result
    detected = [k for k, v in data.items()
                if k in {'thc','opiates','cocaine','amphetamines','benzodiazepines',
                         'methadone','mdma','barbiturates','pcp','tricyclics'}
                and v == 'Positive']
    data['overall_result'] = 'Positive' if detected else 'Negative'
    data['confirmatory_required'] = 'Yes - pending' if detected else 'No'

    r = DrugScreenResult(
        screen_id = _gen_id('UDS', db, DrugScreenResult, 'screen_id'),
        entered_by_id = user.id,
        status = 'PENDING',
        collection_time = datetime.now(timezone.utc),
        **data,
    )
    db.add(r); db.commit(); db.refresh(r)
    return r


@router.post('/drug-screen/{rid}/confirmatory')
def confirmatory(
    rid:  int,
    body: ConfirmatoryIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    r = db.query(DrugScreenResult).filter(DrugScreenResult.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    r.confirmatory_method = body.method
    r.confirmatory_result = body.result
    r.confirmatory_required = 'Completed'
    db.commit(); db.refresh(r)
    return r


@router.post('/drug-screen/{rid}/validate')
def validate_drug_screen(
    rid:  int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    r = db.query(DrugScreenResult).filter(DrugScreenResult.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    # Workplace/Forensic positive without confirmatory → block validation
    if (r.panel_type in {'Workplace','Forensic'}
        and r.overall_result == 'Positive'
        and r.confirmatory_required != 'Completed'):
        raise HTTPException(400, 'Forensic/workplace positives require confirmatory GC-MS before validation')
    book_service.lock_for_validation(r, user.id)
    db.commit(); db.refresh(r)
    return r


# ── TDM ───────────────────────────────────────────────────────────────────────

class TDMIn(BaseModel):
    lab_request_id: Optional[int] = None
    patient_id:     int
    pid:            Optional[str] = None
    drug_name:      str
    level_type:     str
    dose_time:      Optional[datetime] = None
    sample_time:    Optional[datetime] = None
    hours_post_dose:Optional[float] = None
    concentration:  Optional[float] = None
    unit:           Optional[str] = None
    therapeutic_low: Optional[float] = None
    therapeutic_high: Optional[float] = None
    therapeutic_range: Optional[str] = None
    notes:          Optional[str] = None


def _interpret_tdm(c: Optional[float], lo: Optional[float], hi: Optional[float]) -> Optional[str]:
    if c is None: return None
    if lo is not None and c < lo: return 'Sub-therapeutic'
    if hi is not None and c > hi: return 'Toxic'
    return 'Therapeutic'


@router.get('/tdm')
def list_tdm(
    drug_name: Optional[str] = None,
    interpretation: Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db), _u: User = Depends(get_current_user),
):
    q = db.query(TDMResult)
    if drug_name:       q = q.filter(TDMResult.drug_name == drug_name)
    if interpretation:  q = q.filter(TDMResult.interpretation == interpretation)
    return q.order_by(desc(TDMResult.created_at)).offset(skip).limit(limit).all()


@router.post('/tdm', status_code=201)
def create_tdm(
    body: TDMIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    interp = _interpret_tdm(body.concentration, body.therapeutic_low, body.therapeutic_high)
    r = TDMResult(
        tdm_id = _gen_id('TDM', db, TDMResult, 'tdm_id'),
        entered_by_id = user.id,
        status = 'PENDING',
        interpretation = interp,
        flag = 'HH' if interp == 'Toxic' else ('L' if interp == 'Sub-therapeutic' else None),
        is_critical = interp == 'Toxic',
        **body.model_dump(),
    )
    db.add(r); db.commit(); db.refresh(r)
    return r


@router.post('/tdm/{rid}/validate')
def validate_tdm(
    rid:  int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    r = db.query(TDMResult).filter(TDMResult.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    book_service.lock_for_validation(r, user.id)
    db.commit(); db.refresh(r)
    if r.interpretation == 'Toxic':
        book_service.archive_critical_if_needed(
            'laboratory', r, user.id, db,
            test_name = f'TDM · {r.drug_name}',
            result_value = f'{r.concentration} {r.unit or ""}'.strip(),
            reference = r.therapeutic_range,
        )
    return r


# ── Poisoning ─────────────────────────────────────────────────────────────────

class PoisonIn(BaseModel):
    lab_request_id: Optional[int] = None
    patient_id:     int
    pid:            Optional[str] = None
    poison_type:    str
    exposure_route: Optional[str] = None
    exposure_time:  Optional[datetime] = None
    intentional:    Optional[bool] = None
    result_value:   Optional[float] = None
    unit:           Optional[str] = None
    toxic_threshold:Optional[float] = None
    nomogram_zone:  Optional[str] = None
    severity:       Optional[str] = None
    antidote_given: Optional[str] = None
    antidote_time:  Optional[datetime] = None
    decontamination:Optional[str] = None
    clinical_management: Optional[str] = None
    outcome:        Optional[str] = None
    notes:          Optional[str] = None


@router.get('/poisoning')
def list_poisoning(
    severity: Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db), _u: User = Depends(get_current_user),
):
    q = db.query(PoisoningCase)
    if severity: q = q.filter(PoisoningCase.severity == severity)
    return q.order_by(desc(PoisoningCase.created_at)).offset(skip).limit(limit).all()


@router.post('/poisoning', status_code=201)
def create_poisoning(
    body: PoisonIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    sev = body.severity
    is_crit = sev in {'Severe','Critical'} or body.outcome == 'Death'
    r = PoisoningCase(
        case_no = _gen_id('POI', db, PoisoningCase, 'case_no'),
        entered_by_id = user.id,
        status = 'PENDING',
        flag = 'HH' if is_crit else ('H' if sev == 'Moderate' else None),
        is_critical = is_crit,
        **body.model_dump(),
    )
    db.add(r); db.commit(); db.refresh(r)
    return r


@router.post('/poisoning/{rid}/validate')
def validate_poisoning(
    rid:  int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    r = db.query(PoisoningCase).filter(PoisoningCase.id == rid).first()
    if not r: raise HTTPException(404)
    book_service.assert_mutable(r)
    book_service.lock_for_validation(r, user.id)
    db.commit(); db.refresh(r)
    if r.is_critical:
        book_service.archive_critical_if_needed(
            'laboratory', r, user.id, db,
            test_name = f'Poisoning · {r.poison_type}',
            result_value = f'{r.result_value or ""} {r.unit or ""} · {r.severity or ""} · {r.outcome or ""}'.strip(),
        )
    return r
