from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.middleware.rate_limit import get_client_ip
from app.models.system import SystemSetting
from app.models.user import User
from app.schemas.system import SystemSettingResponse, SystemSettingUpdateRequest
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/settings", tags=["Application Settings"])


def _serialize_setting(s: SystemSetting) -> SystemSettingResponse:
    return SystemSettingResponse(
        id=s.id,
        key=s.key,
        value=s.value,
        category=s.category,
        description=s.description,
        updated_by_name=s.updated_by.full_name if s.updated_by else "System",
        updated_at=s.updated_at,
    )


@router.get("", response_model=List[SystemSettingResponse])
def list_system_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[SystemSettingResponse]:
    settings_list = db.query(SystemSetting).order_by(SystemSetting.id.asc()).all()
    return [_serialize_setting(s) for s in settings_list]


@router.put("", response_model=List[SystemSettingResponse])
def update_system_settings(
    payload: SystemSettingUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> List[SystemSettingResponse]:
    now = datetime.now(timezone.utc)
    updated_keys = []

    for key, val in payload.settings.items():
        setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if setting:
            setting.value = str(val)
            setting.updated_by_id = current_user.id
            setting.updated_at = now
            updated_keys.append(key)
        else:
            new_s = SystemSetting(
                key=key,
                value=str(val),
                category="general",
                updated_by_id=current_user.id,
                updated_at=now,
            )
            db.add(new_s)
            updated_keys.append(key)

    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="SYSTEM_SETTINGS_UPDATED",
        entity_type="system_settings",
        entity_id="global",
        metadata={"updated_keys": updated_keys},
        ip_address=get_client_ip(request),
    )
    db.commit()

    settings_list = db.query(SystemSetting).order_by(SystemSetting.id.asc()).all()
    return [_serialize_setting(s) for s in settings_list]
