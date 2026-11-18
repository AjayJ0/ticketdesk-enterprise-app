from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.ticket import SLAPolicy, Ticket
from app.schemas.ticket import SLAStatusInfo


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def apply_sla_policy_to_ticket(db: Session, ticket: Ticket, base_time: datetime | None = None) -> None:
    """Attach the matching SLA policy for the ticket priority and calculate due timestamps."""
    policy = (
        db.query(SLAPolicy)
        .filter(SLAPolicy.priority == ticket.priority, SLAPolicy.is_active == True)  # noqa: E712
        .first()
    )
    start = ensure_utc(base_time or ticket.sla_started_at or datetime.now(timezone.utc))
    assert start is not None
    ticket.sla_started_at = start

    if policy:
        ticket.sla_policy_id = policy.id
        ticket.first_response_due_at = start + timedelta(minutes=policy.response_target_minutes)
        ticket.resolution_due_at = start + timedelta(minutes=policy.resolution_target_minutes)
    else:
        # Fallback defaults if no policy row is active
        defaults = {
            "critical": (15, 240),
            "high": (60, 480),
            "medium": (240, 1440),
            "low": (480, 2880),
        }
        resp_min, res_min = defaults.get(ticket.priority, (240, 1440))
        ticket.first_response_due_at = start + timedelta(minutes=resp_min)
        ticket.resolution_due_at = start + timedelta(minutes=res_min)


def evaluate_ticket_sla(ticket: Ticket, now: datetime | None = None) -> SLAStatusInfo:
    """Compute real-time SLA status, remaining minutes, and breach indicators."""
    current = ensure_utc(now or datetime.now(timezone.utc))
    assert current is not None

    policy = ticket.sla_policy
    policy_name = policy.name if policy else f"{ticket.priority.capitalize()} Priority SLA"
    resp_target = policy.response_target_minutes if policy else 240
    res_target = policy.resolution_target_minutes if policy else 1440

    first_resp_due = ensure_utc(ticket.first_response_due_at)
    first_resp_at = ensure_utc(ticket.first_responded_at)
    res_due = ensure_utc(ticket.resolution_due_at)
    resolved_at = ensure_utc(ticket.resolved_at)

    # Response breach check
    response_breached = bool(ticket.sla_response_breached)
    if first_resp_due:
        if first_resp_at and first_resp_at > first_resp_due:
            response_breached = True
        elif not first_resp_at and current > first_resp_due and ticket.status not in ("resolved", "closed", "transferred"):
            response_breached = True

    # Resolution breach & remaining time
    resolution_breached = bool(ticket.sla_resolution_breached)
    remaining_minutes: int | None = None
    is_overdue = False

    if res_due:
        if ticket.status in ("resolved", "closed", "transferred"):
            effective_end = (ensure_utc(ticket.transferred_at) or ensure_utc(ticket.closed_at) or ensure_utc(ticket.updated_at) or current) if ticket.transferred_at or ticket.status == "transferred" else (resolved_at or ensure_utc(ticket.closed_at) or current)
            assert effective_end is not None
            if effective_end > res_due:
                resolution_breached = True
            diff_sec = (res_due - effective_end).total_seconds()
            remaining_minutes = int(diff_sec // 60)
        else:
            diff_sec = (res_due - current).total_seconds()
            remaining_minutes = int(diff_sec // 60)
            if current > res_due:
                resolution_breached = True
                is_overdue = True

    if ticket.status in ("closed", "transferred"):
        sla_health = "closed"
    elif resolution_breached:
        sla_health = "breached"
    elif ticket.status == "transferred":
        sla_health = "within_sla"
    elif ticket.status in ("resolved", "closed"):
        sla_health = "met"
    elif remaining_minutes is not None and remaining_minutes <= max(30, int(res_target * 0.2)):
        sla_health = "at_risk"
    else:
        sla_health = "within_sla"

    return SLAStatusInfo(
        policy_name=policy_name,
        response_target_minutes=resp_target,
        resolution_target_minutes=res_target,
        first_response_due_at=first_resp_due,
        first_responded_at=first_resp_at,
        resolution_due_at=res_due,
        resolved_at=resolved_at,
        response_breached=response_breached,
        resolution_breached=resolution_breached,
        is_overdue=is_overdue,
        remaining_minutes=remaining_minutes,
        sla_health=sla_health,
    )
