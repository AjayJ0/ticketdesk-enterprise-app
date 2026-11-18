import csv
import io
import json
from typing import Optional
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import require_admin
from app.models.system import AuditLog
from app.models.user import User
from app.schemas.system import AuditLogResponse, PaginatedAuditLogsResponse

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


def _serialize_audit(log: AuditLog) -> AuditLogResponse:
    meta = {}
    if log.metadata_json:
        try:
            meta = json.loads(log.metadata_json)
        except Exception:
            meta = {}
    return AuditLogResponse(
        id=log.id,
        user_id=log.user_id,
        user_name=log.user.full_name if log.user else "System",
        user_email=log.user.email if log.user else None,
        user_role=log.user.role if log.user else "system",
        action=log.action,
        entity_type=log.entity_type,
        entity_id=log.entity_id,
        ip_address=log.ip_address,
        metadata=meta,
        created_at=log.created_at,
    )


def _build_filtered_audit_query(
    db: Session,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    search: Optional[str] = None,
):
    q = db.query(AuditLog)
    if action and action != "all":
        q = q.filter(AuditLog.action == action)
    if entity_type and entity_type != "all":
        q = q.filter(AuditLog.entity_type == entity_type)

    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                AuditLog.action.ilike(term),
                AuditLog.entity_id.ilike(term),
                AuditLog.metadata_json.ilike(term),
            )
        )
    return q


@router.get("", response_model=PaginatedAuditLogsResponse)
def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    action: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> PaginatedAuditLogsResponse:
    q = _build_filtered_audit_query(db, action=action, entity_type=entity_type, search=search)

    total = q.count()
    logs = (
        q.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    total_pages = max(1, (total + page_size - 1) // page_size)

    return PaginatedAuditLogsResponse(
        items=[_serialize_audit(item) for item in logs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/export/csv")
def export_audit_logs_csv(
    action: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Response:
    """Export filtered security and compliance audit logs as a CSV file."""
    q = _build_filtered_audit_query(db, action=action, entity_type=entity_type, search=search)
    logs = q.order_by(AuditLog.created_at.desc()).limit(5000).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Audit ID",
            "Timestamp (UTC)",
            "Actor Name",
            "Actor Email",
            "Actor Role",
            "Action",
            "Entity Type",
            "Entity ID",
            "IP Address",
            "Change Metadata (JSON)",
        ]
    )

    for log in logs:
        writer.writerow(
            [
                log.id,
                log.created_at.isoformat() if log.created_at else "",
                log.user.full_name if log.user else "System",
                log.user.email if log.user else "",
                (log.user.role if log.user else "system").upper(),
                log.action,
                log.entity_type,
                log.entity_id or "",
                log.ip_address or "127.0.0.1",
                log.metadata_json or "{}",
            ]
        )

    csv_bytes = output.getvalue().encode("utf-8")
    headers = {
        "Content-Disposition": 'attachment; filename="ticketdesk_audit_logs.csv"'
    }
    return Response(content=csv_bytes, media_type="text/csv", headers=headers)
