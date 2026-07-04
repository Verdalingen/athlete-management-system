import logging

from .client import MFPClient

logger = logging.getLogger(__name__)


class MFPDataExtractor:
    """Fetches and structures MFP diary data for the nutrition pipeline."""

    def __init__(self, client: MFPClient) -> None:
        self.client = client

    def extract(self, days: int = 14) -> dict:
        diary_entries = self.client.get_diary_range(days=days)
        weight_history = self.client.get_measurements("Weight", days=30)

        successful = [e for e in diary_entries if "error" not in e]
        failed_dates = [e["date"] for e in diary_entries if "error" in e]

        return {
            "source": "myfitnesspal",
            "username": self.client.username,
            "diary": successful,
            "weight_history": weight_history,
            "coverage": {
                "days_requested": days,
                "days_retrieved": len(successful),
                "failed_dates": failed_dates,
            },
        }

    @classmethod
    def from_credentials(cls, username: str, password: str) -> "MFPDataExtractor":
        return cls(MFPClient(username=username, password=password))
