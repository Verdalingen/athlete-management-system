import logging
from datetime import date, timedelta

logger = logging.getLogger(__name__)


class MFPClient:
    """Thin wrapper around python-myfitnesspal for fetching diary data."""

    def __init__(self, username: str, password: str) -> None:
        try:
            import myfitnesspal
        except ImportError as exc:
            raise ImportError("python-myfitnesspal is required: pip install python-myfitnesspal") from exc

        self._mfp = myfitnesspal.Client(username=username, password=password)
        self.username = username

    def get_diary(self, target_date: date) -> dict:
        """Return a single day's diary as a plain dict."""
        try:
            day = self._mfp.get_date(target_date.year, target_date.month, target_date.day)
            return {
                "date": target_date.isoformat(),
                "totals": dict(day.totals),
                "goals": dict(day.goals) if day.goals else {},
                "meals": [
                    {
                        "name": meal.name,
                        "totals": dict(meal.totals),
                        "entries": [
                            {
                                "name": entry.name,
                                "nutritional_contents": dict(entry.nutritional_contents),
                                "quantity": entry.quantity,
                                "unit": entry.unit,
                            }
                            for entry in meal.entries
                        ],
                    }
                    for meal in day.meals
                ],
                "water": day.water,
                "notes": day.notes,
            }
        except Exception as exc:
            logger.warning("MFP diary fetch failed for %s: %s", target_date, exc)
            return {"date": target_date.isoformat(), "error": str(exc)}

    def get_diary_range(self, days: int = 14) -> list[dict]:
        """Return diary entries for the last `days` days, most recent first."""
        today = date.today()
        results = []
        for i in range(days):
            target = today - timedelta(days=i)
            entry = self.get_diary(target)
            results.append(entry)
        return results

    def get_measurements(self, measurement_name: str = "Weight", days: int = 30) -> list[dict]:
        """Return measurement history (e.g. bodyweight) from MFP."""
        try:
            measurements = self._mfp.get_measurements(measurement_name)
            return [
                {"date": str(d), "value": v}
                for d, v in list(measurements.items())[:days]
            ]
        except Exception as exc:
            logger.warning("MFP measurements fetch failed: %s", exc)
            return []
