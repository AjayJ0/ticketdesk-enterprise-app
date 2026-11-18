from datetime import datetime, timezone

from sqlalchemy import or_
from app.services.ticket_access import visible_ticket_ids, available_ticket_condition

from sqlalchemy.exc import IntegrityError

from sqlalchemy.orm import Session

from app.models.system import Notification, SLAAlertDelivery

from app.models.ticket import Ticket

from app.models.user import User

from app.services.audit_service import create_notification

from app.services.sla_service import ensure_utc



SLA_NOTIFICATION_TYPE = "sla_resolution_breach"





def outstanding_sla_tickets(db: Session, user: User, now: datetime | None = None):
    """SLA alert monitoring is reserved for administrators across all teams."""
    query = db.query(Ticket).filter(
        Ticket.status.notin_(("resolved", "closed", "transferred")),
        Ticket.resolution_due_at < (now or datetime.now(timezone.utc)),
    )
    return query if user.role == "admin" else query.filter(False)


def sync_sla_notifications(db: Session, user: User) -> None:

    if user.role != "admin":

        return

    tickets = outstanding_sla_tickets(db, user).all()

    delivered = {row.ticket_id for row in db.query(SLAAlertDelivery).filter(

        SLAAlertDelivery.user_id == user.id,

    ).all()}

    for ticket in tickets:

        if ticket.id in delivered:

            continue

        try:

            # Both inserts commit together; the composite PK prevents concurrent duplicates.

            with db.begin_nested():

                db.add(SLAAlertDelivery(user_id=user.id, ticket_id=ticket.id))

                db.flush()

                due = ensure_utc(ticket.resolution_due_at)

                create_notification(

                    db, user_id=user.id, ticket_id=ticket.id,

                    title=f"SLA overdue: {ticket.ticket_number}",

                    message=f"{ticket.subject} — resolution deadline {due.isoformat()} has passed. Open the ticket to resolve the issue.",

                    notification_type=SLA_NOTIFICATION_TYPE,

                )

                db.flush()

        except IntegrityError:

            # Another request already recorded this recipient/ticket delivery.

            if not db.get(SLAAlertDelivery, (user.id, ticket.id)):

                raise

    db.commit()





def visible_notifications(db: Session, user: User):

    # Historic SLA notifications stay stored, but resolved/reassigned alerts do not

    # leak through the bell or inflate the current unread count.

    active_ids = outstanding_sla_tickets(db, user).with_entities(Ticket.id)

    query = db.query(Notification).filter(

        Notification.user_id == user.id,
        or_(Notification.ticket_id.is_(None), Notification.ticket_id.in_(visible_ticket_ids(db, user))),

        or_(Notification.notification_type != SLA_NOTIFICATION_TYPE,

            Notification.ticket_id.in_(active_ids)),

    )


    if user.role == "agent":
        available_ids = db.query(Ticket.id).filter(available_ticket_condition(user))
        query = query.filter(or_(Notification.notification_type != "new_ticket_queue", Notification.ticket_id.in_(available_ids)))
    return query
