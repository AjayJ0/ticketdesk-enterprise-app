import json
import logging
import sys
from datetime import datetime, timezone
from app.core.config import settings


class StructuredFormatter(logging.Formatter):
    """JSON-compatible structured log formatter suitable for AWS CloudWatch and local logs."""

    def format(self, record: logging.LogRecord) -> str:
        log_record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "environment": settings.APP_ENV,
        }
        if hasattr(record, "extra_data"):
            log_record["metadata"] = record.extra_data
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_record)


def setup_logging() -> logging.Logger:
    root_logger = logging.getLogger("ticketdesk")
    root_logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

    if not root_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        if settings.APP_ENV == "production":
            handler.setFormatter(StructuredFormatter())
        else:
            formatter = logging.Formatter(
                "[%(asctime)s] %(levelname)-8s %(name)s - %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
            handler.setFormatter(formatter)
        root_logger.addHandler(handler)

    return root_logger


logger = setup_logging()
