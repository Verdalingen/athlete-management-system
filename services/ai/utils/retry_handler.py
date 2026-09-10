import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from typing import Any

import anthropic
from anthropic._exceptions import DeadlineExceededError, OverloadedError, ServiceUnavailableError
from langgraph.errors import GraphInterrupt

logger = logging.getLogger(__name__)


class RetryableError(Exception):
    pass


class APIOverloadError(RetryableError):
    pass


class RetryConfig:

    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        jitter: bool = True,
        retryable_exceptions: set[type[Exception]] | None = None,
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter
        self.retryable_exceptions = retryable_exceptions or {
            anthropic.RateLimitError,  # 429 - rate limits
            anthropic.ConflictError,  # 409 - conflicts
            anthropic.InternalServerError,  # 5xx - server errors
            ServiceUnavailableError,  # 503 - service unavailable
            DeadlineExceededError,  # 504 - gateway timeout
            OverloadedError,  # 529 - overloaded
            anthropic.APIConnectionError,  # Network/connection issues
            anthropic.APITimeoutError,  # Timeouts
            APIOverloadError,  # Custom local exception
        }

    def calculate_delay(self, attempt: int) -> float:
        delay = min(self.base_delay * (self.exponential_base**attempt), self.max_delay)
        if self.jitter:
            jitter_range = delay * 0.1
            delay += random.uniform(-jitter_range, jitter_range)
        return max(delay, 0.1)


async def retry_with_backoff(
    func: Callable[[], Awaitable[Any]],
    config: RetryConfig | None = None,
    context: str = "operation",
) -> Any:

    if config is None:
        config = RetryConfig()

    last_exception = None

    for attempt in range(config.max_retries + 1):
        try:
            logger.debug(
                "Attempting %s (attempt %s/%s)",
                context,
                attempt + 1,
                config.max_retries + 1,
            )
            return await func()

        except GraphInterrupt:
            raise

        except Exception as e:
            last_exception = e

            is_retryable = any(isinstance(e, exc_type) for exc_type in config.retryable_exceptions)

            if is_retryable:
                logger.warning("%s failed with retryable %s: %s", context, type(e).__name__, e)
            else:
                logger.error("%s failed with non-retryable error: %s", context, e)
                break

            if attempt < config.max_retries:
                delay = config.calculate_delay(attempt)
                logger.info(
                    "%s failed (attempt %s), retrying in %.1fs: %s",
                    context,
                    attempt + 1,
                    delay,
                    e,
                )
                await asyncio.sleep(delay)
            else:
                logger.error("%s failed after %s attempts: %s", context, config.max_retries + 1, e)

    if last_exception is None:
        raise RuntimeError(f"{context} failed without capturing an exception")
    raise last_exception


AI_ANALYSIS_CONFIG = RetryConfig(
    max_retries=5,
    base_delay=2.0,
    max_delay=120.0,
    exponential_base=2.5,
)
