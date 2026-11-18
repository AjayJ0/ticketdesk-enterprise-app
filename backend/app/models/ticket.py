from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TicketCategory(Base):
    __tablename__ = "ticket_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    subcategories_json = Column(Text, nullable=True)  # JSON list of default subcategories
    icon = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    tickets = relationship("Ticket", back_populates="category_rel")


class SLAPolicy(Base):
    __tablename__ = "sla_policies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    priority = Column(String(30), unique=True, nullable=False, index=True)  # critical, high, medium, low
    response_target_minutes = Column(Integer, nullable=False)
    resolution_target_minutes = Column(Integer, nullable=False)
    business_hours_only = Column(Boolean, default=False, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    tickets = relationship("Ticket", back_populates="sla_policy")


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_number = Column(String(32), unique=True, nullable=False, index=True)  # e.g., TKT-2026-0001
    subject = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=False)

    category_id = Column(Integer, ForeignKey("ticket_categories.id", ondelete="RESTRICT"), nullable=False, index=True)
    subcategory = Column(String(120), nullable=True)
    priority = Column(String(30), nullable=False, index=True)  # critical, high, medium, low
    status = Column(String(30), nullable=False, default="open", index=True)  # open, assigned, in_progress, pending, resolved, closed

    requester_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    assigned_agent_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True)
    support_team_id = Column(Integer, ForeignKey("support_teams.id", ondelete="SET NULL"), nullable=True, index=True)

    affected_service = Column(String(150), nullable=True)

    # SLA tracking fields
    sla_policy_id = Column(Integer, ForeignKey("sla_policies.id", ondelete="SET NULL"), nullable=True)
    sla_started_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    first_response_due_at = Column(DateTime(timezone=True), nullable=True)
    first_responded_at = Column(DateTime(timezone=True), nullable=True)
    resolution_due_at = Column(DateTime(timezone=True), nullable=True, index=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    reopened_count = Column(Integer, default=0, nullable=False)

    sla_response_breached = Column(Boolean, default=False, nullable=False)
    sla_resolution_breached = Column(Boolean, default=False, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (
        Index("ix_tickets_status_priority", "status", "priority"),
        Index("ix_tickets_requester_status", "requester_id", "status"),
        Index("ix_tickets_agent_status", "assigned_agent_id", "status"),
    )

    # Relationships
    category_rel = relationship("TicketCategory", back_populates="tickets", lazy="joined")
    requester = relationship("User", foreign_keys=[requester_id], back_populates="requested_tickets", lazy="joined")
    assigned_agent = relationship("User", foreign_keys=[assigned_agent_id], back_populates="assigned_tickets", lazy="joined")
    department_rel = relationship("Department", back_populates="tickets", lazy="joined")
    support_team_rel = relationship("SupportTeam", back_populates="tickets", lazy="joined")
    sla_policy = relationship("SLAPolicy", back_populates="tickets", lazy="joined")

    comments = relationship(
        "TicketComment",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketComment.created_at.asc()",
    )
    attachments = relationship(
        "TicketAttachment",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketAttachment.created_at.desc()",
    )
    history = relationship(
        "TicketHistory",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketHistory.created_at.desc()",
    )


class TicketComment(Base):
    __tablename__ = "ticket_comments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    body = Column(Text, nullable=False)
    is_internal = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    ticket = relationship("Ticket", back_populates="comments")
    author = relationship("User", back_populates="comments", lazy="joined")


class TicketAttachment(Base):
    __tablename__ = "ticket_attachments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    uploaded_by_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), unique=True, nullable=False)
    storage_provider = Column(String(30), nullable=False, default="local")  # local | s3
    storage_key = Column(String(512), nullable=False)
    content_type = Column(String(120), nullable=False)
    file_size = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    ticket = relationship("Ticket", back_populates="attachments")
    uploaded_by = relationship("User", lazy="joined")


class TicketHistory(Base):
    __tablename__ = "ticket_history"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(100), nullable=False)  # CREATED, STATUS_CHANGED, PRIORITY_CHANGED, ASSIGNED, COMMENTED, ATTACHMENT_ADDED, REOPENED
    field_name = Column(String(80), nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    description = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    ticket = relationship("Ticket", back_populates="history")
    actor = relationship("User", lazy="joined")
