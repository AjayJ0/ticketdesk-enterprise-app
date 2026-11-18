from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.api.v1 import api_router
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine, get_db
from app.core.exceptions import register_exception_handlers
from app.core.logging_config import logger
from app.services.seed_service import seed_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.APP_NAME} ({settings.APP_ENV})...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
    except Exception as exc:
        logger.error(f"Database initialization/seeding error: {exc}", exc_info=True)
    finally:
        db.close()
    yield
    logger.info(f"Shutting down {settings.APP_NAME}...")


app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "Enterprise IT Service Management (ITSM) Platform API — "
        "Full-lifecycle incident & service request management, SLA tracking, "
        "role-based access control, knowledge base, analytics, audit trail, and AWS S3/Lambda integration."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

register_exception_handlers(app)
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["Health"])
@app.get(f"{settings.API_V1_STR}/health", tags=["Health"])
def health_check(db: Session = Depends(get_db)) -> dict:
    db_status = "healthy"
    db_dialect = engine.dialect.name
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.error(f"Health check DB error: {exc}")
        db_status = "unhealthy"

    return {
        "status": "ok" if db_status == "healthy" else "degraded",
        "service": settings.APP_NAME,
        "version": "1.0.0",
        "environment": settings.APP_ENV,
        "database": {
            "status": db_status,
            "engine": db_dialect,
        },
        "storage": {
            "provider": settings.STORAGE_PROVIDER,
            "s3_bucket": settings.S3_BUCKET_NAME if settings.STORAGE_PROVIDER == "s3" else None,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
