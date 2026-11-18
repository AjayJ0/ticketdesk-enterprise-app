import json
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.core.exceptions import AppException
from app.middleware.rate_limit import get_client_ip
from app.models.ticket import TicketAttachment, TicketCategory
from app.models.user import User
from app.schemas.ticket import (
    CategoryCreateRequest,
    CategoryResponse,
    PaginatedTicketsResponse,
    TicketAssignRequest,
    TicketAttachmentResponse,
    TicketCommentCreateRequest,
    TicketCommentResponse,
    TicketCreateRequest,
    TicketDetailResponse,
    TicketStatusUpdateRequest,
    TicketUpdateRequest,
)
from app.services.audit_service import record_audit_log
from app.services.ticket_service import (
    add_ticket_comment_service,
    assign_ticket_service,
    build_user_summary,
    check_ticket_access,
    create_ticket_service,
    get_ticket_by_id_or_number,
    list_tickets_service,
    serialize_ticket_detail,
    update_ticket_service,
    update_ticket_status_service,
    upload_ticket_attachment_service,
)
from app.storage.provider import get_storage_provider

router = APIRouter(prefix="/tickets", tags=["Tickets"])


def _serialize_category(cat: TicketCategory) -> CategoryResponse:
    subs: List[str] = []
    if cat.subcategories_json:
        try:
            subs = json.loads(cat.subcategories_json)
        except Exception:
            subs = []
    return CategoryResponse(
        id=cat.id,
        name=cat.name,
        slug=cat.slug,
        description=cat.description,
        subcategories=subs,
        icon=cat.icon,
        is_active=cat.is_active,
    )


@router.get("/categories", response_model=List[CategoryResponse])
def list_ticket_categories(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[CategoryResponse]:
    q = db.query(TicketCategory)
    if not include_inactive or current_user.role != "admin":
        q = q.filter(TicketCategory.is_active == True)  # noqa: E712
    categories = q.order_by(TicketCategory.id.asc()).all()
    return [_serialize_category(c) for c in categories]


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_ticket_category(
    payload: CategoryCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> CategoryResponse:
    exists = (
        db.query(TicketCategory)
        .filter((TicketCategory.name == payload.name) | (TicketCategory.slug == payload.slug))
        .first()
    )
    if exists:
        raise AppException("Category with this name or slug already exists.", status.HTTP_409_CONFLICT)

    cat = TicketCategory(
        name=payload.name.strip(),
        slug=payload.slug.strip().lower(),
        description=payload.description,
        subcategories_json=json.dumps(payload.subcategories),
        icon=payload.icon,
        is_active=payload.is_active,
    )
    db.add(cat)
    record_audit_log(
        db=db,
        user_id=current_user.id,
        action="CATEGORY_CREATED",
        entity_type="ticket_category",
        entity_id=payload.slug,
        metadata={"name": payload.name},
    )
    db.commit()
    db.refresh(cat)
    return _serialize_category(cat)


@router.get("", response_model=PaginatedTicketsResponse)
def list_tickets(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    priority_filter: Optional[str] = Query(None, alias="priority"),
    category_id: Optional[int] = Query(None),
    assigned_to_me: bool = Query(False),
    my_tickets: bool = Query(False),
    unassigned_only: bool = Query(False),
    overdue_only: bool = Query(False),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedTicketsResponse:
    return list_tickets_service(
        db=db,
        current_user=current_user,
        page=page,
        page_size=page_size,
        search=search,
        status_filter=status_filter,
        priority_filter=priority_filter,
        category_id=category_id,
        assigned_to_me=assigned_to_me,
        my_tickets=my_tickets,
        unassigned_only=unassigned_only,
        overdue_only=overdue_only,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.post("", response_model=TicketDetailResponse, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: TicketCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketDetailResponse:
    ticket = create_ticket_service(
        db=db,
        payload=payload,
        current_user=current_user,
        ip_address=get_client_ip(request),
    )
    return serialize_ticket_detail(ticket, current_user)


@router.get("/{ticket_id}", response_model=TicketDetailResponse)
def get_ticket_details(
    ticket_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketDetailResponse:
    ticket = get_ticket_by_id_or_number(db, ticket_id)
    check_ticket_access(ticket, current_user)
    return serialize_ticket_detail(ticket, current_user)


@router.put("/{ticket_id}", response_model=TicketDetailResponse)
def update_ticket(
    ticket_id: str,
    payload: TicketUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketDetailResponse:
    ticket = get_ticket_by_id_or_number(db, ticket_id)
    updated = update_ticket_service(
        db=db,
        ticket=ticket,
        payload=payload,
        current_user=current_user,
        ip_address=get_client_ip(request),
    )
    return serialize_ticket_detail(updated, current_user)


@router.patch("/{ticket_id}/status", response_model=TicketDetailResponse)
def update_ticket_status(
    ticket_id: str,
    payload: TicketStatusUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketDetailResponse:
    ticket = get_ticket_by_id_or_number(db, ticket_id)
    updated = update_ticket_status_service(
        db=db,
        ticket=ticket,
        payload=payload,
        current_user=current_user,
        ip_address=get_client_ip(request),
    )
    return serialize_ticket_detail(updated, current_user)


@router.patch("/{ticket_id}/assign", response_model=TicketDetailResponse)
def assign_ticket(
    ticket_id: str,
    payload: TicketAssignRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketDetailResponse:
    ticket = get_ticket_by_id_or_number(db, ticket_id)
    updated = assign_ticket_service(
        db=db,
        ticket=ticket,
        payload=payload,
        current_user=current_user,
        ip_address=get_client_ip(request),
    )
    return serialize_ticket_detail(updated, current_user)


@router.post("/{ticket_id}/comments", response_model=TicketCommentResponse, status_code=status.HTTP_201_CREATED)
def add_ticket_comment(
    ticket_id: str,
    payload: TicketCommentCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketCommentResponse:
    ticket = get_ticket_by_id_or_number(db, ticket_id)
    comment = add_ticket_comment_service(
        db=db,
        ticket=ticket,
        payload=payload,
        current_user=current_user,
        ip_address=get_client_ip(request),
    )
    author_summary = build_user_summary(comment.author)
    assert author_summary is not None
    return TicketCommentResponse(
        id=comment.id,
        ticket_id=comment.ticket_id,
        author_id=comment.author_id,
        author=author_summary,
        body=comment.body,
        is_internal=comment.is_internal,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.post(
    "/{ticket_id}/attachments",
    response_model=TicketAttachmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_ticket_attachment(
    ticket_id: str,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketAttachmentResponse:
    ticket = get_ticket_by_id_or_number(db, ticket_id)
    att = await upload_ticket_attachment_service(
        db=db,
        ticket=ticket,
        file=file,
        current_user=current_user,
        ip_address=get_client_ip(request),
    )
    return TicketAttachmentResponse(
        id=att.id,
        ticket_id=att.ticket_id,
        uploaded_by_id=att.uploaded_by_id,
        uploaded_by_name=current_user.full_name,
        original_filename=att.original_filename,
        content_type=att.content_type,
        file_size=att.file_size,
        storage_provider=att.storage_provider,
        created_at=att.created_at,
    )


@router.get("/{ticket_id}/attachments/{attachment_id}/download")
def download_ticket_attachment(
    ticket_id: str,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = get_ticket_by_id_or_number(db, ticket_id)
    check_ticket_access(ticket, current_user)

    attachment = (
        db.query(TicketAttachment)
        .filter(
            TicketAttachment.id == attachment_id,
            TicketAttachment.ticket_id == ticket.id,
        )
        .first()
    )
    if not attachment:
        raise AppException(
            message="Attachment not found for this ticket.",
            status_code=status.HTTP_404_NOT_FOUND,
            error_code="ATTACHMENT_NOT_FOUND",
        )

    provider = get_storage_provider()
    if attachment.storage_provider == "s3":
        presigned = provider.get_presigned_url(
            storage_key=attachment.storage_key,
            original_filename=attachment.original_filename,
        )
        if presigned:
            return RedirectResponse(url=presigned)

    file_bytes = provider.get_file_bytes(attachment.storage_key)
    headers = {
        "Content-Disposition": f'attachment; filename="{attachment.original_filename}"'
    }
    return Response(
        content=file_bytes,
        media_type=attachment.content_type,
        headers=headers,
    )
