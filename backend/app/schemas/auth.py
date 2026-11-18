from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=4, max_length=128)


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10)


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None


class AdminProfileUpdateRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    email: EmailStr
    employee_id: Optional[str] = Field(None, max_length=50)
    job_title: Optional[str] = Field(None, max_length=120)
    phone: Optional[str] = Field(None, max_length=40)
    department_id: Optional[int] = None
    support_team_id: Optional[int] = None
    new_password: Optional[str] = Field(None, min_length=4, max_length=128)


class ForgotPasswordOTPRequest(BaseModel):
    email: Optional[EmailStr] = None
    phone: str = Field(..., min_length=6, max_length=40)


class ForgotPasswordOTPResponse(BaseModel):
    success: bool
    message: str
    masked_phone: str
    email: str
    expires_in_seconds: int
    dev_otp_code: Optional[str] = None


class ForgotPasswordResetRequest(BaseModel):
    email: Optional[EmailStr] = None
    phone: str = Field(..., min_length=6, max_length=40)
    otp_code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=4, max_length=128)


class UserRoleInfo(BaseModel):
    id: int
    name: str
    display_name: str

    model_config = {"from_attributes": True}


class DepartmentInfo(BaseModel):
    id: int
    name: str
    code: str
    location: Optional[str] = None

    model_config = {"from_attributes": True}


class SupportTeamInfo(BaseModel):
    id: int
    name: str
    code: str
    specialization: Optional[str] = None

    model_config = {"from_attributes": True}


class AuthUserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    employee_id: Optional[str] = None
    job_title: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool
    role: str
    role_info: Optional[UserRoleInfo] = None
    department: Optional[DepartmentInfo] = None
    support_team: Optional[SupportTeamInfo] = None
    last_login_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: AuthUserResponse
