"""
Public media — serves profile-photo bytes stored in the database.

Profile photos live in the user_photos table (so they survive redeploys without
any external storage account). This endpoint streams them back so an <img> tag
can load them directly (no auth header needed — avatars are low-sensitivity and
are shown throughout the UI anyway). Returns 404 when there is no photo, which
lets the frontend Avatar fall back to the role-coloured initials bubble.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core.database import get_db
from models.user import UserPhoto

router = APIRouter(prefix='/public', tags=['Public Media'])


@router.get('/users/{uid}/avatar')
def get_avatar(uid: int, db: Session = Depends(get_db)):
    photo = db.query(UserPhoto).filter(UserPhoto.user_id == uid).first()
    if not photo or not photo.data:
        raise HTTPException(status_code=404, detail='No photo')
    return Response(
        content=photo.data,
        media_type=photo.content_type or 'image/jpeg',
        headers={'Cache-Control': 'public, max-age=3600'},   # cache; ?v=checksum busts it on change
    )
