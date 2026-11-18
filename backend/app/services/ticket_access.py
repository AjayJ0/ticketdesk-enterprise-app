from sqlalchemy import and_, or_, exists
from sqlalchemy.orm import Session, object_session
from fastapi import status
from app.core.exceptions import AppException
from app.models.ticket import Ticket, TicketWorkRecord, TicketTransferLink
from app.models.user import User

TERMINAL_STATUSES = ("resolved", "closed", "transferred")


def personal_ticket_condition(user: User):
    return or_(Ticket.assigned_agent_id == user.id, exists().where(
        TicketWorkRecord.ticket_id == Ticket.id, TicketWorkRecord.user_id == user.id))


def available_ticket_condition(user: User):
    return and_(Ticket.assigned_agent_id.is_(None), Ticket.status == "open", Ticket.support_team_id == user.support_team_id) if user.support_team_id else False


def queue_condition(user: User):
    own = Ticket.assigned_agent_id == user.id
    available = and_(Ticket.assigned_agent_id.is_(None), Ticket.status == "open",
        Ticket.support_team_id == user.support_team_id) if user.support_team_id else False
    return or_(own, available)


def scoped_ticket_query(db: Session, user: User, personal=False, available=False):
    query = db.query(Ticket)
    if user.role == "employee":
        return query.filter(Ticket.requester_id == user.id)
    if user.role == "agent":
        return query.filter(personal_ticket_condition(user) if personal else (available_ticket_condition(user) if available else queue_condition(user)))
    return query


def can_read_ticket(ticket: Ticket, user: User) -> bool:
    if user.role == "admin":
        return True
    if user.role == "employee":
        return ticket.requester_id == user.id
    if ticket.assigned_agent_id == user.id or (ticket.status == "open" and ticket.assigned_agent_id is None
            and user.support_team_id is not None and ticket.support_team_id == user.support_team_id):
        return True
    db = object_session(ticket)
    if not db:
        return False
    if db.get(TicketWorkRecord, (ticket.id, user.id)):
        return True
    # A receiving consultant may read every previous handoff's conversation/history.
    seen = {ticket.id}
    current = ticket.id
    while True:
        link = db.get(TicketTransferLink, current)
        if not link or link.successor_ticket_id in seen:
            return False
        successor = db.get(Ticket, link.successor_ticket_id)
        if not successor:
            return False
        if successor.assigned_agent_id == user.id or (successor.status == "open" and successor.assigned_agent_id is None
                and user.support_team_id is not None and successor.support_team_id == user.support_team_id):
            return True
        if db.get(TicketWorkRecord, (successor.id, user.id)):
            return True
        current = successor.id
        seen.add(current)


def require_ticket_reader(ticket: Ticket, user: User):
    if not can_read_ticket(ticket, user):
        raise AppException("You do not have access to this ticket.", status.HTTP_403_FORBIDDEN, "TICKET_ACCESS_DENIED")


def can_manage_ticket(ticket: Ticket, user: User) -> bool:
    return user.role == "admin" or (user.role == "agent" and ticket.assigned_agent_id == user.id and ticket.status != "open")


def require_ticket_manager(ticket: Ticket, user: User):
    if not can_manage_ticket(ticket, user):
        raise AppException("Accept this ticket before working on it. Only its assigned consultant or an administrator can perform this action.", status.HTTP_403_FORBIDDEN)


def visible_ticket_ids(db: Session, user: User):
    if user.role == "admin":
        return db.query(Ticket.id)
    if user.role == "employee":
        return db.query(Ticket.id).filter(Ticket.requester_id == user.id)
    # Notification visibility follows current queue/work ownership; old team queue events disappear after claim.
    return db.query(Ticket.id).filter(or_(queue_condition(user), personal_ticket_condition(user)))
