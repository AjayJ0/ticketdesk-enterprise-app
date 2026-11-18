from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from app.schemas.user import UserSummary


class CategoryResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    subcategories: List[str] = []
    icon: Optional[str] = None
    is_active: bool

    model_config = {"from_attributes": True}


class CategoryCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    slug: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    subcategories: List[str] = []
    icon: Optional[str] = "Folder"
    is_active: bool = True


class SLAPolicyResponse(BaseModel):
    id: int
    name: str
    priority: str
    response_target_minutes: int
    resolution_target_minutes: int
    business_hours_only: bool
    description: Optional[str] = None
    is_active: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class SLAPolicyUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    response_target_minutes: Optional[int] = Field(None, ge=1, le=43200)
    resolution_target_minutes: Optional[int] = Field(None, ge=5, le=86400)
    business_hours_only: Optional[bool] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class TicketCreateRequest(BaseModel):
    subject: str = Field(..., min_length=5, max_length=255)
    description: str = Field(..., min_length=10, max_length=10000)
    category_id: int
    subcategory: Optional[str] = Field(None, max_length=120)
    priority: str = Field("medium", pattern="^(critical|high|medium|low)$")
    department_id: Optional[int] = None
    support_team_id: Optional[int] = None
    affected_service: Optional[str] = Field(None, max_length=150)


class TicketUpdateRequest(BaseModel):
    subject: Optional[str] = Field(None, min_length=5, max_length=255)
    description: Optional[str] = Field(None, min_length=10, max_length=10000)
    category_id: Optional[int] = None
    subcategory: Optional[str] = Field(None, max_length=120)
    priority: Optional[str] = Field(None, pattern="^(critical|high|medium|low)$")
    affected_service: Optional[str] = Field(None, max_length=150)
    support_team_id: Optional[int] = None


class TicketStatusUpdateRequest(BaseModel):
    status: str = Field(..., pattern="^(open|assigned|in_progress|pending|resolved|closed)$")
    reason: Optional[str] = Field(None, max_length=1000)


class TicketAssignRequest(BaseModel):
    assigned_agent_id: Optional[int] = None
    support_team_id: Optional[int] = None
    note: Optional[str] = Field(None, max_length=500)


class TicketCommentCreateRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=10000)
    is_internal: bool = False


class TicketCommentResponse(BaseModel):
    id: int
    ticket_id: int
    author_id: int
    author: UserSummary
    body: str
    is_internal: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TicketAttachmentResponse(BaseModel):
    id: int
    ticket_id: int
    uploaded_by_id: int
    uploaded_by_name: str
    original_filename: str
    content_type: str
    file_size: int
    storage_provider: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TicketHistoryResponse(BaseModel):
    id: int
    ticket_id: int
    actor_id: Optional[int] = None
    actor_name: str
    actor_role: Optional[str] = None
    action: str
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SLAStatusInfo(BaseModel):
    policy_name: str
    response_target_minutes: int
    resolution_target_minutes: int
    first_response_due_at: Optional[datetime] = None
    first_responded_at: Optional[datetime] = None
    resolution_due_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    response_breached: bool
    resolution_breached: bool
    is_overdue: bool
    remaining_minutes: Optional[int] = None
    sla_health: str  # within_sla | at_risk | breached | met


class TicketListItemResponse(BaseModel):
    id: int
    ticket_number: str
    subject: str
    category_id: int
    category_name: str
    subcategory: Optional[str] = None
    priority: str
    status: str
    closed_at: Optional[datetime] = None
    transferred_at: Optional[datetime] = None
    transfer_outcome: Optional[str] = None
    routed_by: Optional[UserSummary] = None
    previous_ticket_number: Optional[str] = None
    requester: UserSummary
    assigned_agent: Optional[UserSummary] = None
    department_name: Optional[str] = None
    support_team_name: Optional[str] = None
    affected_service: Optional[str] = None
    resolution_due_at: Optional[datetime] = None
    is_overdue: bool
    sla_health: str
    comment_count: int = 0
    attachment_count: int = 0
    created_at: datetime
    updated_at: datetime


class TicketLinkResponse(BaseModel):
    id: int
    ticket_number: str
    status: str
    support_team_name: Optional[str] = None
    relation: str
    can_open: bool = True


class TicketTransferRequest(BaseModel):
    support_team_id: Optional[int] = Field(None, gt=0)
    escalate_to_admin: bool = False
    reject_assignment: bool = False
    assigned_agent_id: Optional[int] = Field(None, gt=0)
    reason: str = Field(..., min_length=5, max_length=2000)


class TicketDetailResponse(TicketListItemResponse):
    description: str
    department_id: Optional[int] = None
    support_team_id: Optional[int] = None
    reopened_count: int = 0
    team_received_at: Optional[datetime] = None
    work_started_at: Optional[datetime] = None
    original_submitted_at: Optional[datetime] = None
    can_accept: bool = False
    can_manage: bool = False
    can_chat: bool = False
    lineage: List[TicketLinkResponse] = []
    sla: SLAStatusInfo
    comments: List[TicketCommentResponse] = []
    attachments: List[TicketAttachmentResponse] = []
    history: List[TicketHistoryResponse] = []


class PaginatedTicketsResponse(BaseModel):
    items: List[TicketListItemResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
