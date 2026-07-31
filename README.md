# 🏢 Enterprise Document Intelligence (RAG)

A production-ready, enterprise-grade **Retrieval-Augmented Generation (RAG)** platform. Upload complex PDFs and get accurate, real-time streaming answers powered by **Hybrid Search** and **Semantic Reranking**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688.svg)
![React](https://img.shields.io/badge/frontend-React-61DAFB.svg)

---

## 📋 Table of Contents

- [Live Demo](#-live-demo)
- [Architecture](#-architecture)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Installation](#-installation-local-development)
- [API Endpoints](#-api-endpoints)
- [Environment Variables](#️-environment-variables)
- [How It Works](#-how-it-works)
- [Author](#-author)
- [License](#-license)

---

## 🚀 Live Demo

| Service | Link |
|---|---|
| Frontend | [enterprise-rag-five.vercel.app](https://enterprise-rag-five.vercel.app/) |
| Backend API (Swagger) | [enterprise-rag1.fly.dev/docs](https://enterprise-rag1.fly.dev/docs) |

---

## 🏗 Architecture

```
Document Upload → Chunking → FAISS (Dense) + BM25 (Sparse)
                                     │
User Query → React UI → FastAPI → Hybrid Search → Cohere Reranker → Groq LLM → Streaming Response
                                                                                     │
                                                                          Real-time Citations
```

---

## ✨ Features

- 🧠 **Hybrid Search Engine** — Combines FAISS (semantic) and BM25 (keyword) search for maximum recall.
- 🎯 **Precision Reranking** — Uses Cohere Rerank to re-order retrieved context by true relevance.
- ⚡ **Streaming Responses** — Real-time, token-by-token generation via Groq (Llama 3.3).
- 📑 **Exact Citations** — Every answer includes document IDs, filenames, and precise page numbers.
- 📁 **Workspace Management** — Isolated environments for different document sets and chat sessions.
- ☁️ **Cloud-Native** — Fully containerized and deployed on Fly.io (backend) and Vercel (frontend).
- 🛡 **Secure & Validated** — Built with Pydantic settings and strict type hinting throughout.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| API Framework | FastAPI (Python) |
| Frontend UI | React.js, Vite, TailwindCSS |
| LLM | Groq (llama-3.3-70b-versatile) |
| Reranker | Cohere API (rerank-v3.5) |
| Embeddings | HuggingFace (all-MiniLM-L6-v2) |
| Vector Store | FAISS + BM25 |
| Database | SQLite (metadata & workspaces) |
| Deployment | Fly.io (backend), Vercel (frontend) |

---

## 📁 Project Structure

```
enterprise-rag/
├── backend/
│   ├── main.py                   # FastAPI entry point
│   ├── app/
│   │   ├── api/                  # API endpoints and routers
│   │   ├── core/                 # Config & environment settings
│   │   ├── chat_engine.py        # RAG pipeline & generator
│   │   ├── faiss_store.py        # Hybrid search (FAISS + BM25) logic
│   │   └── database.py           # SQLite connection & CRUD
│   ├── storage/                  # Local storage for DB & indexes
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/           # React UI components (Chat, Upload)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── .env                      # VITE_API_BASE_URL
│   └── vite.config.js
└── README.md
```

---

## 🔧 Installation (Local Development)

### 1. Clone the repository

```bash
git clone https://github.com/omidshadpour/enterprise-rag.git
cd enterprise-rag
```

### 2. Set up the backend

```bash
cd backend
pip install -r requirements.txt
```

### 3. Configure environment variables

Create a `.env` file inside `backend/`:

```env
GROQ_API_KEY=your_groq_api_key
COHERE_API_KEY=your_cohere_api_key
```

### 4. Run the backend server

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 5. Run the frontend

```bash
cd ../frontend
npm install
npm run dev
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/workspaces/{id}/upload` | Upload & index a PDF document |
| GET | `/api/v1/workspaces/{id}/documents` | List all uploaded documents |
| POST | `/api/v1/workspaces/{id}/chat` | Ask a question (streaming response) |
| GET | `/health` | Check API health status |
| GET | `/docs` | Swagger UI documentation |

---

## ⚙️ Environment Variables

### Backend (`.env`)

```env
GROQ_API_KEY=gsk_...
COHERE_API_KEY=cohere_...
PORT=8000
HOST=0.0.0.0
```

### Frontend (`.env`)

```env
VITE_API_BASE_URL=https://enterprise-rag1.fly.dev
```

---

## 📊 How It Works

1. **Ingestion** — A PDF is uploaded, parsed, semantically chunked, and indexed in both FAISS (dense) and BM25 (sparse). Metadata is stored in SQLite.
2. **Hybrid Search** — On each query, vector and keyword searches run in parallel to retrieve the top candidate chunks.
3. **Reranking** — Retrieved chunks are sent to Cohere for re-ordering based on strict semantic relevance to the query.
4. **Generation** — The top-ranked chunks are passed to Groq (Llama 3.3) as context for answer generation.
5. **Streaming** — The answer streams back to the React UI token-by-token, along with exact page citations.

---

## 🙋 Author

**Amir Molookpour**
GitHub: [@Amirmolookpour](https://github.com/Amirmolookpour)

---

## 📄 License

This project is licensed under the **MIT License**.
