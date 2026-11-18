from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.dashboard import (
    DashboardDistributionResponse,
    DashboardSummaryResponse,
    DashboardTrendsResponse,
)
from app.services.analytics_service import (
    get_dashboard_distribution_service,
    get_dashboard_summary_service,
    get_dashboard_trends_service,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardSummaryResponse:
    return get_dashboard_summary_service(db, current_user)


@router.get("/trends", response_model=DashboardTrendsResponse)
def get_dashboard_trends(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardTrendsResponse:
    return get_dashboard_trends_service(db, current_user)


@router.get("/distribution", response_model=DashboardDistributionResponse)
def get_dashboard_distribution(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardDistributionResponse:
    return get_dashboard_distribution_service(db, current_user)
