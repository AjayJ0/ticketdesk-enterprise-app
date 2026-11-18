"""Bind sessions to immutable account identities, not recyclable numeric IDs."""
from uuid import uuid4
from alembic import op
import sqlalchemy as sa
revision = "0004_stable_account_sessions"
down_revision = "0003_ticket_workflow"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("session_identity", sa.String(36), nullable=True))
    connection = op.get_bind()
    users = sa.table("users", sa.column("id", sa.Integer()), sa.column("session_identity", sa.String(36)))
    for user_id in connection.execute(sa.select(users.c.id)).scalars().all():
        connection.execute(users.update().where(users.c.id == user_id).values(session_identity=str(uuid4())))
    op.create_index("ix_users_session_identity", "users", ["session_identity"], unique=True)
    op.add_column("refresh_tokens", sa.Column("session_identity", sa.String(36), nullable=True))
    op.add_column("refresh_tokens", sa.Column("role_at_issue", sa.String(50), nullable=True))
    # Pre-migration tokens deliberately have no stable account stamp and require explicit sign-in.


def downgrade():
    op.drop_column("refresh_tokens", "role_at_issue")
    op.drop_column("refresh_tokens", "session_identity")
    op.drop_index("ix_users_session_identity", table_name="users")
    op.drop_column("users", "session_identity")
