import importlib.util
import json
from pathlib import Path

HANDLER_PATH = Path(__file__).resolve().parent.parent / "handler.py"
spec = importlib.util.spec_from_file_location("file_processor_handler", HANDLER_PATH)
handler_module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(handler_module)
lambda_handler = handler_module.lambda_handler


def test_lambda_handler_processes_s3_object_created_event():
    event = {
        "Records": [
            {
                "eventName": "ObjectCreated:Put",
                "s3": {
                    "bucket": {"name": "ticketdesk-enterprise-attachments"},
                    "object": {
                        "key": "tickets/TKT-2026-0005/network_trace.txt",
                        "size": 14320,
                        "eTag": "abc123etag",
                    },
                },
            }
        ]
    }
    response = lambda_handler(event, context=None)
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["status"] == "SUCCESS"
    assert body["processed_count"] == 1
    item = body["items"][0]
    assert item["bucket"] == "ticketdesk-enterprise-attachments"
    assert item["object_key"] == "tickets/TKT-2026-0005/network_trace.txt"
    assert item["file_size_bytes"] == 14320
    assert item["status"] == "PROCESSED"


def test_lambda_handler_skips_invalid_record():
    event = {"Records": [{"eventName": "ObjectCreated:Put", "s3": {}}]}
    response = lambda_handler(event, context=None)
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["items"][0]["status"] == "SKIPPED_INVALID_RECORD"
