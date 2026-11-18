import json
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from app.models.system import AuditLog, Notification


def record_audit_log(
    db: Session,
    user_id: Optional[int],
    action: str,
    entity_type: str,
    entity_id: Optional[str | int] = None,
    metadata: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        ip_address=ip_address,
        user_agent=user_agent,
        metadata_json=json.dumps(metadata or {}),
    )
    db.add(entry)
    return entry


def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    ticket_id: Optional[int] = None,
    notification_type: str = "ticket_update",
) -> Notification:
    notif = Notification(
        user_id=user_id,
        ticket_id=ticket_id,
        title=title,
        message=message,
        notification_type=notification_type,
        is_read=False,
    )
    db.add(notif)
    return notif
