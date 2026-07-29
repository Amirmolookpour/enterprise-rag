import sys
import logging
from logging.handlers import RotatingFileHandler
import os

from app.core.config import settings

os.makedirs(settings.LOG_DIR, exist_ok=True)

LOG_FILE_PATH = os.path.join(settings.LOG_DIR, "app.log")
LOG_FORMAT = "%(asctime)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s"
LOG_FILE_MAX_BYTES = 10 * 1024 * 1024
LOG_FILE_BACKUP_COUNT = 5


def setup_logger() -> logging.Logger:
    logger = logging.getLogger("enterprise_rag")
    logger.setLevel(settings.LOG_LEVEL)

    logger.propagate = False

    if logger.hasHandlers():
        logger.handlers.clear()

    formatter = logging.Formatter(LOG_FORMAT)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    try:
        file_handler = RotatingFileHandler(
            LOG_FILE_PATH,
            maxBytes=LOG_FILE_MAX_BYTES,
            backupCount=LOG_FILE_BACKUP_COUNT,
            encoding="utf-8"
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except OSError as e:
        logger.warning(f"Could not set up file logging at {LOG_FILE_PATH} ({e}); continuing with console logging only.")

    return logger


logger = setup_logger()