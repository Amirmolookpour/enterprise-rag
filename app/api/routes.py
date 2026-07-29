import os
import json
import uuid
import shutil
from pathlib import Path
from typing import List, Union
from datetime import datetime

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.core.logger import logger
from app.database.connection import get_db
from app.database import models
from app.services.ingestion import ingestion_service
from app.services.chat_engine import chat_engine_service, LLMGenerationError
from app.vector_store.faiss_store import hybrid_store_service

router = APIRouter(prefix="/api/v1", tags=["Documents", "Chat"])

# ====================================
# Constants
# ====================================

# باید با accept attribute تو فرانت (Sidebar.jsx) هماهنگ بمونه
ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".docx", ".csv", ".txt", ".md"}

# ====================================
# Pydantic Schemas — Documents
# ====================================

class DocumentResponse(BaseModel):
    id: int
    filename: str
    workspace_id: int
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UploadResponse(BaseModel):
    status: str
    message: str
    document_id: int
    chunks_processed: int

# ====================================
# Pydantic Schemas — Chat
# ====================================

class ChatSessionResponse(BaseModel):
    id: int
    workspace_id: int
    title: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ChatMessageRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=1000, description="User question about documents")

class CitationModel(BaseModel):
    document_id: int
    filename: str
    page: Union[str, int]

class ChatMessageResponse(BaseModel):
    answer: str
    citations: List[CitationModel] = []

class MessageResponse(BaseModel):
    role: str
    content: str
    citations: List[CitationModel] = []
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)

# ====================================
# Helpers
# ====================================

def _cleanup_file(file_path: str) -> None:
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError as e:
            logger.error(f"Failed to clean up orphaned file {file_path}: {str(e)}")


def _serialize_message(msg: models.Message) -> MessageResponse:
    citations = []
    if msg.citations:
        try:
            citations = json.loads(msg.citations)
        except (json.JSONDecodeError, TypeError):
            citations = []
    return MessageResponse(
        role=msg.role.value if hasattr(msg.role, "value") else str(msg.role),
        content=msg.content,
        citations=citations,
        timestamp=msg.timestamp
    )


def _get_workspace_or_404(db: Session, workspace_id: int) -> models.Workspace:
    workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return workspace


def _get_session_or_404(db: Session, session_id: int) -> models.ChatSession:
    session = db.query(models.ChatSession).filter(models.ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    return session

# ====================================
# API Endpoints — Documents
# ====================================

@router.post("/workspaces/{workspace_id}/upload", response_model=UploadResponse)
def upload_document(
    workspace_id: int,
    file: UploadFile = File(...),
    extract_img: bool = Form(False),
    db: Session = Depends(get_db)
):
    logger.info(f"Received upload request for workspace {workspace_id}:{file.filename}")

    _get_workspace_or_404(db, workspace_id)

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided")

    safe_filename = Path(file.filename).name
    extension = Path(safe_filename).suffix.lower()
    if extension not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{extension}'. Allowed types: {', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))}"
        )

    unique_name = f"{workspace_id}_{uuid.uuid4().hex[:8]}_{safe_filename}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_name)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info(f"File saved to disk safely: {file_path}")
    except Exception as e:
        logger.error(f"Disk IO error while saving file: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save file to disk")

    try:
        chunks = ingestion_service.process_document(file_path, extract_images=extract_img)
    except Exception as e:
        logger.error(f"Ingestion engine failed for {file_path}: {str(e)}")
        _cleanup_file(file_path)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Document processing failed. Check the file and try again.")

    if not chunks:
        logger.warning(f"No extractable text/data found in {file.filename}")
        _cleanup_file(file_path)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty or contains no readable content")

    try:
        new_doc = models.Document(
            workspace_id=workspace_id,
            filename=safe_filename,
            file_path=file_path
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        logger.info(f"Document registered in DB successfully (ID: {new_doc.id})")
    except Exception as e:
        db.rollback()
        logger.error(f"DB registration error: {str(e)}")
        _cleanup_file(file_path)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error saving document metadata")

    for chunk in chunks:
        chunk["metadata"]["document_id"] = new_doc.id

    try:
        hybrid_store_service.save_chunks(workspace_id=workspace_id, chunks=chunks)
    except Exception as e:
        logger.error(f"Vector Store error: {str(e)}")
        db.delete(new_doc)
        db.commit()
        _cleanup_file(file_path)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error saving data to vector store")

    return UploadResponse(
        status="success",
        message=f"File '{safe_filename}' processed successfully.",
        document_id=new_doc.id,
        chunks_processed=len(chunks)
    )


@router.get("/workspaces/{workspace_id}/documents", response_model=List[DocumentResponse])
def get_workspace_documents(workspace_id: int, db: Session = Depends(get_db)):
    _get_workspace_or_404(db, workspace_id)
    documents = db.query(models.Document).filter(models.Document.workspace_id == workspace_id).all()
    return documents

# ====================================
# API Endpoints — Chat
# ====================================

@router.post("/workspaces/{workspace_id}/chat-sessions", response_model=ChatSessionResponse)
def create_chat_session(workspace_id: int, db: Session = Depends(get_db)):
    _get_workspace_or_404(db, workspace_id)

    try:
        new_session = models.ChatSession(workspace_id=workspace_id, title="New Chat")
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        logger.info(f"New chat session created (ID: {new_session.id}) for workspace {workspace_id}")
        return new_session
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create chat session: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not create chat session")


@router.get("/workspaces/{workspace_id}/chat-sessions", response_model=List[ChatSessionResponse])
def get_workspace_chat_sessions(workspace_id: int, db: Session = Depends(get_db)):
    _get_workspace_or_404(db, workspace_id)

    sessions = (
        db.query(models.ChatSession)
        .filter(models.ChatSession.workspace_id == workspace_id)
        .order_by(models.ChatSession.created_at.desc())
        .all()
    )
    return sessions


@router.get("/chat-sessions/{session_id}/messages", response_model=List[MessageResponse])
def get_chat_session_messages(session_id: int, db: Session = Depends(get_db)):
    _get_session_or_404(db, session_id)

    messages = (
        db.query(models.Message)
        .filter(models.Message.session_id == session_id)
        .order_by(models.Message.timestamp.asc())
        .all()
    )
    return [_serialize_message(m) for m in messages]


@router.post("/chat-sessions/{session_id}/message", response_model=ChatMessageResponse)
def send_chat_message(
    session_id: int,
    request: ChatMessageRequest,
    db: Session = Depends(get_db)
):
    session = _get_session_or_404(db, session_id)
    workspace_id = session.workspace_id

    try:
        answer, citations = chat_engine_service.generate_response(
            workspace_id=workspace_id,
            query=request.query,
            db=db,
            session_id=session_id
        )
        return ChatMessageResponse(answer=answer, citations=citations)
    except LLMGenerationError as e:
        logger.error(f"LLM service unavailable: {str(e)}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error during chat processing: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error during chat processing")


@router.post("/chat-sessions/{session_id}/stream")
def stream_chat_message(
    session_id: int,
    request: ChatMessageRequest,
    db: Session = Depends(get_db)
):
    session = _get_session_or_404(db, session_id)
    workspace_id = session.workspace_id

    generator = chat_engine_service.generate_response_stream(
        workspace_id=workspace_id,
        query=request.query,
        db=db,
        session_id=session_id
    )

    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


# ====================================
# API Endpoints — Deletion
# ====================================

@router.delete("/workspaces/{workspace_id}/documents/{doc_id}")
def delete_document(workspace_id: int, doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(
        models.Document.id == doc_id,
        models.Document.workspace_id == workspace_id
    ).first()

    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    try:
        hybrid_store_service.delete_by_document_id(workspace_id=workspace_id, document_id=doc_id)
    except Exception as e:
        logger.error(f"Failed to remove vectors for document {doc_id}: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to remove document from vector store")

    _cleanup_file(doc.file_path)

    try:
        db.delete(doc)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete document record {doc_id}: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete document record")

    logger.info(f"Document {doc_id} deleted successfully from workspace {workspace_id}")
    return {"status": "success", "message": "Document deleted"}


@router.delete("/chat-sessions/{session_id}")
def delete_chat_session(session_id: int, db: Session = Depends(get_db)):
    session = _get_session_or_404(db, session_id)

    try:
        db.delete(session)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete chat session {session_id}: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete chat session")

    logger.info(f"Chat session {session_id} deleted successfully")
    return {"status": "success", "message": "Chat session deleted"}