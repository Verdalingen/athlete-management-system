"""Heart-rate intensity zones, from the standard 5-zone %-of-max-HR model. Pure functions, no I/O
— mirrors training_paces.py's "pure logic" half of that module's pure-logic/thin-I/O split.

There is no external zone source to pull from (Garmin's own zone config, %-of-LTHR, etc. were
considered and dropped — see the cardio-session-hr-zones point in the backlog): the athlete's
`user_settings.max_heart_rate_bpm` already exists, so zones are derived from it directly, with no
extra dependency.
"""

# Standard 5-zone bands as (low_pct, high_pct) of max heart rate.
_ZONE_PCT_BOUNDS = {
    "Z1": (0.50, 0.60),
    "Z2": (0.60, 0.70),
    "Z3": (0.70, 0.80),
    "Z4": (0.80, 0.90),
    "Z5": (0.90, 1.00),
}


def hr_zone_boundaries(max_heart_rate_bpm: int) -> dict[str, tuple[int, int]]:
    """Return {"Z1": (low_bpm, high_bpm), ..., "Z5": (low_bpm, high_bpm)} for the given max heart
    rate — boundaries rounded to whole bpm.
    """
    return {
        label: (round(max_heart_rate_bpm * lo), round(max_heart_rate_bpm * hi))
        for label, (lo, hi) in _ZONE_PCT_BOUNDS.items()
    }


def assign_hr_zone(
    avg_heart_rate: int | None, max_heart_rate_bpm: int | None
) -> tuple[str, int, int] | None:
    """Return (zone_label, low_bpm, high_bpm) for a given average heart rate against the
    athlete's max HR, or None if either input is missing.

    A value below Z1's low bound clamps into Z1 (still gets a zone, not None — a genuinely easy
    recovery effort shouldn't fall out of the model). A value at or above max clamps into Z5.
    Otherwise, a value exactly on a boundary belongs to the higher zone (e.g. 140 with max 200 is
    Z3, not Z2) — each zone's range is treated as low-inclusive/high-exclusive.
    """
    if avg_heart_rate is None or max_heart_rate_bpm is None:
        return None

    boundaries = hr_zone_boundaries(max_heart_rate_bpm)
    z1_low = boundaries["Z1"][0]
    z5_high = boundaries["Z5"][1]

    if avg_heart_rate < z1_low:
        label = "Z1"
    elif avg_heart_rate >= z5_high:
        label = "Z5"
    else:
        label = next(z for z, (_, high) in boundaries.items() if avg_heart_rate < high)

    low, high = boundaries[label]
    return (label, low, high)
