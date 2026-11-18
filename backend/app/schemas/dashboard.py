from typing import List
from pydantic import BaseModel
from app.schemas.ticket import TicketListItemResponse


class DashboardSummaryResponse(BaseModel):
    total_tickets: int
    open_tickets: int
    assigned_tickets: int
    in_progress_tickets: int
    pending_tickets: int
    resolved_tickets: int
    transferred_tickets: int = 0
    closed_tickets: int
    sla_alerts_today: int = 0
    overdue_tickets: int
    avg_resolution_hours: float
    sla_compliance_percentage: float
    my_assigned_count: int = 0
    unassigned_queue_count: int = 0


class TrendPoint(BaseModel):
    label: str
    date: str
    created: int
    resolved: int


class DashboardTrendsResponse(BaseModel):
    daily: List[TrendPoint]
    weekly: List[TrendPoint]
    monthly: List[TrendPoint]


class DistributionItem(BaseModel):
    name: str
    key: str
    value: int
    percentage: float


class AgentPerformanceItem(BaseModel):
    agent_id: int
    agent_name: str
    email: str
    support_team: str
    assigned_total: int
    resolved_count: int
    pending_workload: int
    sla_compliance_rate: float
    avg_resolution_hours: float


class DashboardDistributionResponse(BaseModel):
    by_status: List[DistributionItem]
    by_priority: List[DistributionItem]
    by_category: List[DistributionItem]
    recent_tickets: List[TicketListItemResponse]
    agent_performance: List[AgentPerformanceItem]
