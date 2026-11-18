from enum import Enum


class RoleName(str, Enum):
    EMPLOYEE = "employee"
    AGENT = "agent"
    ADMIN = "admin"


class TicketPriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TicketStatus(str, Enum):
    OPEN = "open"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    PENDING = "pending"
    RESOLVED = "resolved"
    CLOSED = "closed"
    TRANSFERRED = "transferred"


# Valid state transitions for tickets
VALID_STATUS_TRANSITIONS: dict[TicketStatus, set[TicketStatus]] = {
    TicketStatus.TRANSFERRED: set(),
    TicketStatus.OPEN: {
        TicketStatus.ASSIGNED,
        TicketStatus.IN_PROGRESS,
        TicketStatus.PENDING,
        TicketStatus.RESOLVED,
        TicketStatus.CLOSED,
    },
    TicketStatus.ASSIGNED: {
        TicketStatus.IN_PROGRESS,
        TicketStatus.PENDING,
        TicketStatus.RESOLVED,
        TicketStatus.OPEN,
        TicketStatus.CLOSED,
    },
    TicketStatus.IN_PROGRESS: {
        TicketStatus.PENDING,
        TicketStatus.RESOLVED,
        TicketStatus.ASSIGNED,
        TicketStatus.CLOSED,
    },
    TicketStatus.PENDING: {
        TicketStatus.IN_PROGRESS,
        TicketStatus.RESOLVED,
        TicketStatus.ASSIGNED,
        TicketStatus.CLOSED,
    },
    TicketStatus.RESOLVED: {
        TicketStatus.CLOSED,
        TicketStatus.OPEN,         # Reopen
        TicketStatus.IN_PROGRESS,  # Reopen directly to in_progress
    },
    TicketStatus.CLOSED: {
        TicketStatus.OPEN,         # Admin/Agent reopen if needed
    },
}
