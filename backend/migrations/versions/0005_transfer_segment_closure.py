"""Close transferred work segments while retaining the transfer outcome and history."""
from alembic import op
import sqlalchemy as sa
import json
from datetime import datetime, timezone
revision = "0005_transfer_segment_closure"
down_revision = "0004_stable_account_sessions"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    tickets = sa.table("tickets", sa.column("id", sa.Integer()), sa.column("ticket_number", sa.String()), sa.column("status", sa.String()), sa.column("closed_at", sa.DateTime(timezone=True)), sa.column("transferred_at", sa.DateTime(timezone=True)), sa.column("updated_at", sa.DateTime(timezone=True)))
    audit = sa.table("audit_logs", sa.column("action"), sa.column("entity_type"), sa.column("entity_id"), sa.column("metadata_json"), sa.column("created_at", sa.DateTime(timezone=True)))
    for row in conn.execute(sa.select(tickets).where(tickets.c.status == "transferred")).mappings().all():
        end = row["transferred_at"] or row["updated_at"]
        conn.execute(tickets.update().where(tickets.c.id == row["id"]).values(status="closed", closed_at=end, transferred_at=end))
        conn.execute(audit.insert().values(action="TRANSFER_CLOSURE_NORMALIZED", entity_type="ticket", entity_id=row["ticket_number"], metadata_json=json.dumps({"old_status":"transferred","new_status":"closed","outcome":"transferred"}), created_at=datetime.now(timezone.utc)))


def downgrade():
    # Audit history is retained. Transfer timestamps identify only handoff closures.
    op.execute("UPDATE tickets SET status = 'transferred', closed_at = NULL WHERE transferred_at IS NOT NULL AND status = 'closed'")
