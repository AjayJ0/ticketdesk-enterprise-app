import json
import logging
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Dict, List

logger = logging.getLogger("ticketdesk.lambda.file_processor")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)


def lambda_handler(event: Dict[str, Any], context: Any = None) -> Dict[str, Any]:
    """
    AWS Lambda handler for Amazon S3 ObjectCreated events.
    Logs structured JSON records to Amazon CloudWatch Logs containing the bucket,
    object key, file size, event timestamp, and processing status.
    """
    records: List[Dict[str, Any]] = event.get("Records", [])
    processed_items: List[Dict[str, Any]] = []

    for record in records:
        event_name = record.get("eventName", "UnknownEvent")
        s3_data = record.get("s3", {})
        bucket_name = s3_data.get("bucket", {}).get("name")
        raw_key = s3_data.get("object", {}).get("key", "")
        object_key = urllib.parse.unquote_plus(raw_key)
        file_size = s3_data.get("object", {}).get("size")
        etag = s3_data.get("object", {}).get("eTag")

        status = "PROCESSED" if bucket_name and object_key else "SKIPPED_INVALID_RECORD"

        item_summary = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": "ticketdesk-s3-file-processor",
            "event_name": event_name,
            "bucket": bucket_name,
            "object_key": object_key,
            "file_size_bytes": file_size,
            "etag": etag,
            "status": status,
        }
        logger.info(json.dumps(item_summary))
        processed_items.append(item_summary)

    response_payload = {
        "statusCode": 200,
        "body": json.dumps(
            {
                "status": "SUCCESS",
                "processed_count": len(processed_items),
                "items": processed_items,
            }
        ),
    }
    return response_payload


if __name__ == "__main__":
    # Local execution test harness
    sample_s3_event = {
        "Records": [
            {
                "eventVersion": "2.1",
                "eventSource": "aws:s3",
                "awsRegion": "us-east-1",
                "eventTime": "2026-11-18T08:30:00.000Z",
                "eventName": "ObjectCreated:Put",
                "s3": {
                    "bucket": {"name": "ticketdesk-enterprise-attachments"},
                    "object": {
                        "key": "tickets/TKT-2026-0001/vpn_error_screenshot.png",
                        "size": 248912,
                        "eTag": "d41d8cd98f00b204e9800998ecf8427e",
                    },
                },
            }
        ]
    }
    result = lambda_handler(sample_s3_event)
    print("Local Lambda simulation result:", result)
