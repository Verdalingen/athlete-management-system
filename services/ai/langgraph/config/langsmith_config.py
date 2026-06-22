import logging
import os

logger = logging.getLogger(__name__)


class LangSmithConfig:

    @staticmethod
    def setup_langsmith(
        project_name: str = "garmin_ai_coach_analysis", api_key: str | None = None
    ) -> bool:
        try:
            if api_key:
                os.environ["LANGSMITH_API_KEY"] = api_key

            if not os.getenv("LANGSMITH_API_KEY"):
                logger.warning("LANGSMITH_API_KEY not set - observability disabled")
                return False

            os.environ["LANGSMITH_PROJECT"] = project_name
            os.environ["LANGSMITH_TRACING"] = "true"

            # Verify the key actually works before enabling tracing.
            # A 403 means the key is invalid or the plan doesn't include the API —
            # in that case disable LangSmith entirely so we don't flood the terminal.
            if not LangSmithConfig._verify_key():
                logger.warning(
                    "LangSmith API key returned 403 — key invalid or plan lacks API access. "
                    "Disabling observability."
                )
                LangSmithConfig.disable_langsmith()
                return False

            logger.info("LangSmith observability enabled for project: %s", project_name)
            return True

        except Exception as e:
            logger.error("Failed to setup LangSmith: %s", e)
            return False

    @staticmethod
    def _verify_key() -> bool:
        """Make a lightweight API call to confirm the key is valid. Returns False on 403."""
        try:
            from langsmith import Client
            Client().list_projects(limit=1)
            return True
        except Exception as exc:
            if "403" in str(exc) or "Forbidden" in str(exc).lower():
                # Silence langsmith's own internal WARNING logs — they'd otherwise
                # appear on every background flush attempt during the run.
                logging.getLogger("langsmith").setLevel(logging.ERROR)
                return False
            # Non-403 errors (network timeout, etc.) — don't disable, just warn
            logger.warning("LangSmith connectivity check failed: %s", exc)
            return False

    @staticmethod
    def get_project_name(user_id: str, analysis_type: str = "training_analysis") -> str:
        return f"garmin_ai_coach_{analysis_type}_{user_id!s}"

    @staticmethod
    def disable_langsmith():
        os.environ["LANGSMITH_TRACING"] = "false"
        logger.info("LangSmith observability disabled")


def configure_langsmith_for_user(user_id: str, analysis_type: str = "training_analysis") -> bool:
    project_name = LangSmithConfig.get_project_name(user_id, analysis_type)
    return LangSmithConfig.setup_langsmith(project_name)
