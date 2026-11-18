# TicketDesk Enterprise — System Architecture

## 1. Architectural Overview

**TicketDesk Enterprise** is a full-stack corporate IT Service Management (ITSM) platform built with a decoupled, service-oriented architecture:

- **Frontend Presentation Layer**: React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Hook Form + Zod, Recharts, and Lucide Icons.
- **Backend API & Service Layer**: Python FastAPI with modular v1 routers (`/api/v1/*`), dedicated service layer (`ticket_service`, `sla_service`, `analytics_service`, `audit_service`, `seed_service`), Pydantic v2 validation schemas, and centralized exception handling.
- **Persistence Layer**: PostgreSQL 16 (via SQLAlchemy 2.0 ORM and Alembic database migrations).
- **Storage Abstraction Layer**: Pluggable `StorageProvider` interface supporting local filesystem storage during development (`STORAGE_PROVIDER=local`) and Amazon S3 with IAM roles and pre-signed download URLs in production (`STORAGE_PROVIDER=s3`).
- **Event-Driven Serverless Layer**: AWS Lambda (`lambda/file_processor/handler.py`) triggered by Amazon S3 `ObjectCreated` events, emitting structured JSON telemetry to Amazon CloudWatch Logs.

## 2. Target AWS Cloud Architecture

```text
User Browser
    |
    v
Amazon EC2 (Nginx / Docker Compose)
    |
    +---> React TypeScript SPA
    |
    +---> FastAPI Backend (/api/v1)
              |
              +---> Amazon RDS for PostgreSQL (Multi-AZ Private Subnet)
              |
              +---> Amazon S3 (Private Bucket, AES-256 SSE, Pre-signed URLs)
                         |
                         v (s3:ObjectCreated:*)
                    AWS Lambda (lambda/file_processor/handler.py)
                         |
                         v
                    Amazon CloudWatch Logs & Metrics
```

## 3. Security & Role-Based Access Control (RBAC)

- **Password Security**: `bcrypt` (12 rounds) salted password hashing.
- **Session Management**: Short-lived signed JWT access tokens (`HS256`) paired with database-tracked, SHA-256 hashed refresh tokens (`refresh_tokens` table) supporting token rotation and immediate revocation on logout.
- **Login Rate Limiting**: Sliding-window rate limiter protecting `/api/v1/auth/login` against brute-force credential stuffing.
- **Strict Backend Role Enforcement**:
  - `employee`: Scoped strictly to own tickets (`requester_id == current_user.id`); internal notes (`is_internal = true`) are stripped at the backend service layer.
  - `agent`: Operational queue access, ticket assignment, status transitions, priority updates, internal notes, knowledge base authoring, and analytics reports.
  - `admin`: Full platform control including user & role provisioning, support teams, SLA policy configuration, system settings, and append-only compliance audit logs.
