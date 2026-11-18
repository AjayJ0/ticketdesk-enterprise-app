"""Initial enterprise schema for TicketDesk Enterprise

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-11-18 08:50:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. roles
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_roles_id", "roles", ["id"])
    op.create_index("ix_roles_name", "roles", ["name"], unique=True)

    # 2. departments
    op.create_table(
        "departments",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(length=120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_departments_id", "departments", ["id"])
    op.create_index("ix_departments_name", "departments", ["name"], unique=True)

    # 3. support_teams
    op.create_table(
        "support_teams",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("specialization", sa.String(length=120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_support_teams_id", "support_teams", ["id"])
    op.create_index("ix_support_teams_name", "support_teams", ["name"], unique=True)

    # 4. users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=150), nullable=False),
        sa.Column("employee_id", sa.String(length=50), nullable=True),
        sa.Column("job_title", sa.String(length=120), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("support_team_id", sa.Integer(), sa.ForeignKey("support_teams.id", ondelete="SET NULL"), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_full_name", "users", ["full_name"])
    op.create_index("ix_users_employee_id", "users", ["employee_id"], unique=True)
    op.create_index("ix_users_is_active", "users", ["is_active"])
    op.create_index("ix_users_role_id", "users", ["role_id"])
    op.create_index("ix_users_department_id", "users", ["department_id"])
    op.create_index("ix_users_support_team_id", "users", ["support_team_id"])

    # 5. refresh_tokens
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_refresh_tokens_id", "refresh_tokens", ["id"])
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)
    op.create_index("ix_refresh_tokens_revoked", "refresh_tokens", ["revoked"])

    # 6. ticket_categories
    op.create_table(
        "ticket_categories",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("subcategories_json", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(length=50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ticket_categories_id", "ticket_categories", ["id"])
    op.create_index("ix_ticket_categories_name", "ticket_categories", ["name"], unique=True)
    op.create_index("ix_ticket_categories_slug", "ticket_categories", ["slug"], unique=True)

    # 7. sla_policies
    op.create_table(
        "sla_policies",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("priority", sa.String(length=30), nullable=False),
        sa.Column("response_target_minutes", sa.Integer(), nullable=False),
        sa.Column("resolution_target_minutes", sa.Integer(), nullable=False),
        sa.Column("business_hours_only", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sla_policies_id", "sla_policies", ["id"])
    op.create_index("ix_sla_policies_priority", "sla_policies", ["priority"], unique=True)

    # 8. tickets
    op.create_table(
        "tickets",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("ticket_number", sa.String(length=32), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("ticket_categories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("subcategory", sa.String(length=120), nullable=True),
        sa.Column("priority", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="open"),
        sa.Column("requester_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("assigned_agent_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("support_team_id", sa.Integer(), sa.ForeignKey("support_teams.id", ondelete="SET NULL"), nullable=True),
        sa.Column("affected_service", sa.String(length=150), nullable=True),
        sa.Column("sla_policy_id", sa.Integer(), sa.ForeignKey("sla_policies.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sla_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("first_response_due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopened_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sla_response_breached", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sla_resolution_breached", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_tickets_id", "tickets", ["id"])
    op.create_index("ix_tickets_ticket_number", "tickets", ["ticket_number"], unique=True)
    op.create_index("ix_tickets_subject", "tickets", ["subject"])
    op.create_index("ix_tickets_category_id", "tickets", ["category_id"])
    op.create_index("ix_tickets_priority", "tickets", ["priority"])
    op.create_index("ix_tickets_status", "tickets", ["status"])
    op.create_index("ix_tickets_requester_id", "tickets", ["requester_id"])
    op.create_index("ix_tickets_assigned_agent_id", "tickets", ["assigned_agent_id"])
    op.create_index("ix_tickets_department_id", "tickets", ["department_id"])
    op.create_index("ix_tickets_support_team_id", "tickets", ["support_team_id"])
    op.create_index("ix_tickets_resolution_due_at", "tickets", ["resolution_due_at"])
    op.create_index("ix_tickets_sla_resolution_breached", "tickets", ["sla_resolution_breached"])
    op.create_index("ix_tickets_created_at", "tickets", ["created_at"])
    op.create_index("ix_tickets_status_priority", "tickets", ["status", "priority"])
    op.create_index("ix_tickets_requester_status", "tickets", ["requester_id", "status"])
    op.create_index("ix_tickets_agent_status", "tickets", ["assigned_agent_id", "status"])

    # 9. ticket_comments
    op.create_table(
        "ticket_comments",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_internal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ticket_comments_id", "ticket_comments", ["id"])
    op.create_index("ix_ticket_comments_ticket_id", "ticket_comments", ["ticket_id"])
    op.create_index("ix_ticket_comments_author_id", "ticket_comments", ["author_id"])
    op.create_index("ix_ticket_comments_is_internal", "ticket_comments", ["is_internal"])

    # 10. ticket_attachments
    op.create_table(
        "ticket_attachments",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("uploaded_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_filename", sa.String(length=255), nullable=False, unique=True),
        sa.Column("storage_provider", sa.String(length=30), nullable=False, server_default="local"),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ticket_attachments_id", "ticket_attachments", ["id"])
    op.create_index("ix_ticket_attachments_ticket_id", "ticket_attachments", ["ticket_id"])
    op.create_index("ix_ticket_attachments_uploaded_by_id", "ticket_attachments", ["uploaded_by_id"])

    # 11. ticket_history
    op.create_table(
        "ticket_history",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("field_name", sa.String(length=80), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ticket_history_id", "ticket_history", ["id"])
    op.create_index("ix_ticket_history_ticket_id", "ticket_history", ["ticket_id"])
    op.create_index("ix_ticket_history_actor_id", "ticket_history", ["actor_id"])
    op.create_index("ix_ticket_history_created_at", "ticket_history", ["created_at"])

    # 12. notifications
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("notification_type", sa.String(length=50), nullable=False, server_default="ticket_update"),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_notifications_id", "notifications", ["id"])
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_ticket_id", "notifications", ["ticket_id"])
    op.create_index("ix_notifications_is_read", "notifications", ["is_read"])
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])

    # 13. knowledge_articles
    op.create_table(
        "knowledge_articles",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("ticket_categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("tags", sa.String(length=255), nullable=True),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("helpful_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_knowledge_articles_id", "knowledge_articles", ["id"])
    op.create_index("ix_knowledge_articles_title", "knowledge_articles", ["title"])
    op.create_index("ix_knowledge_articles_slug", "knowledge_articles", ["slug"], unique=True)
    op.create_index("ix_knowledge_articles_category_id", "knowledge_articles", ["category_id"])
    op.create_index("ix_knowledge_articles_author_id", "knowledge_articles", ["author_id"])
    op.create_index("ix_knowledge_articles_is_published", "knowledge_articles", ["is_published"])

    # 14. audit_logs
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=80), nullable=False),
        sa.Column("entity_id", sa.String(length=80), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_logs_id", "audit_logs", ["id"])
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_entity_type", "audit_logs", ["entity_type"])
    op.create_index("ix_audit_logs_entity_id", "audit_logs", ["entity_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    # 15. system_settings
    op.create_table(
        "system_settings",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=60), nullable=False, server_default="general"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_system_settings_id", "system_settings", ["id"])
    op.create_index("ix_system_settings_key", "system_settings", ["key"], unique=True)


def downgrade() -> None:
    op.drop_table("system_settings")
    op.drop_table("audit_logs")
    op.drop_table("knowledge_articles")
    op.drop_table("notifications")
    op.drop_table("ticket_history")
    op.drop_table("ticket_attachments")
    op.drop_table("ticket_comments")
    op.drop_table("tickets")
    op.drop_table("sla_policies")
    op.drop_table("ticket_categories")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
    op.drop_table("support_teams")
    op.drop_table("departments")
    op.drop_table("roles")
