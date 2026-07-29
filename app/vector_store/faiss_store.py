import os
import pickle
from typing import List, Dict, Any

from langchain_community.vectorstores import FAISS
from langchain_community.retrievers import BM25Retriever
from langchain_classic.retrievers import EnsembleRetriever, ContextualCompressionRetriever  
from langchain_cohere import CohereRerank

from app.core.config import settings
from app.core.logger import logger
from app.services.ingestion import ingestion_service


class FaissVectorStoreService:
    def __init__(self):
        logger.info("Initializing Enterprise Hybrid Search (FAISS + BM25 + Cohere Reranker)...")

        self.embeddings = ingestion_service.embeddings
        self.base_dir = settings.FAISS_DIR
        self.cohere_api_key = settings.COHERE_API_KEY

    def _get_index_path(self, workspace_id: int) -> str:
        return os.path.join(self.base_dir, f"workspace_{workspace_id}")

    def save_chunks(self, workspace_id: int, chunks: List[Dict[str, Any]]):
        if not chunks:
            logger.warning(f"No chunks to save for workspace {workspace_id}")
            return

        workspace_dir = self._get_index_path(workspace_id)
        os.makedirs(workspace_dir, exist_ok=True)

        texts = [chunk["text"] for chunk in chunks]
        metadatas = [chunk["metadata"] for chunk in chunks]

        logger.info(f"Adding {len(texts)} chunks to Hybrid Store for workspace {workspace_id}...")

        faiss_path = os.path.join(workspace_dir, "faiss_index")
        if os.path.exists(faiss_path):
            faiss_db = FAISS.load_local(faiss_path, self.embeddings, allow_dangerous_deserialization=True)
            faiss_db.add_texts(texts=texts, metadatas=metadatas)
        else:
            faiss_db = FAISS.from_texts(texts=texts, embedding=self.embeddings, metadatas=metadatas)

        faiss_db.save_local(faiss_path)

        docs_path = os.path.join(workspace_dir, "all_docs.pkl")
        all_texts, all_metadatas = [], []

        if os.path.exists(docs_path):
            with open(docs_path, "rb") as f:
                data = pickle.load(f)
                all_texts = data["texts"]
                all_metadatas = data["metadatas"]

        all_texts.extend(texts)
        all_metadatas.extend(metadatas)

        with open(docs_path, "wb") as f:
            pickle.dump({"texts": all_texts, "metadatas": all_metadatas}, f)

        bm25_retriever = BM25Retriever.from_texts(all_texts, metadatas=all_metadatas)

        with open(os.path.join(workspace_dir, "bm25_retriever.pkl"), "wb") as f:
            pickle.dump(bm25_retriever, f)

        logger.info("Hybrid indexes (FAISS & BM25) saved successfully.")

    def search_hybrid(self, workspace_id: int, query: str, k: int = 5) -> List[Dict[str, Any]]:
        workspace_dir = self._get_index_path(workspace_id)
        faiss_path = os.path.join(workspace_dir, "faiss_index")
        bm25_path = os.path.join(workspace_dir, "bm25_retriever.pkl")

        if not os.path.exists(faiss_path) or not os.path.exists(bm25_path):
            logger.warning(f"No indexes found for workspace {workspace_id}!")
            return []

        try:
            faiss_db = FAISS.load_local(faiss_path, self.embeddings, allow_dangerous_deserialization=True)
            faiss_retriever = faiss_db.as_retriever(search_kwargs={"k": k})

            with open(bm25_path, "rb") as f:
                bm25_retriever = pickle.load(f)
            bm25_retriever.k = k

            ensemble_retriever = EnsembleRetriever(
                retrievers=[bm25_retriever, faiss_retriever],
                weights=[0.3, 0.7]
            )
        except Exception as e:
            logger.error(f"Hybrid retrieval (FAISS/BM25) failed for workspace {workspace_id}: {str(e)}")
            return []

        try:
            compressor = CohereRerank(model="rerank-v3.5", cohere_api_key=self.cohere_api_key, top_n=3)
            compression_retriever = ContextualCompressionRetriever(
                base_compressor=compressor,
                base_retriever=ensemble_retriever
            )
            docs = compression_retriever.invoke(query)
            return [{"text": doc.page_content, "metadata": doc.metadata} for doc in docs]

        except Exception as e:
            logger.warning(f"Cohere rerank unavailable, falling back to un-reranked hybrid results: {str(e)}")
            try:
                docs = ensemble_retriever.invoke(query)
                return [{"text": doc.page_content, "metadata": doc.metadata} for doc in docs[:3]]
            except Exception as e2:
                logger.error(f"Fallback hybrid retrieval also failed for workspace {workspace_id}: {str(e2)}")
                return []


hybrid_store_service = FaissVectorStoreService()