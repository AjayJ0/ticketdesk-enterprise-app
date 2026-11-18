from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_agent_or_admin
from app.core.exceptions import AppException
from app.core.security import get_password_hash
from app.middleware.rate_limit import get_client_ip
from app.models.organization import Department, Role, SupportTeam
from app.models.user import User
from app.schemas.auth import DepartmentInfo, SupportTeamInfo, UserRoleInfo
from app.schemas.user import (
    DepartmentCreateRequest,
    PaginatedUsersResponse,
    SupportTeamCreateRequest,
    UserCreateRequest,
    UserDetailResponse,
    UserRoleUpdateRequest,
    UserSummary,
    UserUpdateRequest,
)
from app.services.audit_service import record_audit_log
from app.services.ticket_service import build_user_summary

router = APIRouter(prefix="/users", tags=["Users & Organization"])


def _serialize_user_detail(user: User) -> UserDetailResponse:
    return UserDetailResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        employee_id=user.employee_id,
        job_title=user.job_title,
        phone=user.phone,
        is_active=user.is_active,
        role=user.role,
        role_id=user.role_id,
        department_id=user.department_id,
        support_team_id=user.support_team_id,
        role_info=UserRoleInfo.model_validate(user.role_rel) if user.role_rel else None,
        department=DepartmentInfo.model_validate(user.department_rel) if user.department_rel else None,
        support_team=SupportTeamInfo.model_validate(user.support_team_rel) if user.support_team_rel else None,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get("/departments", response_model=List[DepartmentInfo])
def list_departments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[DepartmentInfo]:
    depts = db.query(Department).filter(Department.is_active == True).order_by(Department.name.asc()).all()  # noqa: E712
    return [DepartmentInfo.model_validate(d) for d in depts]


@router.post("/departments", response_model=DepartmentInfo, status_code=status.HTTP_201_CREATED)
def create_department(
    payload: DepartmentCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> DepartmentInfo:
    exists = (
        db.query(Department)
        .filter((Department.name == payload.name) | (Department.code == payload.code.upper()))
        .first()
    )
    if exists:
        raise AppException("Department with this name or code already exists.", status.HTTP_409_CONFLICT)

    dept = Department(
        name=payload.name.strip(),
        code=payload.code.strip().upper(),
        description=payload.description,
        location=payload.location,
        is_active=True,
    )
    db.add(dept)
    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="DEPARTMENT_CREATED",
        entity_type="department",
        entity_id=dept.code,
        metadata={"name": dept.name},
    )
    db.commit()
    db.refresh(dept)
    return DepartmentInfo.model_validate(dept)


@router.get("/support-teams", response_model=List[SupportTeamInfo])
def list_support_teams(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[SupportTeamInfo]:
    teams = db.query(SupportTeam).filter(SupportTeam.is_active == True).order_by(SupportTeam.name.asc()).all()  # noqa: E712
    return [SupportTeamInfo.model_validate(t) for t in teams]


@router.post("/support-teams", response_model=SupportTeamInfo, status_code=status.HTTP_201_CREATED)
def create_support_team(
    payload: SupportTeamCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> SupportTeamInfo:
    exists = (
        db.query(SupportTeam)
        .filter((SupportTeam.name == payload.name) | (SupportTeam.code == payload.code.upper()))
        .first()
    )
    if exists:
        raise AppException("Support team with this name or code already exists.", status.HTTP_409_CONFLICT)

    team = SupportTeam(
        name=payload.name.strip(),
        code=payload.code.strip().upper(),
        description=payload.description,
        specialization=payload.specialization,
        is_active=True,
    )
    db.add(team)
    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="SUPPORT_TEAM_CREATED",
        entity_type="support_team",
        entity_id=team.code,
        metadata={"name": team.name},
    )
    db.commit()
    db.refresh(team)
    return SupportTeamInfo.model_validate(team)


@router.get("/agents", response_model=List[UserSummary])
def list_support_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
) -> List[UserSummary]:
    agents = (
        db.query(User)
        .join(Role, User.role_id == Role.id)
        .filter(Role.name.in_(["agent", "admin"]), User.is_active == True)  # noqa: E712
        .order_by(User.full_name.asc())
        .all()
    )
    result = []
    for a in agents:
        summary = build_user_summary(a)
        if summary:
            result.append(summary)
    return result


@router.get("", response_model=PaginatedUsersResponse)
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> PaginatedUsersResponse:
    query = db.query(User).join(Role, User.role_id == Role.id)

    if role and role != "all":
        query = query.filter(Role.name == role)
    if department_id:
        query = query.filter(User.department_id == department_id)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(term),
                User.email.ilike(term),
                User.employee_id.ilike(term),
                User.job_title.ilike(term),
            )
        )

    total = query.count()
    users = (
        query.order_by(User.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [_serialize_user_detail(u) for u in users]
    total_pages = max(1, (total + page_size - 1) // page_size)

    return PaginatedUsersResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("", response_model=UserDetailResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> UserDetailResponse:
    existing_email = (
        db.query(User)
        .filter(func.lower(User.email) == payload.email.lower().strip())
        .first()
    )
    if existing_email:
        raise AppException("A user with this email address already exists.", status.HTTP_409_CONFLICT, "EMAIL_EXISTS")

    if payload.employee_id:
        existing_emp = db.query(User).filter(User.employee_id == payload.employee_id.strip()).first()
        if existing_emp:
            raise AppException("Employee ID is already assigned to another user.", status.HTTP_409_CONFLICT)

    role_obj = db.query(Role).filter(Role.name == payload.role).first()
    if not role_obj:
        raise AppException("Invalid role specified.", status.HTTP_400_BAD_REQUEST)

    now = datetime.now(timezone.utc)
    new_user = User(
        email=payload.email.lower().strip(),
        full_name=payload.full_name.strip(),
        employee_id=payload.employee_id.strip() if payload.employee_id else None,
        job_title=payload.job_title,
        phone=payload.phone,
        hashed_password=get_password_hash(payload.password),
        is_active=payload.is_active,
        role_id=role_obj.id,
        department_id=payload.department_id,
        support_team_id=payload.support_team_id,
        created_at=now,
        updated_at=now,
    )
    db.add(new_user)
    db.flush()

    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="USER_CREATED",
        entity_type="user",
        entity_id=new_user.id,
        metadata={
            "email": new_user.email,
            "full_name": new_user.full_name,
            "role": payload.role,
        },
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(new_user)
    return _serialize_user_detail(new_user)


@router.put("/{user_id}", response_model=UserDetailResponse)
def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> UserDetailResponse:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise AppException("User not found.", status.HTTP_404_NOT_FOUND)

    if payload.is_active is False and user.id == current_user.id:
        raise AppException("You cannot deactivate your own administrator account.", status.HTTP_400_BAD_REQUEST)

    changes = {}
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
        changes["full_name"] = user.full_name
    if payload.employee_id is not None:
        user.employee_id = payload.employee_id.strip() or None
        changes["employee_id"] = user.employee_id
    if payload.job_title is not None:
        user.job_title = payload.job_title
        changes["job_title"] = user.job_title
    if payload.phone is not None:
        user.phone = payload.phone
        changes["phone"] = user.phone
    if payload.department_id is not None:
        user.department_id = payload.department_id if payload.department_id > 0 else None
        changes["department_id"] = user.department_id
    if payload.support_team_id is not None:
        user.support_team_id = payload.support_team_id if payload.support_team_id > 0 else None
        changes["support_team_id"] = user.support_team_id
    if payload.is_active is not None:
        user.is_active = payload.is_active
        changes["is_active"] = user.is_active
    if payload.password:
        user.hashed_password = get_password_hash(payload.password)
        changes["password_reset"] = True

    user.updated_at = datetime.now(timezone.utc)

    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="USER_UPDATED",
        entity_type="user",
        entity_id=user.id,
        metadata={"email": user.email, "changes": changes},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(user)
    return _serialize_user_detail(user)


@router.patch("/{user_id}/role", response_model=UserDetailResponse)
def update_user_role(
    user_id: int,
    payload: UserRoleUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> UserDetailResponse:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise AppException("User not found.", status.HTTP_404_NOT_FOUND)

    if user.id == current_user.id and payload.role != "admin":
        raise AppException("Administrators cannot demote their own role.", status.HTTP_400_BAD_REQUEST)

    role_obj = db.query(Role).filter(Role.name == payload.role).first()
    if not role_obj:
        raise AppException("Role not found.", status.HTTP_400_BAD_REQUEST)

    old_role = user.role
    user.role_id = role_obj.id
    if payload.support_team_id is not None:
        user.support_team_id = payload.support_team_id if payload.support_team_id > 0 else None

    user.updated_at = datetime.now(timezone.utc)

    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="USER_ROLE_MODIFIED",
        entity_type="user",
        entity_id=user.id,
        metadata={
            "email": user.email,
            "old_role": old_role,
            "new_role": payload.role,
        },
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(user)
    return _serialize_user_detail(user)
