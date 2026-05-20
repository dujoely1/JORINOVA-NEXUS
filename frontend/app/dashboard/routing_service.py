from sqlalchemy.orm import Session
from models.laboratory import LabRequest, OrderedTest
from models.worklist import WorklistEntry
from typing import Dict, List, Any
import logging
from ai_services.safety_guard import assess_command, DangerLevel

logger = logging.getLogger("routing_service")

class RoutingService:
    @staticmethod
    def get_workflow_mode(db: Session) -> str:
        from models.core_config import SystemSettings
        settings = db.query(SystemSettings).filter(SystemSettings.key == "routing_mode").first()
        return settings.value if settings else "SEMI_AUTO"

    @staticmethod
    def process_sample_scan(db: Session, sample_id: str) -> Dict[str, Any]:
        """
        Analyzes tests for a sample and determines routing.
        """
        request = db.query(LabRequest).filter(LabRequest.lab_id == sample_id).first()
        if not request:
            raise ValueError("Sample ID not found in system")

        # Get tests through OrderedTest relationship
        ordered_tests = db.query(OrderedTest).filter(OrderedTest.lab_request_id == request.id).all()
        
        test_data = []
        departments = set()
        
        for ot in ordered_tests:
            dept = ot.test.department if ot.test else "GENERAL"
            test_data.append({
                "id": ot.test_id,
                "name": ot.test.name if ot.test else "Unknown Test",
                "department": dept
            })
            departments.add(dept)

        mode = RoutingService.get_workflow_mode(db)
        
        # Logic: Manual mode always requires intervention
        if mode == "MANUAL":
            return {
                "multi_dept": True,
                "departments": list(departments),
                "tests": test_data,
                "message": "System is in Manual Mode. Please route tests.",
                "mode": mode
            }

        # Logic: Single department or FULL_AUTO mode
        if len(departments) <= 1 or mode == "FULL_AUTO":
            return {
                "multi_dept": False,
                "departments": list(departments),
                "tests": test_data,
                "mode": mode
            }

        # SEMI_AUTO or multi-department scan
        return {
            "multi_dept": True,
            "departments": list(departments),
            "tests": test_data,
            "message": "Sample requires multi-department processing.",
            "mode": mode
        }

    @staticmethod
    def confirm_routing(db: Session, sample_id: str, mode: str, user: Any):
        """
        Finalizes the routing decision and creates worklist entries.
        """
        from services.worklist_service import route_request_to_worklist
        
        # Security Audit for Manual Override
        if mode == "manual":
            safety = assess_command(f"Manual route sample {sample_id}", user.id, user.role)
            if safety.level == DangerLevel.DANGEROUS and user.role != "lab_manager":
                logger.warning(f"Safety Escalation: User {user.id} attempted manual route for {sample_id}")
                return {"status": "escalated", "message": "Manual routing requires supervisor approval."}

        request = db.query(LabRequest).filter(LabRequest.lab_id == sample_id).first()
        if not request:
            raise ValueError("Sample not found")
            
        if mode == "cancel":
            request.status = "on_hold"
            logger.info(f"Sample {sample_id} placed ON HOLD by user {user.id}")
            db.commit()
            return {"status": "on_hold"}

        # Trigger the existing worklist routing engine
        entries = route_request_to_worklist(db, request.id, user.id)
        
        # Log audit trail (ISO 15189 requirement)
        logger.info(f"Routing confirmed for {sample_id} by user {user.id}. Mode: {mode}")
        
        return {
            "status": "routed",
            "entries_count": len(entries),
            "departments": list(set(e.department for e in entries))
        }