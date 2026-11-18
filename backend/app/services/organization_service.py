import hashlib
import re
from fastapi import status
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.exceptions import AppException
from app.models.organization import Department, SupportTeam
from app.services.audit_service import record_audit_log


def resolve_user_organization(db: Session, model, entity_id: int | None, name: str | None, actor_id: int):
    """Resolve/create organization rows inside the caller's account transaction."""
    label = "department" if model is Department else "support team"
    if entity_id is not None and name is not None:
        raise AppException(f"Choose an existing {label} or enter a new name, not both.", status.HTTP_400_BAD_REQUEST)
    if entity_id is None and name is None:
        return None
    if entity_id is not None:
        row = db.get(model, entity_id)
        if not row or not row.is_active:
            raise AppException(f"Select a valid active {label}.", status.HTTP_400_BAD_REQUEST)
        return row.id
    clean = " ".join(name.split())
    row = db.query(model).filter(func.lower(func.trim(model.name)) == clean.lower()).first()
    if row:
        if not row.is_active:
            raise AppException(f"This {label} exists but is inactive. Choose an active entry.", status.HTTP_409_CONFLICT)
        return row.id
    # Same normalized name gets the same unique code even across concurrent retries.
    # Codes remain within the existing organization model's 30-character limit.
    prefix = re.sub(r"[^A-Z0-9]+", "-", clean.upper()).strip("-")[:20] or ("DEPT" if model is Department else "TEAM")
    digest = hashlib.sha256(clean.casefold().encode("utf-8")).hexdigest()[:8].upper()
    row = model(name=clean, code=f"{prefix}_{digest}", is_active=True)
    db.add(row)
    db.flush()
    record_audit_log(db, user_id=actor_id,
        action="DEPARTMENT_CREATED" if model is Department else "SUPPORT_TEAM_CREATED",
        entity_type="department" if model is Department else "support_team",
        entity_id=row.code, metadata={"name": clean, "source": "account_creation"})
    return row.id
