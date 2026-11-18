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


def test_auth_login_refresh_and_admin_profile_edit(client: TestClient):
    tokens = _login(client, "admin@ticketdesk.enterprise", "Admin@12345")
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    assert tokens["user"]["role"] == "admin"

    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "admin@ticketdesk.enterprise"

    # Admin updates their own profile via PUT /api/v1/auth/me
    update_me = client.put(
        "/api/v1/auth/me",
        headers=headers,
        json={
            "full_name": "Evelyn Sterling",
            "email": "admin@ticketdesk.enterprise",
            "employee_id": "EMP-1001",
            "job_title": "VP of Enterprise IT",
            "phone": "+1 (415) 890-1001",
        },
    )
    assert update_me.status_code == 200
    assert update_me.json()["job_title"] == "VP of Enterprise IT"


def test_admin_provisions_users_and_ticket_lifecycle(client: TestClient):
    admin_tokens = _login(client, "admin@ticketdesk.enterprise", "Admin@12345")
    admin_headers = {"Authorization": f"Bearer {admin_tokens['access_token']}"}

    # Verify only Admin exists initially (no legacy demo users) and Operation IT is not in support teams
    teams = client.get("/api/v1/users/support-teams", headers=admin_headers).json()
    assert all(t["name"].lower() != "operation it" for t in teams)

    # Admin creates a custom Employee and a custom IT Support Agent
    emp_create = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "email": "custom.employee@ticketdesk.enterprise",
            "full_name": "Custom Employee",
            "password": "Employee@12345",
            "employee_id": "EMP-3001",
            "phone": "+91 9876543210",
            "role": "employee",
        },
    )
    assert emp_create.status_code == 201, emp_create.text

    agent_create = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "email": "custom.agent@ticketdesk.enterprise",
            "full_name": "Custom Agent",
            "password": "Agent@12345",
            "employee_id": "EMP-3002",
            "phone": "+91 9876543211",
            "role": "agent",
            "support_team_id": teams[0]["id"],
        },
    )
    assert agent_create.status_code == 201, agent_create.text

    # Employee logs in and creates a ticket with support_team_id and subcategory "Others"
    emp_tokens = _login(client, "custom.employee@ticketdesk.enterprise", "Employee@12345")
    emp_headers = {"Authorization": f"Bearer {emp_tokens['access_token']}"}

    categories = client.get("/api/v1/tickets/categories", headers=emp_headers).json()
    assert all("Others" in c["subcategories"] for c in categories)

    create_resp = client.post(
        "/api/v1/tickets",
        headers=emp_headers,
        json={
            "subject": "Kubernetes kubectl OIDC plugin failing token refresh",
            "description": "When running kubectl get pods on staging cluster, OIDC helper throws token expired.",
            "category_id": categories[0]["id"],
            "subcategory": "Others",
            "priority": "high",
            "support_team_id": teams[0]["id"],
            "affected_service": "EKS Staging Cluster",
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    created_ticket = create_resp.json()
    ticket_num = created_ticket["ticket_number"]
    assert created_ticket["support_team_id"] == teams[0]["id"]


def test_forgot_password_via_phone_otp(client: TestClient):
    # Request OTP for custom.employee@ticketdesk.enterprise using phone +91 9876543210
    otp_req = client.post(
        "/api/v1/auth/forgot-password/request-otp",
        json={"phone": "9876543210"},
    )
    assert otp_req.status_code == 200, otp_req.text
    otp_data = otp_req.json()
    assert otp_data["success"] is True
    dev_otp = otp_data["dev_otp_code"]
    assert dev_otp and len(dev_otp) == 6

    # Verify OTP and set a new password
    reset_resp = client.post(
        "/api/v1/auth/forgot-password/verify-reset",
        json={
            "phone": "9876543210",
            "otp_code": dev_otp,
            "new_password": "NewPassword@123",
        },
    )
    assert reset_resp.status_code == 200, reset_resp.text

    # Sign in with the new password
    relogin = _login(client, "custom.employee@ticketdesk.enterprise", "NewPassword@123")
    assert "access_token" in relogin


def test_audit_log_csv_export_and_reports(client: TestClient):
    admin_tokens = _login(client, "admin@ticketdesk.enterprise", "Admin@12345")
    headers = {"Authorization": f"Bearer {admin_tokens['access_token']}"}

    audit_csv = client.get("/api/v1/audit-logs/export/csv", headers=headers)
    assert audit_csv.status_code == 200
    assert "Audit ID,Timestamp (UTC),Actor Name" in audit_csv.text

    report_csv = client.get("/api/v1/reports/export/csv", headers=headers)
    assert report_csv.status_code == 200
    assert "Ticket Number" in report_csv.text
