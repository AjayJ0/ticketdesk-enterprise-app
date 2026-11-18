import io
import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Use an isolated test database for automated test suite
TEST_DB_PATH = Path(__file__).resolve().parent / "test_ticketdesk.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"
os.environ["LOCAL_UPLOAD_DIR"] = str(Path(__file__).resolve().parent / "test_uploads")

from app.main import app  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.services.seed_service import seed_database  # noqa: E402


@pytest.fixture(scope="module")
def client():
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    seed_database(db)
    db.close()

    with TestClient(app) as c:
        yield c

    engine.dispose()
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink()
        except Exception:
            pass


def _login(client: TestClient, email: str, password: str) -> dict:
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_health_check(client: TestClient):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["database"]["status"] == "healthy"


def test_auth_login_refresh_and_me(client: TestClient):
    tokens = _login(client, "admin@ticketdesk.enterprise", "Admin@12345")
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    assert tokens["user"]["role"] == "admin"

    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "admin@ticketdesk.enterprise"

    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200
    assert "access_token" in refreshed.json()


def test_employee_ticket_creation_and_rbac_isolation(client: TestClient):
    emp_tokens = _login(client, "sarah.chen@ticketdesk.enterprise", "Employee@12345")
    emp_headers = {"Authorization": f"Bearer {emp_tokens['access_token']}"}

    # Employee cannot access admin users list
    forbidden_resp = client.get("/api/v1/users", headers=emp_headers)
    assert forbidden_resp.status_code == 403

    # Employee creates a ticket
    categories = client.get("/api/v1/tickets/categories", headers=emp_headers).json()
    assert len(categories) >= 5

    create_resp = client.post(
        "/api/v1/tickets",
        headers=emp_headers,
        json={
            "subject": "Kubernetes kubectl OIDC plugin failing token refresh",
            "description": "When running kubectl get pods on staging cluster, OIDC helper throws token expired.",
            "category_id": categories[1]["id"],
            "subcategory": "IDE & Developer Tools",
            "priority": "high",
            "affected_service": "EKS Staging Cluster",
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    created_ticket = create_resp.json()
    ticket_num = created_ticket["ticket_number"]
    assert ticket_num.startswith("TKT-")
    assert created_ticket["status"] == "open"
    assert created_ticket["sla"]["response_target_minutes"] == 60

    # Employee cannot post internal note
    internal_attempt = client.post(
        f"/api/v1/tickets/{ticket_num}/comments",
        headers=emp_headers,
        json={"body": "Secret internal note", "is_internal": True},
    )
    assert internal_attempt.status_code == 403

    # Agent accepts, posts internal note + public comment, and resolves ticket
    agent_tokens = _login(client, "alex.rivera@ticketdesk.enterprise", "Agent@12345")
    agent_headers = {"Authorization": f"Bearer {agent_tokens['access_token']}"}

    assign_resp = client.patch(
        f"/api/v1/tickets/{ticket_num}/assign",
        headers=agent_headers,
        json={"assigned_agent_id": agent_tokens["user"]["id"], "note": "Taking ownership"},
    )
    assert assign_resp.status_code == 200
    assert assign_resp.json()["status"] == "assigned"

    # Agent adds internal note
    note_resp = client.post(
        f"/api/v1/tickets/{ticket_num}/comments",
        headers=agent_headers,
        json={"body": "Rotated OIDC client secret in Vault.", "is_internal": True},
    )
    assert note_resp.status_code == 201

    # Employee views ticket: internal note must be hidden
    emp_view = client.get(f"/api/v1/tickets/{ticket_num}", headers=emp_headers).json()
    assert all(not c["is_internal"] for c in emp_view["comments"])

    # Agent resolves ticket
    res_resp = client.patch(
        f"/api/v1/tickets/{ticket_num}/status",
        headers=agent_headers,
        json={"status": "resolved", "reason": "Updated kubeconfig OIDC issuer certificate."},
    )
    assert res_resp.status_code == 200
    assert res_resp.json()["status"] == "resolved"

    # Employee reopens resolved ticket
    reopen_resp = client.patch(
        f"/api/v1/tickets/{ticket_num}/status",
        headers=emp_headers,
        json={"status": "open", "reason": "Still seeing intermittent 401 on us-east cluster."},
    )
    assert reopen_resp.status_code == 200
    assert reopen_resp.json()["status"] == "open"
    assert reopen_resp.json()["reopened_count"] == 1


def test_attachment_upload_and_download(client: TestClient):
    emp_tokens = _login(client, "sarah.chen@ticketdesk.enterprise", "Employee@12345")
    emp_headers = {"Authorization": f"Bearer {emp_tokens['access_token']}"}

    my_tickets = client.get("/api/v1/tickets?my_tickets=true", headers=emp_headers).json()["items"]
    target_ticket = my_tickets[0]["ticket_number"]

    file_content = b"Sample diagnostic trace output for TicketDesk test suite."
    upload_resp = client.post(
        f"/api/v1/tickets/{target_ticket}/attachments",
        headers=emp_headers,
        files={"file": ("diagnostic_trace.txt", io.BytesIO(file_content), "text/plain")},
    )
    assert upload_resp.status_code == 201, upload_resp.text
    att_id = upload_resp.json()["id"]

    dl_resp = client.get(
        f"/api/v1/tickets/{target_ticket}/attachments/{att_id}/download",
        headers=emp_headers,
    )
    assert dl_resp.status_code == 200
    assert dl_resp.content == file_content


def test_dashboard_and_reports_endpoints(client: TestClient):
    admin_tokens = _login(client, "admin@ticketdesk.enterprise", "Admin@12345")
    headers = {"Authorization": f"Bearer {admin_tokens['access_token']}"}

    summary = client.get("/api/v1/dashboard/summary", headers=headers)
    assert summary.status_code == 200
    assert summary.json()["total_tickets"] >= 25

    trends = client.get("/api/v1/dashboard/trends", headers=headers)
    assert trends.status_code == 200
    assert len(trends.json()["daily"]) == 14

    dist = client.get("/api/v1/dashboard/distribution", headers=headers)
    assert dist.status_code == 200
    assert len(dist.json()["by_priority"]) == 4

    csv_resp = client.get("/api/v1/reports/export/csv", headers=headers)
    assert csv_resp.status_code == 200
    assert "Ticket Number" in csv_resp.text
