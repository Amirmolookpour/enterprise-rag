import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware 
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings, ensure_directories
from app.core.logger import logger
from app.database.connection import engine, SessionLocal, get_db
from app.database import models
from app.api.routes import router as api_router


os.environ["HF_HUB_OFFLINE"] = "1"
STATIC_DIR = "app/static"


def create_default_workspace():
    db = SessionLocal()
    try:
        existing_ws = db.query(models.Workspace).filter(models.Workspace.id == 1).first()
        if not existing_ws:
            logger.info("No default workspace found. Creating automated demo workspace (ID: 1)...")
            default_ws = models.Workspace(id=1, name="default_demo")
            db.add(default_ws)
            db.commit()
            logger.info("Default workspace successfully initialized!")
    except Exception as e:
        logger.error(f"Failed to create default workspace during startup: {str(e)}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up: ensuring directories exist...")
    ensure_directories()
    os.makedirs(STATIC_DIR, exist_ok=True)

    logger.info("Initializing database tables...")
    try:
        models.Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized successfully.")
    except Exception as e:
        logger.error(f"Error creating database tables: {e}")

    create_default_workspace()

    yield

    logger.info("Shutting down.")


app = FastAPI(
    title="Enterprise Document Intelligence System",
    description="Advanced RAG Pipeline with Semantic Chunking & Hybrid Search",
    version="1.0.0",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   
        "http://127.0.0.1:5173",   
        "http://localhost:8000",   
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"], 
)

app.include_router(api_router)

class WorkspaceCreate(BaseModel):
    workspace_name: str


@app.post("/workspace/init")
def initialize_workspace(payload: WorkspaceCreate, db: Session = Depends(get_db)):
    try:
        existing_ws = db.query(models.Workspace).filter(models.Workspace.name == payload.workspace_name).first()

        if not existing_ws:
            logger.info(f"Creating a new isolated workspace: {payload.workspace_name}")
            new_ws = models.Workspace(name=payload.workspace_name)
            db.add(new_ws)
            db.commit()
            db.refresh(new_ws)
            return {"status": "created", "workspace_id": new_ws.id, "name": new_ws.name}

        return {"status": "exists", "workspace_id": existing_ws.id, "name": existing_ws.name}

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to initialize workspace: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error during workspace initialization")

os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/health")
def health_check():
    return {"status": "healthy", "workspace_mode": "hybrid-single-tenant"}


if __name__ == "__main__":
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)