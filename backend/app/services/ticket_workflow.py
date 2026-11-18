from datetime import datetime, timezone
from uuid import uuid4
from fastapi import status
from sqlalchemy import or_, update
from sqlalchemy.orm import Session
from app.core.exceptions import AppException
from app.models.ticket import Ticket, TicketHistory, TicketComment, TicketTransferLink, TicketWorkRecord
from app.models.organization import SupportTeam
from app.models.user import User
from app.models.enums import VALID_STATUS_TRANSITIONS, TicketStatus
from app.services.ticket_access import can_read_ticket, require_ticket_reader, require_ticket_manager, TERMINAL_STATUSES
from app.services.audit_service import create_notification, record_audit_log
from app.services.sla_service import ensure_utc, evaluate_ticket_sla


def provisional_ticket_number():
    return f"TKT-{datetime.now(timezone.utc).year}-{uuid4().hex[:16]}"


def finalize_ticket_number(db, ticket):
    number = f"TKT-{datetime.now(timezone.utc).year}-{ticket.id:04d}"
    if db.query(Ticket.id).filter(Ticket.ticket_number == number, Ticket.id != ticket.id).first():
        number = f"{number}-{uuid4().hex[:6]}"
    ticket.ticket_number = number


def work_record(db, ticket, user_id, now):
    row = db.get(TicketWorkRecord, (ticket.id, user_id))
    if not row:
        row = TicketWorkRecord(ticket_id=ticket.id, user_id=user_id, accepted_at=now)
        db.add(row)
    return row


def history(db, ticket, actor, action, old, new, description):
    db.add(TicketHistory(ticket_id=ticket.id, actor_id=actor.id, action=action, field_name="status",
        old_value=old, new_value=new, description=description))
    record_audit_log(db, user_id=actor.id, action=f"TICKET_{action}", entity_type="ticket", entity_id=ticket.ticket_number,
        metadata={"old_status": old, "new_status": new, "outcome": "transferred" if action == "TRANSFERRED" else new})


def accept_ticket(db: Session, ticket: Ticket, user: User):
    if user.role not in ("agent", "admin"):
        raise AppException("Only support staff can accept tickets.", status.HTTP_403_FORBIDDEN)
    if user.role == "agent" and (not user.support_team_id or ticket.support_team_id != user.support_team_id):
        raise AppException("This ticket belongs to another support team.", status.HTTP_403_FORBIDDEN)
    if ticket.assigned_agent_id == user.id and ticket.status != "open":
        if ticket.status in TERMINAL_STATUSES:
            raise AppException("This ticket is no longer available to accept.", status.HTTP_409_CONFLICT)
        return ticket
    now = datetime.now(timezone.utc)
    claimed = db.execute(update(Ticket).where(Ticket.id == ticket.id, Ticket.status == "open",
        or_(Ticket.assigned_agent_id.is_(None), Ticket.assigned_agent_id == user.id)).values(
        assigned_agent_id=user.id, status="assigned", first_responded_at=ticket.first_responded_at or now,
        updated_at=now), execution_options={"synchronize_session": False}).rowcount
    if not claimed:
        db.rollback()
        raise AppException("Another consultant already accepted this ticket. Refresh the queue.", status.HTTP_409_CONFLICT, "ALREADY_CLAIMED")
    db.refresh(ticket)
    record = work_record(db, ticket, user.id, now)
    record.ended_at, record.outcome = None, None
    history(db, ticket, user, "ACCEPTED", "open", "assigned", f"{user.full_name} accepted this ticket.")
    create_notification(db, ticket.requester_id, f"Ticket accepted: {ticket.ticket_number}",
        f"{user.full_name} accepted your ticket.", ticket.id, "ticket_assigned")
    db.commit()
    db.refresh(ticket)
    return ticket


def change_status(db, ticket, payload, user):
    require_ticket_reader(ticket, user)
    if ticket.transferred_at:
        raise AppException("This transferred work segment is closed. Continue on its linked successor.", status.HTTP_409_CONFLICT)
    old, target = ticket.status, payload.status
    if old == target:
        return ticket
    if user.role == "employee":
        if not (old == "resolved" and target == "open"):
            raise AppException("Only the assigned consultant can explicitly close this ticket.", status.HTTP_403_FORBIDDEN)
    else:
        require_ticket_manager(ticket, user)
    if TicketStatus(target) not in VALID_STATUS_TRANSITIONS.get(TicketStatus(old), set()):
        raise AppException(f"Invalid status transition from {old} to {target}.", status.HTTP_400_BAD_REQUEST)
    if user.role == "agent" and old == "open":
        raise AppException("Accept this ticket first.", status.HTTP_409_CONFLICT)
    now = datetime.now(timezone.utc)
    values = {"status": target, "updated_at": now}
    if target == "in_progress" and not ticket.work_started_at:
        values["work_started_at"] = now
    if target == "resolved":
        values["resolved_at"] = now
    elif target == "closed":
        values["closed_at"] = now
        values["resolved_at"] = ticket.resolved_at or now
    elif old in ("resolved", "closed"):
        values.update(resolved_at=None, closed_at=None, reopened_count=(ticket.reopened_count or 0)+1)
    changed = db.execute(update(Ticket).where(Ticket.id == ticket.id, Ticket.status == old,
        Ticket.assigned_agent_id == ticket.assigned_agent_id).values(**values), execution_options={"synchronize_session": False}).rowcount
    if not changed:
        db.rollback()
        raise AppException("The ticket changed in another session. Refresh before continuing.", status.HTTP_409_CONFLICT)
    db.refresh(ticket)
    if ticket.assigned_agent_id:
        record = work_record(db, ticket, ticket.assigned_agent_id, now)
        if target == "in_progress" and not record.started_at:
            record.started_at = now
        if target in ("resolved", "closed"):
            record.ended_at, record.outcome = now, target
        else:
            record.ended_at, record.outcome = None, None
    sla = evaluate_ticket_sla(ticket, now)
    ticket.sla_resolution_breached = sla.resolution_breached
    ticket.sla_response_breached = sla.response_breached
    detail = f"{user.full_name} changed status from {old} to {target}."
    if payload.reason and payload.reason.strip():
        detail += f" {payload.reason.strip()}"
        db.add(TicketComment(ticket_id=ticket.id, author_id=user.id, body=detail, is_internal=False))
    history(db, ticket, user, "STATUS_CHANGED", old, target, detail)
    recipient = ticket.requester_id if user.id != ticket.requester_id else ticket.assigned_agent_id
    if recipient and recipient != user.id:
        create_notification(db, recipient, f"{ticket.ticket_number}: {target.replace('_', ' ').title()}", detail, ticket.id, "status_changed")
    db.commit()
    db.refresh(ticket)
    return ticket


def assign_ticket(db, ticket, payload, user):
    if user.role == "agent":
        if payload.assigned_agent_id != user.id or (payload.support_team_id and payload.support_team_id != ticket.support_team_id):
            raise AppException("Use Transfer to hand work to another consultant or team.", status.HTTP_403_FORBIDDEN)
        return accept_ticket(db, ticket, user)
    if user.role != "admin":
        raise AppException("Only administrators can assign other consultants.", status.HTTP_403_FORBIDDEN)
    if ticket.status in ("transferred", "closed"):
        raise AppException("This ticket is read-only. Open the linked successor or reopen the closed ticket first.", status.HTTP_409_CONFLICT)
    if payload.support_team_id and payload.support_team_id != ticket.support_team_id:
        raise AppException("Use Transfer to change the responsible team.", status.HTTP_409_CONFLICT)
    target = db.get(User, payload.assigned_agent_id) if payload.assigned_agent_id else None
    if target and (not target.is_active or target.role not in ("agent", "admin") or
        (target.role == "agent" and target.support_team_id != ticket.support_team_id)):
        raise AppException("Select an active consultant from the ticket's responsible team.", status.HTTP_400_BAD_REQUEST)
    if payload.assigned_agent_id and not target:
        raise AppException("Consultant not found.", status.HTTP_400_BAD_REQUEST)
    if ticket.assigned_agent_id == (target.id if target else None):
        return ticket
    now = datetime.now(timezone.utc)
    old_id = ticket.assigned_agent_id
    if old_id:
        record = work_record(db, ticket, old_id, now)
        record.ended_at, record.outcome = now, "reassigned"
    ticket.assigned_agent_id = target.id if target else None
    ticket.status = "open" if not target or target.role == "admin" else "assigned"
    ticket.updated_at = now
    history(db, ticket, user, "ASSIGNED", str(old_id), str(ticket.assigned_agent_id), f"{user.full_name} assigned the ticket to {target.full_name if target else 'the team queue'}.")
    for recipient in {ticket.requester_id, target.id if target else None} - {None, user.id}:
        create_notification(db, recipient, f"Assignment updated: {ticket.ticket_number}", f"Assigned to {target.full_name if target else 'the responsible team queue'}.", ticket.id, "ticket_assigned")
    db.commit()
    db.refresh(ticket)
    return ticket


def transfer_ticket(db, ticket, payload, user):
    require_ticket_reader(ticket, user)
    require_ticket_manager(ticket, user)
    existing = db.get(TicketTransferLink, ticket.id)
    if existing:
        successor = db.get(Ticket, existing.successor_ticket_id)
        if (payload.escalate_to_admin or successor.support_team_id == payload.support_team_id) and successor.assigned_agent_id == payload.assigned_agent_id:
            return successor
        raise AppException("This ticket was already transferred. Open its successor.", status.HTTP_409_CONFLICT)
    if ticket.status in TERMINAL_STATUSES:
        raise AppException("Only active tickets can be transferred.", status.HTTP_409_CONFLICT)
    target = db.get(User, payload.assigned_agent_id) if payload.assigned_agent_id else None
    if payload.escalate_to_admin:
        if not target or not target.is_active or target.role != "admin":
            raise AppException("Select an active administrator for escalation.", status.HTTP_400_BAD_REQUEST)
        team = db.get(SupportTeam, target.support_team_id or ticket.support_team_id)
    else:
        team = db.get(SupportTeam, payload.support_team_id) if payload.support_team_id else None
    if not team or not team.is_active:
        raise AppException("Select an active target support team.", status.HTTP_400_BAD_REQUEST)
    if payload.assigned_agent_id and (not target or not target.is_active or target.role not in ("agent", "admin") or (target.role == "agent" and target.support_team_id != team.id)):
        raise AppException("Select an active target consultant belonging to the target team, or an administrator.", status.HTTP_400_BAD_REQUEST)
    if payload.reject_assignment and not (user.role == "admin" and ticket.assigned_agent_id == user.id and ticket.status == "open"):
        raise AppException("Only the receiving administrator can reject a pending assignment.", status.HTTP_403_FORBIDDEN)
    reason = payload.reason.strip()
    if len(reason) < 5:
        raise AppException("Provide a transfer reason of at least five characters.", status.HTTP_400_BAD_REQUEST)
    if team.id == ticket.support_team_id and target and target.id == ticket.assigned_agent_id:
        raise AppException("Choose another consultant or responsible team.", status.HTTP_400_BAD_REQUEST)
    now = datetime.now(timezone.utc)
    sla = evaluate_ticket_sla(ticket, now)
    old = ticket.status
    changed = db.execute(update(Ticket).where(Ticket.id == ticket.id, Ticket.status == old,
        Ticket.transferred_at.is_(None), Ticket.assigned_agent_id == ticket.assigned_agent_id).values(
        status="closed", closed_at=now, transferred_at=now, updated_at=now), execution_options={"synchronize_session": False}).rowcount
    if not changed:
        db.rollback()
        raise AppException("Another request already transferred or changed this ticket. Refresh.", status.HTTP_409_CONFLICT)
    db.refresh(ticket)
    successor = Ticket(ticket_number=provisional_ticket_number(), subject=ticket.subject, description=ticket.description,
        category_id=ticket.category_id, subcategory=ticket.subcategory, priority=ticket.priority, status="open",
        requester_id=ticket.requester_id, assigned_agent_id=target.id if target else None,
        department_id=ticket.department_id, support_team_id=team.id, affected_service=ticket.affected_service,
        sla_policy_id=ticket.sla_policy_id, sla_started_at=ticket.sla_started_at,
        first_response_due_at=ticket.first_response_due_at, first_responded_at=ticket.first_responded_at,
        resolution_due_at=ticket.resolution_due_at, sla_response_breached=sla.response_breached,
        sla_resolution_breached=sla.resolution_breached, team_received_at=now, created_at=now, updated_at=now)
    db.add(successor)
    db.flush()
    finalize_ticket_number(db, successor)
    db.add(TicketTransferLink(parent_ticket_id=ticket.id, successor_ticket_id=successor.id, transferred_by_id=user.id, reason=reason))
    if ticket.assigned_agent_id and (old != "open" or db.get(TicketWorkRecord, (ticket.id, ticket.assigned_agent_id))):
        record = work_record(db, ticket, ticket.assigned_agent_id, now)
        record.ended_at, record.outcome = now, "transferred"
    if payload.reject_assignment:
        history(db, ticket, user, "ASSIGNMENT_REJECTED", old, "closed", f"{user.full_name} declined the escalation and redirected it to {team.name}. {reason}")
    history(db, ticket, user, "TRANSFERRED", old, "closed", f"Transferred by {user.full_name} to {team.name}, successor {successor.ticket_number}. {reason}")
    history(db, successor, user, "RECEIVED_TRANSFER", None, "open", f"Received from {ticket.ticket_number}. {reason} Original SLA deadline retained.")
    db.add(TicketComment(ticket_id=ticket.id, author_id=user.id, body=f"Transferred to {team.name}: {reason}", is_internal=False))
    recipients = {ticket.requester_id}
    if target:
        recipients.add(target.id)
    else:
        recipients.update(u.id for u in db.query(User).filter(User.is_active == True, User.support_team_id == team.id).all() if u.role in ("agent", "admin"))
    for recipient in recipients - {user.id}:
        create_notification(db, recipient, f"Transferred ticket: {successor.ticket_number}", f"{user.full_name} transferred {ticket.ticket_number} to {team.name}. {reason}", successor.id, "ticket_transferred")
    db.commit()
    db.refresh(successor)
    return successor


def ticket_lineage(db, ticket, user):
    links = []
    current = ticket.id
    seen = {current}
    while True:
        link = db.query(TicketTransferLink).filter(TicketTransferLink.successor_ticket_id == current).first()
        if not link or link.parent_ticket_id in seen:
            break
        previous = db.get(Ticket, link.parent_ticket_id)
        links.append((previous, "previous"))
        current = previous.id
        seen.add(current)
    links.reverse()
    link = db.get(TicketTransferLink, ticket.id)
    if link:
        links.append((db.get(Ticket, link.successor_ticket_id), "successor"))
    return [{"id": row.id, "ticket_number": row.ticket_number, "status": row.status,
        "support_team_name": row.support_team_rel.name if row.support_team_rel else None,
        "relation": relation, "can_open": can_read_ticket(row, user)} for row, relation in links]
