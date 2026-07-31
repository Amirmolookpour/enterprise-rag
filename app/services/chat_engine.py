import json
from typing import List, Dict, Any, Tuple, Generator

from groq import Groq
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logger import logger
from app.database import models
from app.vector_store.faiss_store import hybrid_store_service

class LLMGenerationError(Exception):
    pass

SYSTEM_PROMPT = (
    "You are a highly professional AI assistant for an Enterprise Document Intelligence System.\n"
    "Your task is to answer the user's question ONLY based on the provided Context Documents.\n"
    "If the exact answer is not contained in the context, you MUST say 'I cannot find the answer in the provided documents.' Do not guess.\n"
    "CRITICAL: Keep the response text completely clean, natural, and professional. DO NOT include file names, document IDs, or page numbers inside your response text or sentences."
)

STREAM_INTERRUPTED_SUFFIX = " [response interrupted due to a server error]"


class ChatEngineService:
    def __init__(self):
        logger.info("Initializing Enterprise RAG Chat Engine...")

        self.llm_model = "llama-3.3-70b-versatile"
        self.groq_client = Groq(api_key=settings.GROQ_API_KEY.get_secret_value())

    def _build_context(self, chunks: List[Dict[str, Any]]) -> str:
        context_parts = []
        for i, chunk in enumerate(chunks):
            text = chunk.get("text", "").strip()
            metadata = chunk.get("metadata", {})
            filename = metadata.get("filename", "Unknown")
            page = metadata.get("page", "?")

            context_parts.append(f"--- Document [{i+1}] (File: {filename}, page: {page}) ---\n{text}\n")

        return "\n".join(context_parts)

    def _extract_citations(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        citations = []
        seen_docs = set()
        for chunk in chunks:
            meta = chunk.get("metadata", {})
            doc_id = meta.get("document_id")
            if doc_id is not None and doc_id not in seen_docs:
                citations.append({
                    "document_id": doc_id,
                    "filename": meta.get("filename", "Unknown"),
                    "page": meta.get("page", "?")
                })
                seen_docs.add(doc_id)
        return citations

    def _sse(self, event_type: str, payload: Dict[str, Any]) -> str:
        data = {"type": event_type, **payload}
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    def generate_response(self, workspace_id: int, query: str, db: Session, session_id: int) -> Tuple[str, List[Dict[str, Any]]]:
        logger.info(f"Generating answer for workspace {workspace_id}. Query: {query}")

        try:
            relevant_chunks = hybrid_store_service.search_hybrid(workspace_id=workspace_id, query=query, k=5)
        except Exception as e:
            logger.error(f"Error retrieving documents for chat: {str(e)}")
            relevant_chunks = []

        if not relevant_chunks:
            logger.info("No relevant documents found for the query.")
            fallback_msg = "I did not find an answer to this question in the uploaded documents. Please change your question or upload more relevant documents."
            self._save_chat_history(db, session_id, query, fallback_msg, [])
            return fallback_msg, []

        context_text = self._build_context(relevant_chunks)
        citations = self._extract_citations(relevant_chunks)

        try:
            response = self.groq_client.chat.completions.create(
                model=self.llm_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Context Documents:\n{context_text}\n\nUser Question: {query}"}
                ],
                temperature=0.1,
                max_tokens=1024
            )
            ai_answer = response.choices[0].message.content
        except Exception as e:
            logger.error(f"Groq LLM generation error: {str(e)}")
            error_msg = "Unfortunately, it is not possible to generate a response at this time."
            self._save_chat_history(db, session_id, query, error_msg, [])
            raise LLMGenerationError("Failed to generate AI response. Groq API might be unavailable.") from e

        self._save_chat_history(db, session_id, query, ai_answer, citations)

        return ai_answer, citations

    def generate_response_stream(self, workspace_id: int, query: str, db: Session, session_id: int) -> Generator[str, None, None]:
        logger.info(f"[stream] Generating answer for workspace {workspace_id}. Query: {query}")

        try:
            relevant_chunks = hybrid_store_service.search_hybrid(workspace_id=workspace_id, query=query, k=5)
        except Exception as e:
            logger.error(f"Error retrieving documents for chat: {str(e)}")
            relevant_chunks = []

        if not relevant_chunks:
            fallback_msg = "I did not find an answer to this question in the uploaded documents. Please change your question or upload more relevant documents."
            yield self._sse("citations", {"citations": []})
            yield self._sse("token", {"content": fallback_msg})
            self._save_chat_history(db, session_id, query, fallback_msg, [])
            yield self._sse("done", {})
            return

        context_text = self._build_context(relevant_chunks)
        citations = self._extract_citations(relevant_chunks)
        yield self._sse("citations", {"citations": citations})

        full_answer = ""
        try:
            stream = self.groq_client.chat.completions.create(
                model=self.llm_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Context Documents:\n{context_text}\n\nUser Question: {query}"}
                ],
                temperature=0.1,
                max_tokens=1024,
                stream=True
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    full_answer += delta
                    yield self._sse("token", {"content": delta})

        except GeneratorExit:
            logger.info(f"Stream aborted by client for session {session_id}")
            if full_answer.strip():
                self._save_chat_history(db, session_id, query, full_answer + " [stopped by user]", citations)
            raise

        except Exception as e:
            logger.error(f"Groq streaming error: {str(e)}")
            if full_answer.strip():
                saved_content = full_answer + STREAM_INTERRUPTED_SUFFIX
                yield self._sse("token", {"content": STREAM_INTERRUPTED_SUFFIX})
            else:
                saved_content = "Unfortunately, it is not possible to generate a response at this time."
                yield self._sse("error", {"message": saved_content})
            self._save_chat_history(db, session_id, query, saved_content, citations)
            yield self._sse("done", {})
            return

        self._save_chat_history(db, session_id, query, full_answer, citations)
        yield self._sse("done", {})

    def _save_chat_history(self, db: Session, session_id: int, user_query: str, ai_answer: str, citations: List[Dict[str, Any]]) -> None:
        try:
            user_msg = models.Message(
                session_id=session_id,
                role=models.MessageRole.user,
                content=user_query
            )
            ai_msg = models.Message(
                session_id=session_id,
                role=models.MessageRole.assistant,
                content=ai_answer,
                citations=json.dumps(citations, ensure_ascii=False)
            )

            db.add_all([user_msg, ai_msg])
            db.commit()
            logger.info(f"Chat history saved successfully for session {session_id}")

        except Exception as e:
            db.rollback()
            logger.error(f"Failed to save chat history: {str(e)}")

chat_engine_service = ChatEngineService()