import time
from collections import defaultdict
from threading import Lock
from fastapi import Request, status
from app.core.exceptions import AppException


class LoginRateLimiter:
    """In-memory sliding window rate limiter for login attempts by IP and email."""

    def __init__(self, max_attempts: int = 15, window_seconds: int = 300):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check(self, key: str) -> None:
        now = time.time()
        with self._lock:
            valid_timestamps = [
                ts for ts in self._attempts[key] if now - ts < self.window_seconds
            ]
            self._attempts[key] = valid_timestamps
            if len(valid_timestamps) >= self.max_attempts:
                raise AppException(
                    message="Too many failed login attempts. Please wait 5 minutes before retrying.",
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    error_code="RATE_LIMIT_EXCEEDED",
                )

    def record_failure(self, key: str) -> None:
        now = time.time()
        with self._lock:
            self._attempts[key].append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)


login_rate_limiter = LoginRateLimiter(max_attempts=15, window_seconds=300)


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
