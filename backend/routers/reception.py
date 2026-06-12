"""
Reception router — OPD + IPD visits front-desk register.

  GET    /reception/visits                — list with type/status filters
  POST   /reception/visits                — register a walk-in or ward request
  PATCH  /reception/visits/{id}           — update (rejected if locked)
  POST   /reception/visits/{id}/received  — IPD: log when sample arrives
  POST   /reception/visits/{id}/validate  — close the visit
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
from models.reception import ReceptionVisit
from services import book_service


router = APIRouter(prefix='/reception', tags=['Reception'])


def _gen_visit_no(visit_type: str, db: Session) -> str:
    year = date_t.today().year
    prefix = visit_type.upper()
    n = db.query(ReceptionVisit).filter(
        ReceptionVisit.visit_no.like(f'{prefix}-{year}-%'),
    ).count()
    return f'{prefix}-{year}-{str(n+1).zfill(5)}'


class VisitIn(BaseModel):
    visit_type:    str = 'OPD'   # OPD|IPD|ED
    patient_id:    Optional[int] = None
    pid:           Optional[str] = None
    lid:           Optional[str] = None
    lab_request_id:Optional[int] = None
    patient_name:  Optional[str] = None
    age:           Optional[str] = None
    sex:           Optional[str] = None
    phone:         Optional[str] = None
    referring_doctor: Optional[str] = None
    attending_doctor: Optional[str] = None
    ward:          Optional[str] = None
    bed_number:    Optional[str] = None
    clinical_indication: Optional[str] = None
    tests_ordered: Optional[str] = None
    payment_method:Optional[str] = None
    amount_rwf:    Optional[float] = None
    urgency:       str = 'routine'
    notes:         Optional[str] = None


class VisitPatch(BaseModel):
    referring_doctor:   Optional[str] = None
    attending_doctor:   Optional[str] = None
    ward:               Optional[str] = None
    bed_number:         Optional[str] = None
    clinical_indication:Optional[str] = None
    tests_ordered:      Optional[str] = None
    payment_method:     Optional[str] = None
    amount_rwf:         Optional[float] = None
    urgency:            Optional[str] = None
    status:             Optional[str] = None
    notes:              Optional[str] = None


@router.get('/visits')
def list_visits(
    visit_type: Optional[str] = Query(None, description='OPD|IPD|ED'),
    status:     Optional[str] = None,
    date_from:  Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db), _u: User = Depends(get_current_user),
):
    q = db.query(ReceptionVisit)
    if visit_type: q = q.filter(ReceptionVisit.visit_type == visit_type.upper())
    if status:     q = q.filter(ReceptionVisit.status     == status)
    if date_from:  q = q.filter(func.date(ReceptionVisit.created_at) >= date_from)
    return q.order_by(desc(ReceptionVisit.created_at)).offset(skip).limit(limit).all()


@router.post('/visits', status_code=201)
def create_visit(
    body: VisitIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    if body.visit_type not in {'OPD', 'IPD', 'ED'}:
        raise HTTPException(400, 'visit_type must be OPD, IPD or ED')
    v = ReceptionVisit(
        visit_no = _gen_visit_no(body.visit_type, db),
        receptionist_id = user.id,
        status = 'REGISTERED',
        **body.model_dump(),
    )
    db.add(v); db.commit(); db.refresh(v)
    return v


@router.patch('/visits/{vid}')
def update_visit(
    vid:  int,
    body: VisitPatch,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    v = db.query(ReceptionVisit).filter(ReceptionVisit.id == vid).first()
    if not v: raise HTTPException(404)
    book_service.assert_mutable(v)
    for k, val in body.model_dump(exclude_none=True).items():
        setattr(v, k, val)
    db.commit(); db.refresh(v)
    return v


@router.post('/visits/{vid}/received')
def mark_received(
    vid:  int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    """IPD: log when ward sample physically arrives at lab reception."""
    v = db.query(ReceptionVisit).filter(ReceptionVisit.id == vid).first()
    if not v: raise HTTPException(404)
    book_service.assert_mutable(v)
    v.received_at = datetime.now(timezone.utc)
    v.received_by_id = user.id
    if v.status == 'REGISTERED': v.status = 'RECEIVED'
    db.commit(); db.refresh(v)
    return v


@router.post('/visits/{vid}/validate')
def validate_visit(
    vid:  int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    v = db.query(ReceptionVisit).filter(ReceptionVisit.id == vid).first()
    if not v: raise HTTPException(404)
    book_service.assert_mutable(v)
    book_service.lock_for_validation(v, user.id)
    db.commit(); db.refresh(v)
    return v
