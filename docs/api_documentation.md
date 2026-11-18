# TicketDesk Enterprise — REST API Documentation

Interactive OpenAPI / Swagger documentation is served directly by FastAPI when the backend is running:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`
- **OpenAPI JSON**: `http://localhost:8000/openapi.json`
- **Health Check**: `http://localhost:8000/health` and `http://localhost:8000/api/v1/health`

## 1. Authentication (`/api/v1/auth`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Public (Rate-limited) | Authenticate with `email` and `password`; returns `access_token`, `refresh_token`, and user profile. |
| `POST` | `/api/v1/auth/refresh` | Public | Rotate `refresh_token` and issue a new `access_token`. |
| `POST` | `/api/v1/auth/logout` | Authenticated | Revoke the active refresh token(s) and record a logout audit event. |
| `GET` | `/api/v1/auth/me` | Authenticated | Retrieve current authenticated user profile, role, department, and support team. |

## 2. Ticket Management (`/api/v1/tickets`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/tickets` | Authenticated | Paginated ticket listing with search, filtering (`status`, `priority`, `category_id`, `overdue_only`, `unassigned_only`, `my_tickets`, `assigned_to_me`), and sorting. |
| `POST` | `/api/v1/tickets` | Authenticated | Create a new support ticket (`TKT-YYYY-XXXX`), attach active SLA policy, and dispatch notifications. |
| `GET` | `/api/v1/tickets/categories` | Authenticated | List active ticket categories and default subcategories. |
| `POST` | `/api/v1/tickets/categories` | Admin | Create a new ticket category. |
| `GET` | `/api/v1/tickets/{ticket_id}` | Authenticated (Scoped) | Retrieve full ticket details, SLA status, comments (internal notes stripped for employees), attachments, and activity history. |
| `PUT` | `/api/v1/tickets/{ticket_id}` | Authenticated (Scoped) | Update ticket fields, priority (recalculates SLA), or support team. |
| `PATCH` | `/api/v1/tickets/{ticket_id}/status` | Authenticated (Scoped) | Transition ticket status (`open` → `assigned` → `in_progress` → `pending` → `resolved` → `closed` or reopen). |
| `PATCH` | `/api/v1/tickets/{ticket_id}/assign` | Agent, Admin | Assign or accept ticket ownership and support team routing. |
| `POST` | `/api/v1/tickets/{ticket_id}/comments` | Authenticated (Scoped) | Add a public comment or restricted internal agent note (`is_internal=true`). |
| `POST` | `/api/v1/tickets/{ticket_id}/attachments` | Authenticated (Scoped) | Validate and upload a file (`PDF`, `PNG`, `JPG`, `JPEG`, `TXT`) to local or S3 storage. |
| `GET` | `/api/v1/tickets/{ticket_id}/attachments/{attachment_id}/download` | Authenticated (Scoped) | Authorize and stream attachment download (or redirect to S3 pre-signed URL). |

## 3. Operational Dashboard (`/api/v1/dashboard`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/dashboard/summary` | Authenticated | Live KPI metrics: total, open, assigned, in progress, pending, resolved, closed, overdue, average resolution hours, SLA compliance %. |
| `GET` | `/api/v1/dashboard/trends` | Authenticated | Daily (14d), Weekly (8w), and Monthly (6m) created vs resolved ticket trends. |
| `GET` | `/api/v1/dashboard/distribution` | Authenticated | Status, priority, and category distributions, recent tickets, and agent performance workload. |

## 4. Reports & Analytics (`/api/v1/reports`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/reports/tickets` | Agent, Admin | Ticket volume by date, category/priority breakdown, and resolution rate with date filters. |
| `GET` | `/api/v1/reports/sla` | Agent, Admin | SLA compliance breakdown and average resolution time by priority tier. |
| `GET` | `/api/v1/reports/agents` | Agent, Admin | Individual IT Support Agent workload and SLA compliance metrics. |
| `GET` | `/api/v1/reports/export/csv` | Agent, Admin | Download filtered ticket analytics report as a CSV spreadsheet. |

## 5. Users, SLA, Knowledge Base, Notifications, Audit Logs & Settings

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET / POST` | `/api/v1/users` | Admin | List, search, filter, and create enterprise users. |
| `PUT` | `/api/v1/users/{user_id}` | Admin | Edit user details, department, support team, or active status. |
| `PATCH` | `/api/v1/users/{user_id}/role` | Admin | Modify user role (`employee`, `agent`, `admin`). |
| `GET` | `/api/v1/users/agents` | Agent, Admin | List active support agents for ticket assignment. |
| `GET / POST` | `/api/v1/users/departments` | Authenticated / Admin | List or create corporate departments. |
| `GET / POST` | `/api/v1/users/support-teams` | Authenticated / Admin | List or create IT support teams. |
| `GET / PUT` | `/api/v1/sla` & `/api/v1/sla/{id}` | Authenticated / Admin | View and update priority-based SLA response/resolution targets. |
| `GET / POST / PUT` | `/api/v1/knowledge` | Authenticated / Staff | Search, read, create, edit, publish/unpublish knowledge base articles. |
| `GET / PATCH / POST` | `/api/v1/notifications` | Authenticated | Retrieve in-app notifications and mark single or all notifications as read. |
| `GET` | `/api/v1/audit-logs` | Admin | Query append-only security and administrative audit logs. |
| `GET / PUT` | `/api/v1/settings` | Authenticated / Admin | View or update global system configuration settings. |


## SLA Alerts

`GET /api/v1/notifications/sla-alerts?page=1&page_size=20` is restricted to administrators and returns the existing paginated ticket response, ordered by earliest resolution deadline. Outstanding alerts are unresolved/unclosed tickets whose stored resolution deadline has passed. Administrators see all teams. Agents and employees cannot access this endpoint or receive SLA breach notifications; ordinary ticket notifications remain available. Response-only breaches are not resolution alerts.

The sidebar and alerts page poll every 20 seconds while the application is open. Reading alerts or existing notifications synchronizes resolution-breach notifications into the existing notification inbox. A database-enforced recipient/ticket ledger prevents repeat delivery, including concurrent polling and reopening the same ticket. Read status does not dismiss an outstanding breach; resolution, closure, deadline extension, or leaving the recipient's responsibility removes it from the active alerts and inbox view. Stored notification history is retained. There is no background scheduler, SMS, or email delivery.

Existing managed databases should apply Alembic revision `0002_sla_alert_deliveries`. Local development's existing startup table initialization creates the new ledger table automatically.
