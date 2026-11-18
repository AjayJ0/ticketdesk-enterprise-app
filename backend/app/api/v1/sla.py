from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.core.exceptions import AppException
from app.middleware.rate_limit import get_client_ip
from app.models.ticket import SLAPolicy
from app.models.user import User
from app.schemas.ticket import SLAPolicyResponse, SLAPolicyUpdateRequest
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/sla", tags=["SLA Management"])


@router.get("", response_model=List[SLAPolicyResponse])
def list_sla_policies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[SLAPolicyResponse]:
    policies = db.query(SLAPolicy).order_by(SLAPolicy.response_target_minutes.asc()).all()
    return [SLAPolicyResponse.model_validate(p) for p in policies]


@router.put("/{policy_id}", response_model=SLAPolicyResponse)
def update_sla_policy(
    policy_id: int,
    payload: SLAPolicyUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> SLAPolicyResponse:
    policy = db.query(SLAPolicy).filter(SLAPolicy.id == policy_id).first()
    if not policy:
        raise AppException("SLA policy not found.", status.HTTP_404_NOT_FOUND)

    if payload.name is not None:
        policy.name = payload.name.strip()
    if payload.response_target_minutes is not None:
        policy.response_target_minutes = payload.response_target_minutes
    if payload.resolution_target_minutes is not None:
        policy.resolution_target_minutes = payload.resolution_target_minutes
    if payload.business_hours_only is not None:
        policy.business_hours_only = payload.business_hours_only
    if payload.description is not None:
        policy.description = payload.description
    if payload.is_active is not None:
        policy.is_active = payload.is_active

    policy.updated_at = datetime.now(timezone.utc)

    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="SLA_POLICY_UPDATED",
        entity_type="sla_policy",
        entity_id=policy.priority,
        metadata={
            "response_target_minutes": policy.response_target_minutes,
            "resolution_target_minutes": policy.resolution_target_minutes,
            "business_hours_only": policy.business_hours_only,
        },
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(policy)
    return SLAPolicyResponse.model_validate(policy)
