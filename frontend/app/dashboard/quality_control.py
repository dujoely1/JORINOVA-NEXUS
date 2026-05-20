WHAT ARE from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from core.database import Base
from datetime import datetime, timezone

class QCLot(Base):
    __tablename__ = "qc_lots"

    id = Column(Integer, primary_key=True, index=True)
    lot_number = Column(String, unique=True, index=True)
    analyte_name = Column(String)  # e.g., Glucose, Hemoglobin
    instrument_id = Column(String)
    expiry_date = Column(DateTime)
    
    # Target values for Levey-Jennings
    mean_value = Column(Float)
    standard_deviation = Column(Float)
    unit = Column(String)
    
    results = relationship("QCResult", back_populates="lot")

class QCResult(Base):
    __tablename__ = "qc_results"

    id = Column(Integer, primary_key=True, index=True)
    lot_id = Column(Integer, ForeignKey("qc_lots.id"))
    value = Column(Float)
    level = Column(Integer)  # 1, 2, or 3
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    entered_by_id = Column(Integer, ForeignKey("users.id"))
    
    # Westgard Evaluation
    status = Column(String)  # PASS, WARN, REJECT
    violation_rules = Column(JSON, nullable=True)  # List of broken rules e.g. ["1-3s", "R-4s"]
    corrective_action = Column(String, nullable=True)
    
    lot = relationship("QCLot", back_populates="results")
    analyst = relationship("User")