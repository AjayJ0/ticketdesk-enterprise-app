from datetime import datetime, timezone
from fastapi import UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.core.exceptions import AppException
from app.models.enums import TicketStatus, VALID_STATUS_TRANSITIONS
from app.models.organization import Department, SupportTeam
from app.models.ticket import (
    Ticket,
    TicketAttachment,
    TicketCategory,
    TicketComment,
    TicketHistory,
)
from app.models.user import User
from app.schemas.ticket import (
    PaginatedTicketsResponse,
    TicketAssignRequest,
    TicketAttachmentResponse,
    TicketCommentCreateRequest,
    TicketCommentResponse,
    TicketCreateRequest,
    TicketDetailResponse,
    TicketHistoryResponse,
    TicketListItemResponse,
    TicketStatusUpdateRequest,
    TicketUpdateRequest,
)
from app.schemas.user import UserSummary
from app.services.audit_service import create_notification, record_audit_log
from app.services.sla_service import apply_sla_policy_to_ticket, ensure_utc, evaluate_ticket_sla
from app.storage.provider import (
    generate_stored_filename,
    get_storage_provider,
    validate_upload_file,
)
from app.core.config import settings


def build_user_summary(user: User | None) -> UserSummary | None:
    if not user:
        return None
    return UserSummary(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        employee_id=user.employee_id,
        job_title=user.job_title,
        role=user.role,
        department_name=user.department_rel.name if user.department_rel else None,
        support_team_name=user.support_team_rel.name if user.support_team_rel else None,
    )


def generate_next_ticket_number(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"TKT-{year}-"
    latest = (
        db.query(Ticket.ticket_number)
        .filter(Ticket.ticket_number.like(f"{prefix}%"))
        .order_by(Ticket.id.desc())
        .first()
    )
    next_seq = 1
    if latest and latest[0]:
        try:
            seq_str = latest[0].split("-")[-1]
            next_seq = int(seq_str) + 1
        except ValueError:
            count = db.query(func.count(Ticket.id)).scalar() or 0
            next_seq = count + 1
    else:
        count = db.query(func.count(Ticket.id)).scalar() or 0
        next_seq = count + 1

    while True:
        candidate = f"{prefix}{next_seq:04d}"
        exists = db.query(Ticket.id).filter(Ticket.ticket_number == candidate).first()
        if not exists:
            return candidate
        next_seq += 1


def check_ticket_access(ticket: Ticket, current_user: User) -> None:
    if current_user.role == "employee" and ticket.requester_id != current_user.id:
        raise AppException(
            message="You do not have permission to access another employee's ticket.",
            status_code=status.HTTP_403_FORBIDDEN,
            error_code="TICKET_ACCESS_DENIED",
        )


def serialize_ticket_list_item(ticket: Ticket, current_user: User) -> TicketListItemResponse:
    sla_info = evaluate_ticket_sla(ticket)
    visible_comments = [
        c for c in (ticket.comments or []) if current_user.role != "employee" or not c.is_internal
    ]
    requester_summary = build_user_summary(ticket.requester)
    assert requester_summary is not None
    return TicketListItemResponse(
        id=ticket.id,
        ticket_number=ticket.ticket_number,
        subject=ticket.subject,
        category_id=ticket.category_id,
        category_name=ticket.category_rel.name if ticket.category_rel else "General",
        subcategory=ticket.subcategory,
        priority=ticket.priority,
        status=ticket.status,
        requester=requester_summary,
        assigned_agent=build_user_summary(ticket.assigned_agent),
        department_name=ticket.department_rel.name if ticket.department_rel else None,
        support_team_name=ticket.support_team_rel.name if ticket.support_team_rel else None,
        affected_service=ticket.affected_service,
        resolution_due_at=ticket.resolution_due_at,
        is_overdue=sla_info.is_overdue,
        sla_health=sla_info.sla_health,
        comment_count=len(visible_comments),
        attachment_count=len(ticket.attachments or []),
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
    )


def serialize_ticket_detail(ticket: Ticket, current_user: User) -> TicketDetailResponse:
    base_item = serialize_ticket_list_item(ticket, current_user)
    sla_info = evaluate_ticket_sla(ticket)

    comments_out = []
    for c in ticket.comments or []:
        if current_user.role == "employee" and c.is_internal:
            continue
        author_summary = build_user_summary(c.author)
        assert author_summary is not None
        comments_out.append(
            TicketCommentResponse(
                id=c.id,
                ticket_id=c.ticket_id,
                author_id=c.author_id,
                author=author_summary,
                body=c.body,
                is_internal=c.is_internal,
                created_at=c.created_at,
                updated_at=c.updated_at,
            )
        )

    attachments_out = [
        TicketAttachmentResponse(
            id=a.id,
            ticket_id=a.ticket_id,
            uploaded_by_id=a.uploaded_by_id,
            uploaded_by_name=a.uploaded_by.full_name if a.uploaded_by else "User",
            original_filename=a.original_filename,
            content_type=a.content_type,
            file_size=a.file_size,
            storage_provider=a.storage_provider,
            created_at=a.created_at,
        )
        for a in (ticket.attachments or [])
    ]

    history_out = []
    for h in ticket.history or []:
        if current_user.role == "employee" and h.action == "INTERNAL_NOTE_ADDED":
            continue
        history_out.append(
            TicketHistoryResponse(
                id=h.id,
                ticket_id=h.ticket_id,
                actor_id=h.actor_id,
                actor_name=h.actor.full_name if h.actor else "System",
                actor_role=h.actor.role if h.actor else "system",
                action=h.action,
                field_name=h.field_name,
                old_value=h.old_value,
                new_value=h.new_value,
                description=h.description,
                created_at=h.created_at,
            )
        )

    return TicketDetailResponse(
        **base_item.model_dump(),
        description=ticket.description,
        department_id=ticket.department_id,
        support_team_id=ticket.support_team_id,
        reopened_count=ticket.reopened_count,
        sla=sla_info,
        comments=comments_out,
        attachments=attachments_out,
        history=history_out,
    )


def list_tickets_service(
    db: Session,
    current_user: User,
    page: int = 1,
    page_size: int = 15,
    search: str | None = None,
    status_filter: str | None = None,
    priority_filter: str | None = None,
    category_id: int | None = None,
    assigned_to_me: bool = False,
    my_tickets: bool = False,
    unassigned_only: bool = False,
    overdue_only: bool = False,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> PaginatedTicketsResponse:
    query = db.query(Ticket)

    # Enforce role-based scoping
    if current_user.role == "employee" or my_tickets:
        query = query.filter(Ticket.requester_id == current_user.id)
    elif assigned_to_me:
        query = query.filter(Ticket.assigned_agent_id == current_user.id)
    elif unassigned_only:
        query = query.filter(Ticket.assigned_agent_id.is_(None))

    if status_filter and status_filter != "all":
        query = query.filter(Ticket.status == status_filter)
    if priority_filter and priority_filter != "all":
        query = query.filter(Ticket.priority == priority_filter)
    if category_id:
        query = query.filter(Ticket.category_id == category_id)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Ticket.ticket_number.ilike(term),
                Ticket.subject.ilike(term),
                Ticket.description.ilike(term),
                Ticket.affected_service.ilike(term),
            )
        )

    if overdue_only:
        now = datetime.now(timezone.utc)
        query = query.filter(
            Ticket.status.notin_(["resolved", "closed"]),
            Ticket.resolution_due_at < now,
        )

    sort_map = {
        "created_at": Ticket.created_at,
        "updated_at": Ticket.updated_at,
        "priority": Ticket.priority,
        "status": Ticket.status,
        "resolution_due_at": Ticket.resolution_due_at,
        "ticket_number": Ticket.ticket_number,
    }
    sort_col = sort_map.get(sort_by, Ticket.created_at)
    if sort_order.lower() == "asc":
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())

    total = query.count()
    offset = (page - 1) * page_size
    tickets = query.offset(offset).limit(page_size).all()

    items = [serialize_ticket_list_item(t, current_user) for t in tickets]
    total_pages = max(1, (total + page_size - 1) // page_size)

    return PaginatedTicketsResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


def get_ticket_by_id_or_number(db: Session, ticket_identifier: str | int) -> Ticket:
    if isinstance(ticket_identifier, int) or str(ticket_identifier).isdigit():
        ticket = db.query(Ticket).filter(Ticket.id == int(ticket_identifier)).first()
    else:
        ticket = (
            db.query(Ticket)
            .filter(func.upper(Ticket.ticket_number) == str(ticket_identifier).upper())
            .first()
        )
    if not ticket:
        raise AppException(
            message=f"Ticket '{ticket_identifier}' was not found.",
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="TICKET_NOT_FOUND",
        )
    return ticket


def create_ticket_service(
    db: Session,
    payload: TicketCreateRequest,
    current_user: User,
    ip_address: str | None = None,
) -> Ticket:
    category = db.query(TicketCategory).filter(TicketCategory.id == payload.category_id).first()
    if not category:
        raise AppException(
            message="Selected ticket category does not exist.",
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code="INVALID_CATEGORY",
        )

    dept_id = payload.department_id or current_user.department_id
    now = datetime.now(timezone.utc)
    ticket_number = generate_next_ticket_number(db)

    ticket = Ticket(
        ticket_number=ticket_number,
        subject=payload.subject.strip(),
        description=payload.description.strip(),
        category_id=category.id,
        subcategory=payload.subcategory,
        priority=payload.priority,
        status=TicketStatus.OPEN.value,
        requester_id=current_user.id,
        department_id=dept_id,
        affected_service=payload.affected_service,
        sla_started_at=now,
        created_at=now,
        updated_at=now,
    )
    apply_sla_policy_to_ticket(db, ticket, base_time=now)
    db.add(ticket)
    db.flush()

    history = TicketHistory(
        ticket_id=ticket.id,
        actor_id=current_user.id,
        action="CREATED",
        field_name="status",
        old_value=None,
        new_value="open",
        description=f"Ticket {ticket.ticket_number} created by {current_user.full_name} with {ticket.priority.upper()} priority.",
        created_at=now,
    )
    db.add(history)

    create_notification(
        db=db,
        user_id=current_user.id,
        ticket_id=ticket.id,
        title=f"Ticket Created: {ticket.ticket_number}",
        message=f"Your support request '{ticket.subject}' has been logged and queued for assignment.",
        notification_type="ticket_created",
    )

    # Notify active agents/admins if critical priority
    if ticket.priority in ("critical", "high"):
        agents = (
            db.query(User)
            .join(User.role_rel)
            .filter(User.is_active == True, User.id != current_user.id)  # noqa: E712
            .all()
        )
        for u in agents:
            if u.role in ("agent", "admin"):
                create_notification(
                    db=db,
                    user_id=u.id,
                    ticket_id=ticket.id,
                    title=f"[{ticket.priority.upper()}] New Ticket {ticket.ticket_number}",
                    message=f"{current_user.full_name} reported: {ticket.subject}",
                    notification_type="high_priority_alert",
                )

    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="TICKET_CREATED",
        entity_type="ticket",
        entity_id=ticket.ticket_number,
        metadata={
            "ticket_id": ticket.id,
            "subject": ticket.subject,
            "priority": ticket.priority,
            "category": category.name,
        },
        ip_address=ip_address,
    )

    db.commit()
    db.refresh(ticket)
    return ticket


def update_ticket_service(
    db: Session,
    ticket: Ticket,
    payload: TicketUpdateRequest,
    current_user: User,
    ip_address: str | None = None,
) -> Ticket:
    check_ticket_access(ticket, current_user)
    now = datetime.now(timezone.utc)
    changes = []

    if payload.subject is not None and payload.subject.strip() != ticket.subject:
        old = ticket.subject
        ticket.subject = payload.subject.strip()
        changes.append(("subject", old, ticket.subject, "Updated ticket subject"))

    if payload.description is not None and payload.description.strip() != ticket.description:
        ticket.description = payload.description.strip()
        changes.append(("description", "previous", "updated", "Updated ticket description"))

    if payload.category_id is not None and payload.category_id != ticket.category_id:
        cat = db.query(TicketCategory).filter(TicketCategory.id == payload.category_id).first()
        if not cat:
            raise AppException("Invalid category ID.", status.HTTP_400_BAD_REQUEST, "INVALID_CATEGORY")
        old_cat = ticket.category_rel.name if ticket.category_rel else str(ticket.category_id)
        ticket.category_id = cat.id
        changes.append(("category", old_cat, cat.name, f"Changed category from {old_cat} to {cat.name}"))

    if payload.subcategory is not None and payload.subcategory != ticket.subcategory:
        old_sub = ticket.subcategory
        ticket.subcategory = payload.subcategory
        changes.append(("subcategory", old_sub, ticket.subcategory, f"Updated subcategory to {ticket.subcategory}"))

    if payload.affected_service is not None and payload.affected_service != ticket.affected_service:
        old_srv = ticket.affected_service
        ticket.affected_service = payload.affected_service
        changes.append(("affected_service", old_srv, ticket.affected_service, f"Updated affected service to {ticket.affected_service}"))

    if payload.priority is not None and payload.priority != ticket.priority:
        if current_user.role == "employee":
            raise AppException(
                message="Only IT Support Agents or Administrators can change ticket priority.",
                status_code=status.HTTP_403_FORBIDDEN,
                error_code="PRIORITY_CHANGE_FORBIDDEN",
            )
        old_prio = ticket.priority
        ticket.priority = payload.priority
        apply_sla_policy_to_ticket(db, ticket, base_time=ticket.sla_started_at)
        changes.append(("priority", old_prio, ticket.priority, f"Priority changed from {old_prio.upper()} to {ticket.priority.upper()}"))

        if ticket.requester_id != current_user.id:
            create_notification(
                db=db,
                user_id=ticket.requester_id,
                ticket_id=ticket.id,
                title=f"Priority Updated: {ticket.ticket_number}",
                message=f"Ticket priority was changed from {old_prio.upper()} to {ticket.priority.upper()}.",
                notification_type="priority_changed",
            )

        record_audit_log(
            db=db,
            user_id=current_user.id,
            action="TICKET_PRIORITY_CHANGED",
            entity_type="ticket",
            entity_id=ticket.ticket_number,
            metadata={"old_priority": old_prio, "new_priority": ticket.priority},
            ip_address=ip_address,
        )

    if payload.support_team_id is not None and payload.support_team_id != ticket.support_team_id:
        if current_user.role == "employee":
            raise AppException("Employees cannot reassign support teams.", status.HTTP_403_FORBIDDEN)
        team = db.query(SupportTeam).filter(SupportTeam.id == payload.support_team_id).first()
        old_team = ticket.support_team_rel.name if ticket.support_team_rel else "Unassigned"
        ticket.support_team_id = team.id if team else None
        new_team = team.name if team else "Unassigned"
        changes.append(("support_team", old_team, new_team, f"Support team changed to {new_team}"))

    for field_name, old_val, new_val, desc in changes:
        action_type = "PRIORITY_CHANGED" if field_name == "priority" else "UPDATED"
        db.add(
            TicketHistory(
                ticket_id=ticket.id,
                actor_id=current_user.id,
                action=action_type,
                field_name=field_name,
                old_value=str(old_val) if old_val is not None else None,
                new_value=str(new_val) if new_val is not None else None,
                description=desc,
                created_at=now,
            )
        )

    ticket.updated_at = now
    db.commit()
    db.refresh(ticket)
    return ticket


def update_ticket_status_service(
    db: Session,
    ticket: Ticket,
    payload: TicketStatusUpdateRequest,
    current_user: User,
    ip_address: str | None = None,
) -> Ticket:
    check_ticket_access(ticket, current_user)
    old_status = TicketStatus(ticket.status)
    new_status = TicketStatus(payload.status)

    if old_status == new_status:
        return ticket

    allowed_targets = VALID_STATUS_TRANSITIONS.get(old_status, set())
    if new_status not in allowed_targets:
        raise AppException(
            message=f"Invalid status transition from '{old_status.value}' to '{new_status.value}'.",
            status_code=status.HTTP_400_BAD_REQUEST,
            error_code="INVALID_STATUS_TRANSITION",
        )

    # Role check on status transition:
    # Employees can only reopen an eligible resolved ticket or close their own resolved ticket
    if current_user.role == "employee":
        if not (old_status == TicketStatus.RESOLVED and new_status in (TicketStatus.OPEN, TicketStatus.CLOSED)):
            raise AppException(
                message="Employees may only reopen or close a resolved ticket.",
                status_code=status.HTTP_403_FORBIDDEN,
                error_code="STATUS_CHANGE_FORBIDDEN",
            )

    now = datetime.now(timezone.utc)
    is_reopen = old_status in (TicketStatus.RESOLVED, TicketStatus.CLOSED) and new_status in (
        TicketStatus.OPEN,
        TicketStatus.IN_PROGRESS,
    )

    ticket.status = new_status.value
    ticket.updated_at = now

    if current_user.role in ("agent", "admin") and not ticket.first_responded_at:
        ticket.first_responded_at = now
        first_due = ensure_utc(ticket.first_response_due_at)
        if first_due and now > first_due:
            ticket.sla_response_breached = True

    if new_status == TicketStatus.RESOLVED:
        ticket.resolved_at = now
        res_due = ensure_utc(ticket.resolution_due_at)
        if res_due and now > res_due:
            ticket.sla_resolution_breached = True
    elif new_status == TicketStatus.CLOSED:
        ticket.closed_at = now
        if not ticket.resolved_at:
            ticket.resolved_at = now
    elif is_reopen:
        ticket.reopened_count = (ticket.reopened_count or 0) + 1
        ticket.resolved_at = None
        ticket.closed_at = None

    action_label = "REOPENED" if is_reopen else "STATUS_CHANGED"
    reason_suffix = f" (Reason: {payload.reason.strip()})" if payload.reason and payload.reason.strip() else ""
    desc = f"Status changed from {old_status.value.replace('_', ' ').title()} to {new_status.value.replace('_', ' ').title()} by {current_user.full_name}{reason_suffix}."

    db.add(
        TicketHistory(
            ticket_id=ticket.id,
            actor_id=current_user.id,
            action=action_label,
            field_name="status",
            old_value=old_status.value,
            new_value=new_status.value,
            description=desc,
            created_at=now,
        )
    )

    if payload.reason and payload.reason.strip():
        db.add(
            TicketComment(
                ticket_id=ticket.id,
                author_id=current_user.id,
                body=f"**Status changed to {new_status.value.replace('_', ' ').title()}**: {payload.reason.strip()}",
                is_internal=False,
                created_at=now,
                updated_at=now,
            )
        )

    # Notify requester if changed by agent/admin
    if ticket.requester_id != current_user.id:
        notif_type = "ticket_resolved" if new_status == TicketStatus.RESOLVED else "status_changed"
        create_notification(
            db=db,
            user_id=ticket.requester_id,
            ticket_id=ticket.id,
            title=f"Ticket {ticket.ticket_number}: {new_status.value.replace('_', ' ').title()}",
            message=desc,
            notification_type=notif_type,
        )
    # Notify assigned agent if employee reopened the ticket
    if is_reopen and ticket.assigned_agent_id and ticket.assigned_agent_id != current_user.id:
        create_notification(
            db=db,
            user_id=ticket.assigned_agent_id,
            ticket_id=ticket.id,
            title=f"Ticket Reopened: {ticket.ticket_number}",
            message=desc,
            notification_type="ticket_reopened",
        )

    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="TICKET_STATUS_CHANGED",
        entity_type="ticket",
        entity_id=ticket.ticket_number,
        metadata={
            "old_status": old_status.value,
            "new_status": new_status.value,
            "reopened": is_reopen,
            "reason": payload.reason,
        },
        ip_address=ip_address,
    )

    db.commit()
    db.refresh(ticket)
    return ticket


def assign_ticket_service(
    db: Session,
    ticket: Ticket,
    payload: TicketAssignRequest,
    current_user: User,
    ip_address: str | None = None,
) -> Ticket:
    if current_user.role not in ("agent", "admin"):
        raise AppException(
            message="Only IT Support Agents and Administrators can assign tickets.",
            status_code=status.HTTP_403_FORBIDDEN,
            error_code="ASSIGN_FORBIDDEN",
        )

    now = datetime.now(timezone.utc)
    old_agent_name = ticket.assigned_agent.full_name if ticket.assigned_agent else "Unassigned"

    target_agent: User | None = None
    if payload.assigned_agent_id is not None:
        target_agent = db.query(User).filter(User.id == payload.assigned_agent_id).first()
        if not target_agent or target_agent.role not in ("agent", "admin"):
            raise AppException(
                message="Selected assignee must be a valid IT Support Agent or Administrator.",
                status_code=status.HTTP_400_BAD_REQUEST,
                error_code="INVALID_AGENT",
            )
        ticket.assigned_agent_id = target_agent.id
        if payload.support_team_id is None and target_agent.support_team_id:
            ticket.support_team_id = target_agent.support_team_id
    else:
        ticket.assigned_agent_id = None

    if payload.support_team_id is not None:
        team = db.query(SupportTeam).filter(SupportTeam.id == payload.support_team_id).first()
        if not team:
            raise AppException("Support team not found.", status.HTTP_400_BAD_REQUEST, "INVALID_TEAM")
        ticket.support_team_id = team.id

    if target_agent and ticket.status == TicketStatus.OPEN.value:
        ticket.status = TicketStatus.ASSIGNED.value

    if not ticket.first_responded_at:
        ticket.first_responded_at = now
        first_due = ensure_utc(ticket.first_response_due_at)
        if first_due and now > first_due:
            ticket.sla_response_breached = True

    new_agent_name = target_agent.full_name if target_agent else "Unassigned"
    ticket.updated_at = now

    desc = f"Ticket assigned from {old_agent_name} to {new_agent_name} by {current_user.full_name}."
    if payload.note:
        desc += f" Note: {payload.note.strip()}"

    db.add(
        TicketHistory(
            ticket_id=ticket.id,
            actor_id=current_user.id,
            action="ASSIGNED",
            field_name="assigned_agent",
            old_value=old_agent_name,
            new_value=new_agent_name,
            description=desc,
            created_at=now,
        )
    )

    if target_agent and target_agent.id != current_user.id:
        create_notification(
            db=db,
            user_id=target_agent.id,
            ticket_id=ticket.id,
            title=f"Ticket Assigned to You: {ticket.ticket_number}",
            message=f"{current_user.full_name} assigned '{ticket.subject}' ({ticket.priority.upper()}) to you.",
            notification_type="ticket_assigned",
        )

    if ticket.requester_id != current_user.id and target_agent:
        create_notification(
            db=db,
            user_id=ticket.requester_id,
            ticket_id=ticket.id,
            title=f"Agent Assigned: {ticket.ticket_number}",
            message=f"{target_agent.full_name} has been assigned to your support ticket.",
            notification_type="ticket_assigned",
        )

    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="TICKET_ASSIGNED",
        entity_type="ticket",
        entity_id=ticket.ticket_number,
        metadata={
            "old_agent": old_agent_name,
            "new_agent": new_agent_name,
            "new_agent_id": target_agent.id if target_agent else None,
        },
        ip_address=ip_address,
    )

    db.commit()
    db.refresh(ticket)
    return ticket


def add_ticket_comment_service(
    db: Session,
    ticket: Ticket,
    payload: TicketCommentCreateRequest,
    current_user: User,
    ip_address: str | None = None,
) -> TicketComment:
    check_ticket_access(ticket, current_user)

    if payload.is_internal and current_user.role == "employee":
        raise AppException(
            message="Employees cannot post internal notes.",
            status_code=status.HTTP_403_FORBIDDEN,
            error_code="INTERNAL_NOTE_FORBIDDEN",
        )

    now = datetime.now(timezone.utc)
    comment = TicketComment(
        ticket_id=ticket.id,
        author_id=current_user.id,
        body=payload.body.strip(),
        is_internal=payload.is_internal,
        created_at=now,
        updated_at=now,
    )
    db.add(comment)

    if current_user.role in ("agent", "admin") and not payload.is_internal and not ticket.first_responded_at:
        ticket.first_responded_at = now
        first_due = ensure_utc(ticket.first_response_due_at)
        if first_due and now > first_due:
            ticket.sla_response_breached = True

    ticket.updated_at = now

    action_type = "INTERNAL_NOTE_ADDED" if payload.is_internal else "COMMENTED"
    desc = (
        f"Internal note added by {current_user.full_name}."
        if payload.is_internal
        else f"Public comment added by {current_user.full_name}."
    )
    db.add(
        TicketHistory(
            ticket_id=ticket.id,
            actor_id=current_user.id,
            action=action_type,
            field_name="comments",
            old_value=None,
            new_value="internal_note" if payload.is_internal else "public_comment",
            description=desc,
            created_at=now,
        )
    )

    # Notify relevant party on public comments
    if not payload.is_internal:
        if current_user.id != ticket.requester_id:
            create_notification(
                db=db,
                user_id=ticket.requester_id,
                ticket_id=ticket.id,
                title=f"New Reply on {ticket.ticket_number}",
                message=f"{current_user.full_name} commented on '{ticket.subject}'.",
                notification_type="comment_added",
            )
        if ticket.assigned_agent_id and current_user.id != ticket.assigned_agent_id:
            create_notification(
                db=db,
                user_id=ticket.assigned_agent_id,
                ticket_id=ticket.id,
                title=f"Requester Reply on {ticket.ticket_number}",
                message=f"{current_user.full_name} replied on '{ticket.subject}'.",
                notification_type="comment_added",
            )

    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="TICKET_COMMENT_ADDED",
        entity_type="ticket",
        entity_id=ticket.ticket_number,
        metadata={"is_internal": payload.is_internal},
        ip_address=ip_address,
    )

    db.commit()
    db.refresh(comment)
    return comment


async def upload_ticket_attachment_service(
    db: Session,
    ticket: Ticket,
    file: UploadFile,
    current_user: User,
    ip_address: str | None = None,
) -> TicketAttachment:
    check_ticket_access(ticket, current_user)

    content_bytes = await file.read()
    original_name, ext, size = validate_upload_file(file, content_bytes)
    stored_filename = generate_stored_filename(ext)
    content_type = file.content_type or "application/octet-stream"

    provider = get_storage_provider()
    storage_key = provider.save_file(
        ticket_number=ticket.ticket_number,
        stored_filename=stored_filename,
        content=content_bytes,
        content_type=content_type,
    )

    now = datetime.now(timezone.utc)
    attachment = TicketAttachment(
        ticket_id=ticket.id,
        uploaded_by_id=current_user.id,
        original_filename=original_name,
        stored_filename=stored_filename,
        storage_provider=settings.STORAGE_PROVIDER.lower(),
        storage_key=storage_key,
        content_type=content_type,
        file_size=size,
        created_at=now,
    )
    db.add(attachment)
    ticket.updated_at = now

    db.add(
        TicketHistory(
            ticket_id=ticket.id,
            actor_id=current_user.id,
            action="ATTACHMENT_ADDED",
            field_name="attachments",
            old_value=None,
            new_value=original_name,
            description=f"Attachment '{original_name}' ({size // 1024 or 1} KB) uploaded by {current_user.full_name}.",
            created_at=now,
        )
    )

    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="ATTACHMENT_UPLOADED",
        entity_type="ticket",
        entity_id=ticket.ticket_number,
        metadata={
            "filename": original_name,
            "file_size": size,
            "content_type": content_type,
            "storage_provider": settings.STORAGE_PROVIDER.lower(),
        },
        ip_address=ip_address,
    )

    db.commit()
    db.refresh(attachment)
    return attachment
