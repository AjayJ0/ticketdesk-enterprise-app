from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    ticket_id: Optional[int] = None
    ticket_number: Optional[str] = None
    title: str
    message: str
    notification_type: str
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: List[NotificationResponse]
    unread_count: int
    total: int


class KnowledgeArticleCreateRequest(BaseModel):
    title: str = Field(..., min_length=5, max_length=255)
    summary: str = Field(..., min_length=10, max_length=600)
    content: str = Field(..., min_length=20)
    category_id: Optional[int] = None
    tags: Optional[str] = None
    is_published: bool = True


class KnowledgeArticleUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=5, max_length=255)
    summary: Optional[str] = Field(None, min_length=10, max_length=600)
    content: Optional[str] = Field(None, min_length=20)
    category_id: Optional[int] = None
    tags: Optional[str] = None
    is_published: Optional[bool] = None


class KnowledgeArticleResponse(BaseModel):
    id: int
    title: str
    slug: str
    summary: str
    content: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    author_id: int
    author_name: str
    tags: List[str] = []
    is_published: bool
    view_count: int
    helpful_count: int
    created_at: datetime
    updated_at: datetime


class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    user_name: str
    user_email: Optional[str] = None
    user_role: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    ip_address: Optional[str] = None
    metadata: Dict[str, Any] = {}
    created_at: datetime


class PaginatedAuditLogsResponse(BaseModel):
    items: List[AuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class SystemSettingResponse(BaseModel):
    id: int
    key: str
    value: str
    category: str
    description: Optional[str] = None
    updated_by_name: Optional[str] = None
    updated_at: datetime


class SystemSettingUpdateRequest(BaseModel):
    settings: Dict[str, str]
