from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from app.models.organization import Role
from app.models.ticket import Ticket, TicketCategory
from app.models.user import User
from app.schemas.dashboard import (
    AgentPerformanceItem,
    DashboardDistributionResponse,
    DashboardSummaryResponse,
    DashboardTrendsResponse,
    DistributionItem,
    TrendPoint,
)
from app.services.sla_service import ensure_utc, evaluate_ticket_sla
from app.services.ticket_service import serialize_ticket_list_item


def _scoped_tickets_query(db: Session, current_user: User):
    q = db.query(Ticket)
    if current_user.role == "employee":
        q = q.filter(Ticket.requester_id == current_user.id)
    return q


def get_dashboard_summary_service(db: Session, current_user: User) -> DashboardSummaryResponse:
    tickets: List[Ticket] = _scoped_tickets_query(db, current_user).all()
    now = datetime.now(timezone.utc)

    total = len(tickets)
    open_c = sum(1 for t in tickets if t.status == "open")
    assigned_c = sum(1 for t in tickets if t.status == "assigned")
    in_progress_c = sum(1 for t in tickets if t.status == "in_progress")
    pending_c = sum(1 for t in tickets if t.status == "pending")
    resolved_c = sum(1 for t in tickets if t.status == "resolved")
    closed_c = sum(1 for t in tickets if t.status == "closed")

    overdue_c = 0
    sla_compliant_c = 0
    resolution_durations_hours: List[float] = []

    for t in tickets:
        sla_info = evaluate_ticket_sla(t, now=now)
        if sla_info.is_overdue:
            overdue_c += 1
        if not sla_info.resolution_breached:
            sla_compliant_c += 1

        if t.resolved_at and t.created_at:
            start_dt = ensure_utc(t.created_at)
            end_dt = ensure_utc(t.resolved_at)
            if start_dt and end_dt and end_dt >= start_dt:
                resolution_durations_hours.append((end_dt - start_dt).total_seconds() / 3600.0)

    avg_res_hours = (
        round(sum(resolution_durations_hours) / len(resolution_durations_hours), 2)
        if resolution_durations_hours
        else 0.0
    )
    sla_compliance_pct = round((sla_compliant_c / total) * 100.0, 1) if total > 0 else 100.0

    my_assigned = sum(
        1 for t in tickets if t.assigned_agent_id == current_user.id and t.status not in ("resolved", "closed")
    )
    unassigned_queue = sum(
        1 for t in tickets if t.assigned_agent_id is None and t.status not in ("resolved", "closed")
    )

    return DashboardSummaryResponse(
        total_tickets=total,
        open_tickets=open_c,
        assigned_tickets=assigned_c,
        in_progress_tickets=in_progress_c,
        pending_tickets=pending_c,
        resolved_tickets=resolved_c,
        closed_tickets=closed_c,
        overdue_tickets=overdue_c,
        avg_resolution_hours=avg_res_hours,
        sla_compliance_percentage=sla_compliance_pct,
        my_assigned_count=my_assigned,
        unassigned_queue_count=unassigned_queue,
    )


def get_dashboard_trends_service(db: Session, current_user: User) -> DashboardTrendsResponse:
    tickets: List[Ticket] = _scoped_tickets_query(db, current_user).all()
    now = datetime.now(timezone.utc)

    # 1. Daily trend (last 14 days)
    daily_points: List[TrendPoint] = []
    for i in range(13, -1, -1):
        day = (now - timedelta(days=i)).date()
        created_c = 0
        resolved_c = 0
        for t in tickets:
            c_dt = ensure_utc(t.created_at)
            if c_dt and c_dt.date() == day:
                created_c += 1
            r_dt = ensure_utc(t.resolved_at)
            if r_dt and r_dt.date() == day:
                resolved_c += 1
        daily_points.append(
            TrendPoint(
                label=day.strftime("%b %d"),
                date=day.isoformat(),
                created=created_c,
                resolved=resolved_c,
            )
        )

    # 2. Weekly trend (last 8 weeks)
    weekly_points: List[TrendPoint] = []
    today_date = now.date()
    start_of_this_week = today_date - timedelta(days=today_date.weekday())
    for w in range(7, -1, -1):
        wk_start = start_of_this_week - timedelta(weeks=w)
        wk_end = wk_start + timedelta(days=6)
        created_c = 0
        resolved_c = 0
        for t in tickets:
            c_dt = ensure_utc(t.created_at)
            if c_dt and wk_start <= c_dt.date() <= wk_end:
                created_c += 1
            r_dt = ensure_utc(t.resolved_at)
            if r_dt and wk_start <= r_dt.date() <= wk_end:
                resolved_c += 1
        weekly_points.append(
            TrendPoint(
                label=f"Wk {wk_start.strftime('%b %d')}",
                date=wk_start.isoformat(),
                created=created_c,
                resolved=resolved_c,
            )
        )

    # 3. Monthly trend (last 6 months)
    monthly_points: List[TrendPoint] = []
    for m in range(5, -1, -1):
        year = now.year
        month = now.month - m
        while month <= 0:
            month += 12
            year -= 1
        created_c = 0
        resolved_c = 0
        for t in tickets:
            c_dt = ensure_utc(t.created_at)
            if c_dt and c_dt.year == year and c_dt.month == month:
                created_c += 1
            r_dt = ensure_utc(t.resolved_at)
            if r_dt and r_dt.year == year and r_dt.month == month:
                resolved_c += 1
        month_label = datetime(year, month, 1).strftime("%b %Y")
        monthly_points.append(
            TrendPoint(
                label=month_label,
                date=f"{year:04d}-{month:02d}-01",
                created=created_c,
                resolved=resolved_c,
            )
        )

    return DashboardTrendsResponse(
        daily=daily_points,
        weekly=weekly_points,
        monthly=monthly_points,
    )


def get_dashboard_distribution_service(db: Session, current_user: User) -> DashboardDistributionResponse:
    tickets: List[Ticket] = (
        _scoped_tickets_query(db, current_user)
        .order_by(Ticket.created_at.desc())
        .all()
    )
    total = len(tickets) or 1

    # Status distribution
    status_labels = [
        ("open", "Open"),
        ("assigned", "Assigned"),
        ("in_progress", "In Progress"),
        ("pending", "Pending"),
        ("resolved", "Resolved"),
        ("closed", "Closed"),
    ]
    by_status = []
    for key, label in status_labels:
        val = sum(1 for t in tickets if t.status == key)
        by_status.append(
            DistributionItem(
                name=label,
                key=key,
                value=val,
                percentage=round((val / total) * 100.0, 1),
            )
        )

    # Priority distribution
    priority_labels = [
        ("critical", "Critical"),
        ("high", "High"),
        ("medium", "Medium"),
        ("low", "Low"),
    ]
    by_priority = []
    for key, label in priority_labels:
        val = sum(1 for t in tickets if t.priority == key)
        by_priority.append(
            DistributionItem(
                name=label,
                key=key,
                value=val,
                percentage=round((val / total) * 100.0, 1),
            )
        )

    # Category distribution
    categories = db.query(TicketCategory).order_by(TicketCategory.id.asc()).all()
    by_category = []
    for cat in categories:
        val = sum(1 for t in tickets if t.category_id == cat.id)
        by_category.append(
            DistributionItem(
                name=cat.name,
                key=cat.slug,
                value=val,
                percentage=round((val / total) * 100.0, 1),
            )
        )

    # Recent tickets (up to 8)
    recent_tickets = [serialize_ticket_list_item(t, current_user) for t in tickets[:8]]

    # Agent performance (all active agents + admins handling tickets)
    agent_performance = get_agent_performance_list(db)

    return DashboardDistributionResponse(
        by_status=by_status,
        by_priority=by_priority,
        by_category=by_category,
        recent_tickets=recent_tickets,
        agent_performance=agent_performance,
    )


def get_agent_performance_list(db: Session) -> List[AgentPerformanceItem]:
    agents = (
        db.query(User)
        .join(Role, User.role_id == Role.id)
        .filter(Role.name.in_(["agent", "admin"]), User.is_active == True)  # noqa: E712
        .order_by(User.id.asc())
        .all()
    )
    all_tickets = db.query(Ticket).all()
    now = datetime.now(timezone.utc)

    items: List[AgentPerformanceItem] = []
    for agent in agents:
        agent_tickets = [t for t in all_tickets if t.assigned_agent_id == agent.id]
        if not agent_tickets and agent.role == "admin":
            continue
        assigned_total = len(agent_tickets)
        resolved_count = sum(1 for t in agent_tickets if t.status in ("resolved", "closed"))
        pending_workload = sum(1 for t in agent_tickets if t.status not in ("resolved", "closed"))

        compliant = 0
        res_hours: List[float] = []
        for t in agent_tickets:
            sla = evaluate_ticket_sla(t, now=now)
            if not sla.resolution_breached:
                compliant += 1
            if t.resolved_at and t.created_at:
                s_dt = ensure_utc(t.created_at)
                e_dt = ensure_utc(t.resolved_at)
                if s_dt and e_dt and e_dt >= s_dt:
                    res_hours.append((e_dt - s_dt).total_seconds() / 3600.0)

        sla_rate = round((compliant / assigned_total) * 100.0, 1) if assigned_total > 0 else 100.0
        avg_hrs = round(sum(res_hours) / len(res_hours), 2) if res_hours else 0.0

        items.append(
            AgentPerformanceItem(
                agent_id=agent.id,
                agent_name=agent.full_name,
                email=agent.email,
                support_team=agent.support_team_rel.name if agent.support_team_rel else "Enterprise IT",
                assigned_total=assigned_total,
                resolved_count=resolved_count,
                pending_workload=pending_workload,
                sla_compliance_rate=sla_rate,
                avg_resolution_hours=avg_hrs,
            )
        )
    return items


def filter_tickets_by_date_range(
    db: Session,
    start_date: str | None = None,
    end_date: str | None = None,
) -> List[Ticket]:
    q = db.query(Ticket)
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
            q = q.filter(Ticket.created_at >= start_dt)
        except ValueError:
            pass
    if end_date:
        try:
            end_dt = (datetime.fromisoformat(end_date) + timedelta(days=1)).replace(tzinfo=timezone.utc)
            q = q.filter(Ticket.created_at < end_dt)
        except ValueError:
            pass
    return q.order_by(Ticket.created_at.desc()).all()


def generate_tickets_report_data(
    db: Session,
    start_date: str | None = None,
    end_date: str | None = None,
) -> Dict[str, Any]:
    tickets = filter_tickets_by_date_range(db, start_date, end_date)
    total = len(tickets)
    resolved_or_closed = sum(1 for t in tickets if t.status in ("resolved", "closed"))
    open_or_active = total - resolved_or_closed
    resolution_rate = round((resolved_or_closed / total) * 100.0, 1) if total > 0 else 0.0

    # Volume by date
    by_date_map: Dict[str, Dict[str, int]] = {}
    for t in tickets:
        c_dt = ensure_utc(t.created_at)
        if c_dt:
            d_str = c_dt.date().isoformat()
            by_date_map.setdefault(d_str, {"created": 0, "resolved": 0})
            by_date_map[d_str]["created"] += 1
        r_dt = ensure_utc(t.resolved_at)
        if r_dt:
            r_str = r_dt.date().isoformat()
            by_date_map.setdefault(r_str, {"created": 0, "resolved": 0})
            by_date_map[r_str]["resolved"] += 1

    volume_by_date = [
        {"date": d, "created": vals["created"], "resolved": vals["resolved"]}
        for d, vals in sorted(by_date_map.items())
    ]

    categories = db.query(TicketCategory).all()
    by_category = [
        {"category": c.name, "count": sum(1 for t in tickets if t.category_id == c.id)}
        for c in categories
    ]

    by_priority = [
        {"priority": p.capitalize(), "count": sum(1 for t in tickets if t.priority == p)}
        for p in ("critical", "high", "medium", "low")
    ]

    return {
        "total_tickets": total,
        "open_vs_closed": {
            "active": open_or_active,
            "resolved_or_closed": resolved_or_closed,
            "resolution_rate_percentage": resolution_rate,
        },
        "volume_by_date": volume_by_date,
        "by_category": by_category,
        "by_priority": by_priority,
    }


def generate_sla_report_data(
    db: Session,
    start_date: str | None = None,
    end_date: str | None = None,
) -> Dict[str, Any]:
    tickets = filter_tickets_by_date_range(db, start_date, end_date)
    now = datetime.now(timezone.utc)

    priority_breakdown = []
    total_compliant = 0
    total_breached = 0
    res_hours_all: List[float] = []

    for p in ("critical", "high", "medium", "low"):
        p_tickets = [t for t in tickets if t.priority == p]
        p_total = len(p_tickets)
        p_compliant = 0
        p_breached = 0
        p_hours: List[float] = []

        for t in p_tickets:
            sla = evaluate_ticket_sla(t, now=now)
            if sla.resolution_breached:
                p_breached += 1
                total_breached += 1
            else:
                p_compliant += 1
                total_compliant += 1

            if t.resolved_at and t.created_at:
                s_dt = ensure_utc(t.created_at)
                e_dt = ensure_utc(t.resolved_at)
                if s_dt and e_dt and e_dt >= s_dt:
                    hrs = (e_dt - s_dt).total_seconds() / 3600.0
                    p_hours.append(hrs)
                    res_hours_all.append(hrs)

        priority_breakdown.append(
            {
                "priority": p.capitalize(),
                "total": p_total,
                "compliant": p_compliant,
                "breached": p_breached,
                "compliance_percentage": round((p_compliant / p_total) * 100.0, 1) if p_total > 0 else 100.0,
                "avg_resolution_hours": round(sum(p_hours) / len(p_hours), 2) if p_hours else 0.0,
            }
        )

    total = len(tickets)
    overall_compliance = round((total_compliant / total) * 100.0, 1) if total > 0 else 100.0
    avg_res = round(sum(res_hours_all) / len(res_hours_all), 2) if res_hours_all else 0.0

    return {
        "total_evaluated": total,
        "compliant_count": total_compliant,
        "breached_count": total_breached,
        "overall_compliance_percentage": overall_compliance,
        "average_resolution_hours": avg_res,
        "by_priority": priority_breakdown,
    }
