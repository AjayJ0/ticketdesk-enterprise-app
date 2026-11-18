import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user, require_agent_or_admin
from app.core.exceptions import AppException
from app.middleware.rate_limit import get_client_ip
from app.models.system import KnowledgeArticle
from app.models.user import User
from app.schemas.system import (
    KnowledgeArticleCreateRequest,
    KnowledgeArticleResponse,
    KnowledgeArticleUpdateRequest,
)
from app.services.audit_service import record_audit_log

router = APIRouter(prefix="/knowledge", tags=["Knowledge Base"])


def _slugify(title: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return base or f"article-{uuid.uuid4().hex[:8]}"


def _serialize_article(article: KnowledgeArticle) -> KnowledgeArticleResponse:
    tags_list = [t.strip() for t in (article.tags or "").split(",") if t.strip()]
    return KnowledgeArticleResponse(
        id=article.id,
        title=article.title,
        slug=article.slug,
        summary=article.summary,
        content=article.content,
        category_id=article.category_id,
        category_name=article.category_rel.name if article.category_rel else "General IT",
        author_id=article.author_id,
        author_name=article.author.full_name if article.author else "IT Knowledge Team",
        tags=tags_list,
        is_published=article.is_published,
        view_count=article.view_count,
        helpful_count=article.helpful_count,
        created_at=article.created_at,
        updated_at=article.updated_at,
    )


@router.get("", response_model=List[KnowledgeArticleResponse])
def list_knowledge_articles(
    search: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    include_unpublished: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[KnowledgeArticleResponse]:
    q = db.query(KnowledgeArticle)
    if current_user.role == "employee" or not include_unpublished:
        q = q.filter(KnowledgeArticle.is_published == True)  # noqa: E712

    if category_id:
        q = q.filter(KnowledgeArticle.category_id == category_id)

    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                KnowledgeArticle.title.ilike(term),
                KnowledgeArticle.summary.ilike(term),
                KnowledgeArticle.content.ilike(term),
                KnowledgeArticle.tags.ilike(term),
            )
        )

    articles = q.order_by(KnowledgeArticle.view_count.desc(), KnowledgeArticle.updated_at.desc()).all()
    return [_serialize_article(a) for a in articles]


@router.get("/{article_id}", response_model=KnowledgeArticleResponse)
def get_knowledge_article(
    article_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KnowledgeArticleResponse:
    if article_id.isdigit():
        article = db.query(KnowledgeArticle).filter(KnowledgeArticle.id == int(article_id)).first()
    else:
        article = db.query(KnowledgeArticle).filter(KnowledgeArticle.slug == article_id).first()

    if not article:
        raise AppException("Knowledge base article not found.", status.HTTP_404_NOT_FOUND)
    if not article.is_published and current_user.role == "employee":
        raise AppException("Article is not published.", status.HTTP_403_FORBIDDEN)

    article.view_count = (article.view_count or 0) + 1
    db.commit()
    db.refresh(article)
    return _serialize_article(article)


@router.post("", response_model=KnowledgeArticleResponse, status_code=status.HTTP_201_CREATED)
def create_knowledge_article(
    payload: KnowledgeArticleCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
) -> KnowledgeArticleResponse:
    slug = _slugify(payload.title)
    if db.query(KnowledgeArticle).filter(KnowledgeArticle.slug == slug).first():
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    now = datetime.now(timezone.utc)
    article = KnowledgeArticle(
        title=payload.title.strip(),
        slug=slug,
        summary=payload.summary.strip(),
        content=payload.content.strip(),
        category_id=payload.category_id,
        author_id=current_user.id,
        tags=payload.tags,
        is_published=payload.is_published,
        created_at=now,
        updated_at=now,
    )
    db.add(article)
    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="KB_ARTICLE_CREATED",
        entity_type="knowledge_article",
        entity_id=slug,
        metadata={"title": article.title, "is_published": article.is_published},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(article)
    return _serialize_article(article)


@router.put("/{article_id}", response_model=KnowledgeArticleResponse)
def update_knowledge_article(
    article_id: int,
    payload: KnowledgeArticleUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent_or_admin),
) -> KnowledgeArticleResponse:
    article = db.query(KnowledgeArticle).filter(KnowledgeArticle.id == article_id).first()
    if not article:
        raise AppException("Knowledge base article not found.", status.HTTP_404_NOT_FOUND)

    if payload.title is not None:
        article.title = payload.title.strip()
    if payload.summary is not None:
        article.summary = payload.summary.strip()
    if payload.content is not None:
        article.content = payload.content.strip()
    if payload.category_id is not None:
        article.category_id = payload.category_id if payload.category_id > 0 else None
    if payload.tags is not None:
        article.tags = payload.tags
    if payload.is_published is not None:
        article.is_published = payload.is_published

    article.updated_at = datetime.now(timezone.utc)

    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="KB_ARTICLE_UPDATED",
        entity_type="knowledge_article",
        entity_id=article.id,
        metadata={"title": article.title, "is_published": article.is_published},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(article)
    return _serialize_article(article)


@router.post("/{article_id}/helpful", response_model=KnowledgeArticleResponse)
def mark_article_helpful(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KnowledgeArticleResponse:
    article = db.query(KnowledgeArticle).filter(KnowledgeArticle.id == article_id).first()
    if not article:
        raise AppException("Article not found.", status.HTTP_404_NOT_FOUND)
    article.helpful_count = (article.helpful_count or 0) + 1
    db.commit()
    db.refresh(article)
    return _serialize_article(article)
