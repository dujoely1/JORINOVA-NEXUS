"""
Media storage abstraction — persistent image storage.

Render's free disk is ephemeral (files vanish on redeploy), so profile photos
must live in object storage to survive. This wraps that:

  • If CLOUDINARY_URL is set  → upload to Cloudinary, return the permanent
    https secure_url (persists across redeploys, served by Cloudinary's CDN).
  • Otherwise                 → save to the local <backend>/media folder and
    return a /media/... path (the existing behaviour — nothing breaks if cloud
    storage isn't configured yet).

Cloudinary auto-configures from the CLOUDINARY_URL env var on import, so no
extra wiring is needed beyond setting that one variable.
"""
from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path

log = logging.getLogger('alis_x.media')

_LOCAL_MEDIA = Path(__file__).resolve().parent.parent / 'media'


def is_cloud() -> bool:
    return bool(os.environ.get('CLOUDINARY_URL'))


def checksum(content: bytes) -> str:
    """SHA-256 of the bytes — stored alongside the image for integrity/audit."""
    return hashlib.sha256(content).hexdigest()


def save_image(content: bytes, filename: str, folder: str = 'staff_photos') -> str:
    """Persist image bytes and return a URL/path usable as profile_photo.

    Best-effort cloud: if a Cloudinary upload fails for any reason it falls back
    to local disk so an upload never hard-fails because of the storage layer.
    """
    public_id = filename.rsplit('.', 1)[0]

    if is_cloud():
        try:
            import cloudinary.uploader  # auto-configured from CLOUDINARY_URL
            res = cloudinary.uploader.upload(
                content,
                folder=f'jorinova/{folder}',
                public_id=public_id,
                overwrite=True,
                resource_type='image',
                # Auto resize + compress + format at the CDN edge.
                transformation=[{'width': 512, 'height': 512, 'crop': 'limit', 'quality': 'auto', 'fetch_format': 'auto'}],
            )
            url = res.get('secure_url')
            if url:
                log.info('Image stored in Cloudinary: %s', url)
                return url
            log.error('Cloudinary returned no secure_url; falling back to local.')
        except Exception as exc:                       # pragma: no cover
            log.error('Cloudinary upload failed (%s); falling back to local.', exc)

    # Local fallback (dev / cloud not configured)
    base = _LOCAL_MEDIA / folder
    base.mkdir(parents=True, exist_ok=True)
    (base / filename).write_bytes(content)
    return f'/media/{folder}/{filename}'
