"""Team handoff lineage and durable individual work attribution."""
from alembic import op
import sqlalchemy as sa
revision = "0003_ticket_workflow"
down_revision = "0002_sla_alert_deliveries"
branch_labels = None
depends_on = None


def upgrade():
    for name in ("team_received_at", "work_started_at", "transferred_at"):
        op.add_column("tickets", sa.Column(name, sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE tickets SET team_received_at = created_at WHERE team_received_at IS NULL")
    op.create_table("ticket_transfer_links",
        sa.Column("parent_ticket_id", sa.Integer(), sa.ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("successor_ticket_id", sa.Integer(), sa.ForeignKey("tickets.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("transferred_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("ticket_work_records",
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("outcome", sa.String(30), nullable=True))
    # Historical accepted/start timestamps were not reliably recorded. Do not invent them.


def downgrade():
    op.drop_table("ticket_work_records")
    op.drop_table("ticket_transfer_links")
    for name in ("transferred_at", "work_started_at", "team_received_at"):
        op.drop_column("tickets", name)
