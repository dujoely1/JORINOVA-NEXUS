"""
Test rules loader — shared between FastAPI startup and migration scripts.
Keeps the shared module self-contained; does not import main.py or FastAPI.
"""
from __future__ import annotations

import logging
from sqlalchemy.orm import Session

from models.core_config import (
    Hospital,
    LaboratoryDepartment,
    TestCatalog,
    TestInterpretationRule,
    ReflexTestRule,
)

log = logging.getLogger('test_rules_loader')


async def load_test_rules(db: Session, hospital: Hospital) -> None:
    """Load department definitions, test catalog, interpretation rules, and reflex rules.

    Parameters
    ----------
    db:       active SQLAlchemy session
    hospital: Hospital record to attach departments to

    Returns
    -------
    None — commits on success, rolls back on failure.
    """
    from services.test_rules_data import DEPARTMENTS, TESTS, RULES, REFLEX

    dept_map: dict[str, LaboratoryDepartment] = {}
    for d in DEPARTMENTS:
        dept = LaboratoryDepartment(
            code=d['code'], name=d['name'], abbreviation=d['abbr'],
            color_hex=d['color'], order=d['order'], hospital_id=hospital.id,
        )
        db.add(dept)
        db.flush()
        dept_map[d['code']] = dept

    test_map: dict[str, TestCatalog] = {}
    for t in TESTS:
        code, name, short, dept_code, unit, specimen, tube, tat, price, ref, order = t
        dept = dept_map.get(dept_code)
        if not dept:
            continue
        test = TestCatalog(
            code=code, name=name, short_name=short, department_id=dept.id,
            unit=unit, specimen_type=specimen, tube_type=tube,
            tat_hours=tat, price=price, reference_range=ref,
            order_in_dept=order, is_active=True,
        )
        db.add(test)
        db.flush()
        test_map[code] = test

    for r in RULES:
        code, flag, interp, sig, causes, actions, req_doc, doc_msg, doc_urg = r
        test = test_map.get(code)
        if not test:
            continue
        db.add(TestInterpretationRule(
            test_id=test.id, flag_trigger=flag, interpretation=interp,
            clinical_significance=sig, possible_causes=causes,
            recommended_actions=actions, requires_doctor_confirmation=req_doc,
            doctor_message=doc_msg, doctor_urgency=doc_urg or '',
        ))

    for r in REFLEX:
        trig_code, trig_flag, sug_code, rtype, reason, dept_name, note = r
        trigger   = test_map.get(trig_code)
        suggested = test_map.get(sug_code)
        if not trigger or not suggested:
            continue
        db.add(ReflexTestRule(
            trigger_test_id=trigger.id, trigger_flag=trig_flag,
            suggested_test_id=suggested.id, suggestion_type=rtype,
            reason=reason, suggested_department=dept_name, note_to_doctor=note,
        ))

    db.commit()
    log.info('Test catalog loaded: %d departments, %d tests, rules applied.',
             len(dept_map), len(test_map))
