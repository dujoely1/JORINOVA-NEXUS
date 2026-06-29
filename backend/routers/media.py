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
from models.user import UserPhoto, ProfilePhotoHistory

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


@router.get('/photo-history/{hid}')
def get_history_image(hid: int, db: Session = Depends(get_db)):
    h = db.query(ProfilePhotoHistory).filter(ProfilePhotoHistory.id == hid).first()
    if not h or not h.data:
        raise HTTPException(status_code=404, detail='Not found')
    return Response(content=h.data, media_type=h.content_type or 'image/jpeg',
                    headers={'Cache-Control': 'public, max-age=86400'})


@router.get('/anapath-image/{img_id}')
def get_anapath_image(img_id: int, db: Session = Depends(get_db)):
    from models.anapath import AnapathImage
    r = db.query(AnapathImage).filter(AnapathImage.id == img_id).first()
    if not r or not r.data:
        raise HTTPException(status_code=404, detail='Not found')
    return Response(content=r.data, media_type=r.content_type or 'image/jpeg',
                    headers={'Cache-Control': 'public, max-age=86400'})
