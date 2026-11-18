from fastapi import APIRouter
from app.api.v1 import (
    audit_logs,
    auth,
    dashboard,
    knowledge,
    notifications,
    reports,
    settings,
    sla,
    tickets,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(tickets.router)
api_router.include_router(dashboard.router)
api_router.include_router(users.router)
api_router.include_router(reports.router)
api_router.include_router(sla.router)
api_router.include_router(knowledge.router)
api_router.include_router(notifications.router)
api_router.include_router(audit_logs.router)
api_router.include_router(settings.router)
