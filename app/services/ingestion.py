import os
import csv
import base64
from typing import List, Dict, Any

import fitz
import docx2txt
from groq import Groq
from langchain_experimental.text_splitter import SemanticChunker
from langchain_huggingface import HuggingFaceEmbeddings

from app.core.logger import logger
from app.core.config import settings

VISION_MODEL = "qwen/qwen3.6-27b"


class DocumentIngestionService:
    def __init__(self):
        logger.info("Initializing Multi-Modal Ingestion Service...")

        self.embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        self.text_splitter = SemanticChunker(
            self.embeddings,
            breakpoint_threshold_type="percentile"
        )
        self.groq_client = Groq(api_key=settings.GROQ_API_KEY.get_secret_value())
        
    def read_txt(self, file_path: str) -> str:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    def read_md(self, file_path: str) -> str:
        return self.read_txt(file_path)

    def read_docx(self, file_path: str) -> str:
        return docx2txt.process(file_path)

    def read_csv(self, file_path: str) -> str:
        lines = []
        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            headers = next(reader, None)
            for row in reader:
                if headers:
                    row_text = ", ".join(
                        f"{headers[i]}: {row[i]}" for i in range(min(len(headers), len(row)))
                    )
                else:
                    row_text = ", ".join(row)
                lines.append(row_text)

        return "\n".join(lines)

    def _encode_image(self, image_bytes: bytes) -> str:
        return base64.b64encode(image_bytes).decode("utf-8")

    def analyze_image_with_vision(self, image_bytes: bytes, image_ext: str = "jpeg") -> str:
        try:
            base64_image = self._encode_image(image_bytes)
            response = self.groq_client.chat.completions.create(
                model=VISION_MODEL,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe this image, chart, or table in detail. Extract any important text or numbers exactly."},
                        {"type": "image_url", "image_url": {"url": f"data:image/{image_ext};base64,{base64_image}"}}
                    ]
                }],
                temperature=0.1
            )
            return response.choices[0].message.content

        except Exception as e:
            logger.error(f"Vision API error: {str(e)}")
            return ""

    def read_pdf_multimodal(self, file_path: str , extract_images: bool = False) -> List[Dict[str, Any]]:

        pages_data = []
        doc = fitz.open(file_path)

        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            combined_text = page.get_text("text")

            if extract_images:
                image_list = page.get_images(full=True)
                for img_index, img_info in enumerate(image_list):
                    xref = img_info[0]
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    image_ext = base_image.get("ext", "jpeg")

                    logger.info(f"Analyzing image {img_index + 1} on page {page_num + 1} with Vision AI...")

                    vision_desc = self.analyze_image_with_vision(image_bytes, image_ext)

                    if vision_desc:
                        combined_text += f"\n\n[image: {vision_desc}]\n\n"
            else:
                logger.debug(f"Page {page_num + 1}: Skipping image analysis as extract_images is False.")

            if combined_text.strip():
                pages_data.append({
                    "text": combined_text,
                    "metadata": {"page": page_num + 1}
                })
        doc.close()
        return pages_data

    def process_document(self, file_path: str , extract_images: bool = False) -> List[Dict[str, Any]]:
        logger.info(f"Processing file: {file_path}")

        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")
            raise FileNotFoundError(f"File not found at {file_path}")

        filename = os.path.basename(file_path)
        _, ext = os.path.splitext(file_path.lower())
        all_semantic_chunks = []

        try:
            if ext == ".pdf":
                raw_pages = self.read_pdf_multimodal(file_path , extract_images=extract_images)
                for page_data in raw_pages:
                    chunks = self.text_splitter.split_text(page_data["text"])
                    for chunk in chunks:
                        if chunk.strip():
                            all_semantic_chunks.append({
                                "text": chunk,
                                "metadata": {**page_data["metadata"], "filename": filename}
                            })

            else:
                if ext == ".docx":
                    raw_text = self.read_docx(file_path)
                elif ext == ".csv":
                    raw_text = self.read_csv(file_path)
                elif ext == ".txt":
                    raw_text = self.read_txt(file_path)
                elif ext == ".md":
                    raw_text = self.read_md(file_path)
                else:
                    logger.warning(f"Unsupported file extension: {ext}. Trying to read as plain text.")
                    raw_text = self.read_txt(file_path)

                if raw_text.strip():
                    chunks = self.text_splitter.split_text(raw_text)
                    for chunk in chunks:
                        if chunk.strip():
                            all_semantic_chunks.append({
                                "text": chunk,
                                "metadata": {"page": 1, "filename": filename}
                            })

            logger.info(f"Successfully processed {ext} file. Total semantic chunks: {len(all_semantic_chunks)}")
            return all_semantic_chunks

        except Exception as e:
            logger.error(f"Error processing document {file_path}: {str(e)}")
            raise e


ingestion_service = DocumentIngestionService()