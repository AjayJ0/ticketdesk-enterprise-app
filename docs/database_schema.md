# TicketDesk Enterprise — Database Schema & ER Diagram

## 1. Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    ROLES ||--o{ USERS : "assigns"
    DEPARTMENTS ||--o{ USERS : "belongs_to"
    SUPPORT_TEAMS ||--o{ USERS : "member_of"
    USERS ||--o{ REFRESH_TOKENS : "owns"
    USERS ||--o{ NOTIFICATIONS : "receives"
    USERS ||--o{ AUDIT_LOGS : "triggers"
    USERS ||--o{ KNOWLEDGE_ARTICLES : "authors"

    USERS ||--o{ TICKETS : "requests (requester_id)"
    USERS ||--o{ TICKETS : "assigned (assigned_agent_id)"
    DEPARTMENTS ||--o{ TICKETS : "originates_from"
    SUPPORT_TEAMS ||--o{ TICKETS : "routed_to"
    TICKET_CATEGORIES ||--o{ TICKETS : "classifies"
    TICKET_CATEGORIES ||--o{ KNOWLEDGE_ARTICLES : "categorizes"
    SLA_POLICIES ||--o{ TICKETS : "governs"

    TICKETS ||--o{ TICKET_COMMENTS : "has_comments"
    TICKETS ||--o{ TICKET_ATTACHMENTS : "has_attachments"
    TICKETS ||--o{ TICKET_HISTORY : "records_history"
    TICKETS ||--o{ NOTIFICATIONS : "references"

    ROLES {
        int id PK
        string name UK "employee | agent | admin"
        string display_name
        text description
        datetime created_at
        datetime updated_at
    }

    DEPARTMENTS {
        int id PK
        string name UK
        string code UK
        text description
        string location
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    SUPPORT_TEAMS {
        int id PK
        string name UK
        string code UK
        text description
        string specialization
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    USERS {
        int id PK
        string email UK
        string full_name
        string employee_id UK
        string job_title
        string phone
        string hashed_password
        boolean is_active
        int role_id FK
        int department_id FK
        int support_team_id FK
        datetime last_login_at
        datetime created_at
        datetime updated_at
    }

    REFRESH_TOKENS {
        int id PK
        int user_id FK
        string token_hash UK
        datetime expires_at
        boolean revoked
        datetime revoked_at
        string user_agent
        string ip_address
        datetime created_at
    }

    TICKET_CATEGORIES {
        int id PK
        string name UK
        string slug UK
        text description
        text subcategories_json
        string icon
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    SLA_POLICIES {
        int id PK
        string name
        string priority UK "critical | high | medium | low"
        int response_target_minutes
        int resolution_target_minutes
        boolean business_hours_only
        text description
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    TICKETS {
        int id PK
        string ticket_number UK "TKT-2026-XXXX"
        string subject
        text description
        int category_id FK
        string subcategory
        string priority
        string status "open | assigned | in_progress | pending | resolved | closed"
        int requester_id FK
        int assigned_agent_id FK
        int department_id FK
        int support_team_id FK
        string affected_service
        int sla_policy_id FK
        datetime sla_started_at
        datetime first_response_due_at
        datetime first_responded_at
        datetime resolution_due_at
        datetime resolved_at
        datetime closed_at
        int reopened_count
        boolean sla_response_breached
        boolean sla_resolution_breached
        datetime created_at
        datetime updated_at
    }

    TICKET_COMMENTS {
        int id PK
        int ticket_id FK
        int author_id FK
        text body
        boolean is_internal
        datetime created_at
        datetime updated_at
    }

    TICKET_ATTACHMENTS {
        int id PK
        int ticket_id FK
        int uploaded_by_id FK
        string original_filename
        string stored_filename UK
        string storage_provider "local | s3"
        string storage_key
        string content_type
        int file_size
        datetime created_at
    }

    TICKET_HISTORY {
        int id PK
        int ticket_id FK
        int actor_id FK
        string action
        string field_name
        text old_value
        text new_value
        text description
        datetime created_at
    }

    NOTIFICATIONS {
        int id PK
        int user_id FK
        int ticket_id FK
        string title
        text message
        string notification_type
        boolean is_read
        datetime read_at
        datetime created_at
    }

    KNOWLEDGE_ARTICLES {
        int id PK
        string title
        string slug UK
        text summary
        text content
        int category_id FK
        int author_id FK
        string tags
        boolean is_published
        int view_count
        int helpful_count
        datetime created_at
        datetime updated_at
    }

    AUDIT_LOGS {
        int id PK
        int user_id FK
        string action
        string entity_type
        string entity_id
        string ip_address
        string user_agent
        text metadata_json
        datetime created_at
    }

    SYSTEM_SETTINGS {
        int id PK
        string key UK
        text value
        string category
        text description
        int updated_by_id FK
        datetime updated_at
    }
```

## 2. Indexes & Constraints Summary

- **Composite Indexes on `tickets`**:
  - `ix_tickets_status_priority (status, priority)`
  - `ix_tickets_requester_status (requester_id, status)`
  - `ix_tickets_agent_status (assigned_agent_id, status)`
- **Unique Constraints**:
  - `tickets.ticket_number` (`TKT-2026-XXXX`)
  - `users.email`, `users.employee_id`
  - `roles.name`, `departments.code`, `support_teams.code`, `sla_policies.priority`
  - `refresh_tokens.token_hash`
- **Migrations**: Managed via Alembic (`backend/migrations/versions/0001_initial_schema.py`).
