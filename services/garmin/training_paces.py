"""Current-fitness-calibrated training paces, from the Daniels/Gilbert VDOT formulas (Oxygen
Power, 1979) — the same equations behind the widely-used VDOT running calculators. Computed fresh
from Garmin's own predicted 5K time on every Season Plan / Check-In run, so paces track actual
current fitness and converge toward a stated goal pace over time, rather than the coach silently
substituting the goal pace as today's prescription (the bug this module fixes).
"""
import math

# Daniels' published %VDOT bands per training zone.
_ZONE_BANDS = {
    "easy": (0.65, 0.78),
    "tempo": (0.88, 0.92),
    "vo2max": (0.95, 1.00),
}


def vdot_from_race(distance_m: float, time_secs: float) -> float:
    """VDOT — a fitness index (not literal VO2max) derived from a single race performance."""
    t = time_secs / 60.0  # minutes
    v = distance_m / t  # meters per minute
    vo2 = -4.60 + 0.182258 * v + 0.000104 * v**2
    pct_max = 0.8 + 0.1894393 * math.exp(-0.012778 * t) + 0.2989558 * math.exp(-0.1932605 * t)
    return vo2 / pct_max


def _velocity_for_pct_vdot(vdot: float, pct: float) -> float:
    """Sustainable velocity (meters/minute) at the given fraction of VDOT — inverts the VO2
    equation above via the quadratic formula.
    """
    target_vo2 = vdot * pct
    a, b, c = 0.000104, 0.182258, -4.60 - target_vo2
    return (-b + math.sqrt(b**2 - 4 * a * c)) / (2 * a)


def _format_pace(min_per_km: float) -> str:
    mins = int(min_per_km)
    secs = round((min_per_km - mins) * 60)
    if secs == 60:
        mins, secs = mins + 1, 0
    return f"{mins}:{secs:02d}"


def _pace_range(vdot: float, pct_low: float, pct_high: float) -> str:
    # Higher %VDOT -> faster (lower) pace, so pct_high gives the fast end of the range.
    slow = 1000.0 / _velocity_for_pct_vdot(vdot, pct_low)
    fast = 1000.0 / _velocity_for_pct_vdot(vdot, pct_high)
    return f"{_format_pace(fast)}-{_format_pace(slow)}/km"


def extract_predicted_5k_secs(garmin_data: dict) -> int | None:
    """Extract the 5k time prediction (seconds) from Garmin's race_predictions payload. Garmin's
    real payload is flat with a "time5K" key (int seconds) — confirmed against real logged
    responses; the other candidates are defensive fallbacks in case Garmin's API shape changes.
    """
    preds = garmin_data.get("race_predictions")
    if not preds or not isinstance(preds, dict):
        return None
    candidates = [
        preds.get("time5K"),
        preds.get("fiveK"),
        preds.get("5k"),
        preds.get("raceTime5K"),
        (preds.get("racePredictions") or {}).get("raceTime5K"),
        (preds.get("racePredictions") or {}).get("fiveK"),
    ]
    for c in candidates:
        if c is None:
            continue
        secs = c if isinstance(c, (int, float)) else c.get("time") or c.get("raceDuration")
        if secs:
            return int(secs)
    return None


def compute_training_paces(predicted_5k_secs: int | None) -> dict[str, str] | None:
    """Returns {"easy": "5:30-6:21/km", "tempo": "...", "vo2max": "..."}, or None if there's no
    current-fitness data yet (e.g. a brand-new athlete with no completed activities to predict
    from) — callers should fall back to not prescribing a specific pace in that case, not to a
    goal-derived one.
    """
    if not predicted_5k_secs or predicted_5k_secs <= 0:
        return None
    vdot = vdot_from_race(5000, predicted_5k_secs)
    return {zone: _pace_range(vdot, low, high) for zone, (low, high) in _ZONE_BANDS.items()}


def build_training_paces_context(garmin_data: dict) -> str:
    """Render current training paces as markdown for the weekly planner prompt, or an explicit
    "unavailable" note if there's no current-fitness data yet — never silently omitted, so the
    Use Current Training Paces hard rule always has something concrete to check against.
    """
    paces = compute_training_paces(extract_predicted_5k_secs(garmin_data))
    if not paces:
        return (
            "No current-fitness data available yet (no recent race prediction from Garmin) — "
            "use zone letters only for every running session this week, no specific pace number."
        )
    return (
        f"- Easy: {paces['easy']}\n"
        f"- Tempo/Threshold: {paces['tempo']}\n"
        f"- VO2max Interval: {paces['vo2max']}"
    )
