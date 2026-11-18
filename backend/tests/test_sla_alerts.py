from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.main import app
from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.models.organization import Role, SupportTeam
from app.models.user import User
from app.models.ticket import Ticket, TicketCategory
from app.models.system import Notification, SLAAlertDelivery
from app.services.sla_alert_service import SLA_NOTIFICATION_TYPE


@pytest.fixture()
def setup():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    @event.listens_for(engine, "connect")
    def enable_fk(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    roles = {name: Role(name=name, display_name=name) for name in ("admin", "agent", "employee")}
    team = SupportTeam(name="Test Team", code="TEST")
    db.add_all([*roles.values(), team])
    db.flush()
    users = {}
    for name, role, team_id in [("admin", "admin", None), ("agent", "agent", team.id), ("peer", "agent", team.id), ("other", "agent", None), ("employee", "employee", None)]:
        users[name] = User(email=f"{name}@example.com", full_name=name, hashed_password="unused", role_id=roles[role].id, support_team_id=team_id)
    db.add_all(users.values())
    category = TicketCategory(name="Test", slug="test")
    db.add(category)
    db.commit()
    count = 0
    def ticket(**kwargs):
        nonlocal count
        count += 1
        values = dict(ticket_number=f"ALERT-{count}", subject="Test resolution breach", description="Test", category_id=category.id, priority="high", status="in_progress", requester_id=users["employee"].id, assigned_agent_id=users["agent"].id, resolution_due_at=datetime.now(timezone.utc)-timedelta(hours=1))
        values.update(kwargs)
        row = Ticket(**values)
        db.add(row)
        db.commit()
        return row
    def get_test_db():
        yield db
    app.dependency_overrides[get_db] = get_test_db
    # No production lifespan/database initialization for isolated API tests.
    client = TestClient(app)
    def headers(name):
        user = users[name]
        return {"Authorization": f"Bearer {create_access_token(user.id, user.role, session_identity=user.session_identity)}"}
    yield db, client, users, team, ticket, headers
    app.dependency_overrides.clear()
    client.close()
    db.close()
    engine.dispose()


def test_admin_only_breach_monitoring(setup):
    db, client, users, team, ticket, headers = setup
    own = ticket()
    queue = ticket(assigned_agent_id=None, support_team_id=team.id)
    peer = ticket(assigned_agent_id=users["peer"].id, support_team_id=team.id)
    other = ticket(assigned_agent_id=users["other"].id)
    ticket(resolution_due_at=datetime.now(timezone.utc)+timedelta(hours=1))
    ticket(status="resolved", resolved_at=datetime.now(timezone.utc))
    ticket(status="closed", resolved_at=datetime.now(timezone.utc))
    ticket(resolution_due_at=None)
    ticket(resolution_due_at=datetime.now(timezone.utc)+timedelta(hours=1), sla_response_breached=True)
    for name in ("agent", "peer", "other", "employee"):
        assert client.get("/api/v1/notifications/sla-alerts", headers=headers(name)).status_code == 403
    assert client.get("/api/v1/notifications/sla-alerts").status_code == 401
    data = client.get("/api/v1/notifications/sla-alerts", headers=headers("admin")).json()
    assert {row["id"] for row in data["items"]} == {own.id, queue.id, peer.id, other.id}
    assert all(row["resolution_due_at"] and row["requester"]["full_name"] for row in data["items"])
    admin = client.get("/api/v1/notifications/sla-alerts?page_size=1", headers=headers("admin")).json()
    assert admin["total"] == 4 and admin["total_pages"] == 4 and len(admin["items"]) == 1


def test_admin_dedup_read_resolution_reassignment_and_reopening(setup):
    db, client, users, team, ticket, headers = setup
    row = ticket()
    auth = headers("admin")
    endpoint = "/api/v1/notifications"
    first = client.get(endpoint, headers=auth).json()
    alert = next(n for n in first["items"] if n["notification_type"] == SLA_NOTIFICATION_TYPE)
    for _ in range(3):
        assert client.get(endpoint+"/sla-alerts", headers=auth).json()["total"] == 1
        assert client.get(endpoint, headers=auth).json()["unread_count"] == 1
    assert db.query(Notification).filter(Notification.notification_type == SLA_NOTIFICATION_TYPE).count() == 1
    assert client.patch(f"{endpoint}/{alert['id']}/read", headers=auth).status_code == 200
    assert client.get(endpoint, headers=auth).json()["unread_count"] == 0
    assert client.get(endpoint+"/sla-alerts", headers=auth).json()["total"] == 1
    row.status = "resolved"
    row.resolved_at = datetime.now(timezone.utc)
    db.commit()
    assert client.get(endpoint+"/sla-alerts", headers=auth).json()["total"] == 0
    assert client.get(endpoint, headers=auth).json()["total"] == 0
    assert client.patch(f"{endpoint}/{alert['id']}/read", headers=auth).status_code == 404
    row.status = "open"
    row.resolved_at = None
    db.commit()
    assert client.get(endpoint+"/sla-alerts", headers=auth).json()["total"] == 1
    assert db.query(Notification).count() == 1
    row.assigned_agent_id = users["other"].id
    db.commit()
    assert client.get(endpoint+"/sla-alerts", headers=auth).json()["total"] == 1
    assert client.get(endpoint, headers=headers("other")).json()["unread_count"] == 0
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.add(SLAAlertDelivery(user_id=users["admin"].id, ticket_id=row.id))
            db.flush()
    row.resolution_due_at = datetime.now(timezone.utc)+timedelta(hours=1)
    db.commit()
    assert client.get(endpoint+"/sla-alerts", headers=auth).json()["total"] == 0


def test_consultants_receive_normal_notifications_but_no_sla_alerts(setup):
    db, client, users, team, ticket, headers = setup
    row = ticket()
    legacy = Notification(user_id=users["agent"].id, ticket_id=row.id, title="Old breach", message="Legacy SLA", notification_type=SLA_NOTIFICATION_TYPE)
    normal = Notification(user_id=users["agent"].id, ticket_id=row.id, title="New reply", message="Normal ticket reply", notification_type="comment_added")
    db.add_all([legacy, normal])
    db.commit()
    response = client.get("/api/v1/notifications", headers=headers("agent")).json()
    assert response["total"] == 1 and response["unread_count"] == 1
    assert response["items"][0]["id"] == normal.id
    assert client.patch(f"/api/v1/notifications/{legacy.id}/read", headers=headers("agent")).status_code == 404
    assert client.patch(f"/api/v1/notifications/{normal.id}/read", headers=headers("agent")).status_code == 200
    assert db.query(SLAAlertDelivery).filter(SLAAlertDelivery.user_id == users["agent"].id).count() == 0


def test_employee_dashboard_and_tickets_are_isolated(setup):
    db, client, users, team, ticket, headers = setup
    own = ticket()
    other = ticket(requester_id=users["other"].id)
    auth = headers("employee")
    data = client.get("/api/v1/dashboard/summary", headers=auth).json()
    assert data["total_tickets"] == 1
    distribution = client.get("/api/v1/dashboard/distribution", headers=auth).json()
    assert distribution["agent_performance"] == []
    assert {t["id"] for t in distribution["recent_tickets"]} == {own.id}
    listing = client.get("/api/v1/tickets", headers=auth).json()
    assert {t["id"] for t in listing["items"]} == {own.id}
    assert client.get(f"/api/v1/tickets/{other.id}", headers=auth).status_code == 403
    assert client.get("/api/v1/users", headers=auth).status_code == 403
    assert client.get("/api/v1/reports/tickets", headers=auth).status_code == 403


def test_sla_notification_ledger_migration(tmp_path, monkeypatch):
    from pathlib import Path
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect
    from app.core.config import settings
    backend = Path(__file__).resolve().parents[1]
    url = f"sqlite:///{tmp_path / 'migration.db'}"
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "migrations"))
    command.upgrade(config, "head")
    engine = create_engine(url)
    assert inspect(engine).get_pk_constraint("sla_alert_deliveries")["constrained_columns"] == ["user_id", "ticket_id"]
    command.downgrade(config, "0001_initial_schema")
    assert "sla_alert_deliveries" not in inspect(engine).get_table_names()
    assert "tickets" in inspect(engine).get_table_names()
    engine.dispose()
