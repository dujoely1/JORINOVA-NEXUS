"""
Shift Handover router — end-of-shift register.

  GET   /shifts/handovers                       — list (filter by date/dept/shift)
  POST  /shifts/handovers                       — outgoing staff opens an entry
  PATCH /shifts/handovers/{id}                  — update counters / notes (while OPEN)
  POST  /shifts/handovers/{id}/handover         — outgoing signs off → HANDED_OVER
  POST  /shifts/handovers/{id}/accept           — incoming signs → VALIDATED (locks)
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
from models.shift_handover import ShiftHandover
from services import book_service


router = APIRouter(prefix='/shifts', tags=['Shift Handover'])


def _gen_no(db: Session) -> str:
    year = date_t.today().year
    n = db.query(ShiftHandover).filter(ShiftHandover.handover_no.like(f'HO-{year}-%')).count()
    return f'HO-{year}-{str(n+1).zfill(5)}'


class HandoverIn(BaseModel):
    shift_date:        date_t
    shift:             str            # morning|afternoon|night
    department:        str            # ALL|HEM|BIOCHEM|MICRO|MOL|SERO|URN|BB|ANAPATH|TOX|RECEPTION
    outgoing_staff_name:Optional[str] = None
    incoming_staff_name:Optional[str] = None
    incoming_staff_id: Optional[int]  = None
    samples_received:  int           = 0
    samples_validated: int           = 0
    samples_pending:   int           = 0
    critical_results:  int           = 0
    rejected_samples:  int           = 0
    equipment_issues:  Optional[str] = None
    iqc_status:        Optional[str] = None
    iqc_failures:      int           = 0
    pending_tasks:     Optional[str] = None
    safety_incidents:  Optional[str] = None
    notes:             Optional[str] = None


class HandoverPatch(BaseModel):
    samples_received:  Optional[int] = None
    samples_validated: Optional[int] = None
    samples_pending:   Optional[int] = None
    critical_results:  Optional[int] = None
    rejected_samples:  Optional[int] = None
    equipment_issues:  Optional[str] = None
    iqc_status:        Optional[str] = None
    iqc_failures:      Optional[int] = None
    pending_tasks:     Optional[str] = None
    safety_incidents:  Optional[str] = None
    notes:             Optional[str] = None


@router.get('/handovers')
def list_handovers(
    department: Optional[str] = None,
    shift:      Optional[str] = None,
    date_from:  Optional[str] = None,
    status:     Optional[str] = None,
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db), _u: User = Depends(get_current_user),
):
    q = db.query(ShiftHandover)
    if department: q = q.filter(ShiftHandover.department == department)
    if shift:      q = q.filter(ShiftHandover.shift      == shift)
    if status:     q = q.filter(ShiftHandover.status     == status)
    if date_from:  q = q.filter(ShiftHandover.shift_date >= date_from)
    return q.order_by(desc(ShiftHandover.shift_date), desc(ShiftHandover.created_at)) \
            .offset(skip).limit(limit).all()


@router.post('/handovers', status_code=201)
def create_handover(
    body: HandoverIn,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    h = ShiftHandover(
        handover_no = _gen_no(db),
        outgoing_staff_id = user.id,
        outgoing_staff_name = body.outgoing_staff_name or f'{user.first_name} {user.last_name}'.strip(),
        status = 'OPEN',
        flag = 'H' if body.critical_results > 0 or body.iqc_failures > 0 else None,
        **body.model_dump(exclude={'outgoing_staff_name'}),
    )
    db.add(h); db.commit(); db.refresh(h)
    return h


@router.patch('/handovers/{hid}')
def update_handover(
    hid:  int,
    body: HandoverPatch,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    h = db.query(ShiftHandover).filter(ShiftHandover.id == hid).first()
    if not h: raise HTTPException(404)
    if h.status not in ('OPEN',):
        raise HTTPException(409, f'Handover is {h.status} — file an amendment instead.')
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(h, k, v)
    if (h.critical_results or 0) > 0 or (h.iqc_failures or 0) > 0:
        h.flag = 'H'
    db.commit(); db.refresh(h)
    return h


@router.post('/handovers/{hid}/handover')
def handover(
    hid:  int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    """Outgoing staff signs off → status HANDED_OVER."""
    h = db.query(ShiftHandover).filter(ShiftHandover.id == hid).first()
    if not h: raise HTTPException(404)
    if h.status != 'OPEN':
        raise HTTPException(409, f'Cannot hand over in status {h.status}')
    h.status = 'HANDED_OVER'
    db.commit(); db.refresh(h)
    return h


@router.post('/handovers/{hid}/accept')
def accept_handover(
    hid:  int,
    db:   Session = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    """Incoming staff accepts the handover → VALIDATED (locks the row)."""
    h = db.query(ShiftHandover).filter(ShiftHandover.id == hid).first()
    if not h: raise HTTPException(404)
    if h.status != 'HANDED_OVER':
        raise HTTPException(409, f'Cannot accept in status {h.status} — outgoing staff must sign off first')
    h.incoming_staff_id    = user.id
    h.incoming_staff_name  = h.incoming_staff_name or f'{user.first_name} {user.last_name}'.strip()
    h.incoming_signed_at   = datetime.now(timezone.utc)
    book_service.lock_for_validation(h, user.id)
    db.commit(); db.refresh(h)
    return h
