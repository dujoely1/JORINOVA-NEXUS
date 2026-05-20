from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from core.database import get_db
from core.security import get_current_user
from models.user import User
from services.routing_service import RoutingService

router = APIRouter(prefix="/api/routing", tags=["Smart Routing"])

@router.post("/scan/{sample_id}")
async def scan_sample(
    sample_id: str, 
    db: Session = Depends(get_db), 
    user: User = Depends(get_current_user)
):
    try:
        return RoutingService.process_sample_scan(db, sample_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal routing error")

@router.post("/confirm")
async def confirm_routing(
    payload: dict, 
    db: Session = Depends(get_db), 
    user: User = Depends(get_current_user)
):
    sample_id = payload.get("sample_id")
    mode = payload.get("mode") # all | manual | cancel
    
    if not sample_id or not mode:
        raise HTTPException(status_code=400, detail="Missing sample_id or mode")
        
    try:
        return RoutingService.confirm_routing(db, sample_id, mode, user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))