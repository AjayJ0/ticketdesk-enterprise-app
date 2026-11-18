from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import AppException
from app.models.system import Notification
from app.models.user import User
from app.schemas.system import NotificationListResponse, NotificationResponse

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _serialize_notification(n: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=n.id,
        user_id=n.user_id,
        ticket_id=n.ticket_id,
        ticket_number=n.ticket.ticket_number if n.ticket else None,
        title=n.title,
        message=n.message,
        notification_type=n.notification_type,
        is_read=n.is_read,
        read_at=n.read_at,
        created_at=n.created_at,
    )


@router.get("", response_model=NotificationListResponse)
def list_my_notifications(
    limit: int = Query(30, ge=1, le=100),
    unread_only: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationListResponse:
    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        q = q.filter(Notification.is_read == False)  # noqa: E712

    total = q.count()
    unread_count = (
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == current_user.id, Notification.is_read == False)  # noqa: E712
        .scalar()
        or 0
    )
    items = q.order_by(Notification.created_at.desc()).limit(limit).all()

    return NotificationListResponse(
        items=[_serialize_notification(n) for n in items],
        unread_count=unread_count,
        total=total,
    )


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationResponse:
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .first()
    )
    if not notif:
        raise AppException("Notification not found.", status.HTTP_404_NOT_FOUND)

    if not notif.is_read:
        notif.is_read = True
        notif.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notif)

    return _serialize_notification(notif)


@router.post("/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    now = datetime.now(timezone.utc)
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.is_read == False)  # noqa: E712
        .update({"is_read": True, "read_at": now})
    )
    db.commit()
    return {"success": True, "updated_count": updated}
