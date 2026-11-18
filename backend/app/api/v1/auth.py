from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import AppException
from app.core.security import (
    create_access_token,
    create_refresh_token_value,
    hash_token,
    verify_password,
)
from app.middleware.rate_limit import get_client_ip, login_rate_limiter
from app.models.user import RefreshToken, User
from app.schemas.auth import (
    AuthUserResponse,
    DepartmentInfo,
    LoginRequest,
    LogoutRequest,
    RefreshTokenRequest,
    SupportTeamInfo,
    TokenResponse,
    UserRoleInfo,
)
from app.services.audit_service import record_audit_log
from app.services.sla_service import ensure_utc

router = APIRouter(prefix="/auth", tags=["Authentication"])


def build_auth_user_response(user: User) -> AuthUserResponse:
    return AuthUserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        employee_id=user.employee_id,
        job_title=user.job_title,
        phone=user.phone,
        is_active=user.is_active,
        role=user.role,
        role_info=UserRoleInfo.model_validate(user.role_rel) if user.role_rel else None,
        department=DepartmentInfo.model_validate(user.department_rel) if user.department_rel else None,
        support_team=SupportTeamInfo.model_validate(user.support_team_rel) if user.support_team_rel else None,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    ip = get_client_ip(request)
    rate_key = f"{ip}:{payload.email.lower()}"
    login_rate_limiter.check(rate_key)

    user = (
        db.query(User)
        .filter(func.lower(User.email) == payload.email.lower().strip())
        .first()
    )
    if not user or not verify_password(payload.password, user.hashed_password):
        login_rate_limiter.record_failure(rate_key)
        raise AppException(
            message="Invalid email address or password.",
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code="INVALID_CREDENTIALS",
        )

    if not user.is_active:
        raise AppException(
            message="Your account has been deactivated. Please contact an IT Administrator.",
            status_code=status.HTTP_403_FORBIDDEN,
            error_code="ACCOUNT_DEACTIVATED",
        )

    login_rate_limiter.reset(rate_key)
    now = datetime.now(timezone.utc)
    user.last_login_at = now

    access_token = create_access_token(subject=user.id, role=user.role)
    raw_refresh = create_refresh_token_value()
    refresh_record = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_refresh),
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        revoked=False,
        user_agent=request.headers.get("User-Agent", "")[:255],
        ip_address=ip,
        created_at=now,
    )
    db.add(refresh_record)

    record_audit_log(
        db=db,
        user_id=user.id,
        action="USER_LOGIN",
        entity_type="user",
        entity_id=user.id,
        metadata={"email": user.email, "role": user.role},
        ip_address=ip,
        user_agent=request.headers.get("User-Agent", "")[:255],
    )
    db.commit()
    db.refresh(user)

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=build_auth_user_response(user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_access_token(
    payload: RefreshTokenRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    token_hash = hash_token(payload.refresh_token)
    record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

    now = datetime.now(timezone.utc)
    if not record or record.revoked:
        raise AppException(
            message="Refresh token is invalid or has been revoked.",
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code="INVALID_REFRESH_TOKEN",
        )

    exp = ensure_utc(record.expires_at)
    if not exp or exp < now:
        record.revoked = True
        record.revoked_at = now
        db.commit()
        raise AppException(
            message="Refresh token has expired. Please sign in again.",
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code="REFRESH_TOKEN_EXPIRED",
        )

    user = db.query(User).filter(User.id == record.user_id, User.is_active == True).first()  # noqa: E712
    if not user:
        raise AppException(
            message="User account is no longer active.",
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code="USER_INACTIVE",
        )

    # Rotate refresh token
    record.revoked = True
    record.revoked_at = now

    new_refresh_raw = create_refresh_token_value()
    new_record = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(new_refresh_raw),
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        revoked=False,
        user_agent=request.headers.get("User-Agent", "")[:255],
        ip_address=get_client_ip(request),
        created_at=now,
    )
    db.add(new_record)
    db.commit()

    access_token = create_access_token(subject=user.id, role=user.role)
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_raw,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=build_auth_user_response(user),
    )


@router.post("/logout")
def logout(
    payload: LogoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    now = datetime.now(timezone.utc)
    if payload.refresh_token:
        token_hash = hash_token(payload.refresh_token)
        record = (
            db.query(RefreshToken)
            .filter(
                RefreshToken.token_hash == token_hash,
                RefreshToken.user_id == current_user.id,
            )
            .first()
        )
        if record and not record.revoked:
            record.revoked = True
            record.revoked_at = now
    else:
        # Revoke all active refresh tokens for this user
        db.query(RefreshToken).filter(
            RefreshToken.user_id == current_user.id,
            RefreshToken.revoked == False,  # noqa: E712
        ).update({"revoked": True, "revoked_at": now})

    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="USER_LOGOUT",
        entity_type="user",
        entity_id=current_user.id,
        metadata={"email": current_user.email},
    )
    db.commit()
    return {"success": True, "message": "Logged out and invalidated refresh token."}


@router.get("/me", response_model=AuthUserResponse)
def get_me(current_user: User = Depends(get_current_user)) -> AuthUserResponse:
    return build_auth_user_response(current_user)
