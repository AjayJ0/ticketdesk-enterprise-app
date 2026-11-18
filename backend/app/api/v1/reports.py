import csv
import io
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import require_agent_or_admin
from app.models.user import User
from app.models.ticket import TicketWorkRecord
from app.schemas.dashboard import AgentPerformanceItem
from app.services.analytics_service import (
    filter_tickets_by_date_range,
    generate_sla_report_data,
    generate_tickets_report_data,
    get_agent_performance_list,
    work_outcome,
)
from app.services.sla_service import evaluate_ticket_sla

router = APIRouter(prefix="/reports", tags=["Reports & Analytics"])


@router.get("/tickets")
def get_tickets_report(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
) -> Dict[str, Any]:
    return generate_tickets_report_data(db, start_date=start_date, end_date=end_date, current_user=current_user)


@router.get("/sla")
def get_sla_report(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
) -> Dict[str, Any]:
    return generate_sla_report_data(db, start_date=start_date, end_date=end_date, current_user=current_user)


@router.get("/agents", response_model=List[AgentPerformanceItem])
def get_agents_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
) -> List[AgentPerformanceItem]:
    return get_agent_performance_list(db, current_user)


@router.get("/export/csv")
def export_tickets_report_csv(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
) -> Response:
    tickets = filter_tickets_by_date_range(db, start_date=start_date, end_date=end_date, current_user=current_user)

    records = {(row.ticket_id, row.user_id): row for row in db.query(TicketWorkRecord).all()}
    actor = current_user if current_user.role == "agent" else None
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Ticket Number",
            "Subject",
            "Category",
            "Subcategory",
            "Priority",
            "Status",
            "Requester",
            "Requester Email",
            "Department",
            "Assigned Agent",
            "Support Team",
            "Affected Service",
            "SLA Health",
            "Created At (UTC)",
            "Resolved At (UTC)",
            "Transferred At (UTC)",
            "Team Received At (UTC)",
            "Work Started At (UTC)",
            "My Work Outcome" if actor else "Outcome",
            "Original SLA Started At (UTC)",
            "Original Resolution Due At (UTC)",
        ]
    )

    for t in tickets:
        sla = evaluate_ticket_sla(t)
        writer.writerow(
            [
                t.ticket_number,
                t.subject,
                t.category_rel.name if t.category_rel else "",
                t.subcategory or "",
                t.priority.upper(),
                t.status.upper(),
                t.requester.full_name if t.requester else "",
                t.requester.email if t.requester else "",
                t.department_rel.name if t.department_rel else "",
                t.assigned_agent.full_name if t.assigned_agent else "Unassigned",
                t.support_team_rel.name if t.support_team_rel else "",
                t.affected_service or "",
                sla.sla_health.upper(),
                t.created_at.isoformat() if t.created_at else "",
                t.resolved_at.isoformat() if t.resolved_at else "",
                t.transferred_at.isoformat() if t.transferred_at else "",
                t.team_received_at.isoformat() if t.team_received_at else "",
                t.work_started_at.isoformat() if t.work_started_at else "",
                work_outcome(t, actor, records),
                t.sla_started_at.isoformat() if t.sla_started_at else "",
                t.resolution_due_at.isoformat() if t.resolution_due_at else "",
            ]
        )

    csv_bytes = output.getvalue().encode("utf-8")
    headers = {
        "Content-Disposition": 'attachment; filename="ticketdesk_enterprise_report.csv"'
    }
    return Response(content=csv_bytes, media_type="text/csv", headers=headers)
