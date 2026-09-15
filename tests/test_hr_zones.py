"""Tests for services.garmin.hr_zones — the standard 5-zone %-of-max-HR model (point:
cardio-session-hr-zones). Pure functions, no Supabase — mirrors training_paces.py's "pure logic"
half of that module's pure-logic/thin-I/O split.
"""
from services.garmin import hr_zones


class TestHrZoneBoundaries:
    def test_five_zones_from_max_hr(self):
        # max_hr=200 -> clean round numbers, easy to verify by hand
        boundaries = hr_zones.hr_zone_boundaries(200)
        assert boundaries == {
            "Z1": (100, 120),
            "Z2": (120, 140),
            "Z3": (140, 160),
            "Z4": (160, 180),
            "Z5": (180, 200),
        }

    def test_boundaries_round_to_whole_bpm(self):
        # max_hr=187 -> percentages don't land on whole numbers; every boundary must still be int
        boundaries = hr_zones.hr_zone_boundaries(187)
        assert set(boundaries.keys()) == {"Z1", "Z2", "Z3", "Z4", "Z5"}
        for low, high in boundaries.values():
            assert isinstance(low, int) and isinstance(high, int)
            assert low < high


class TestAssignHrZone:
    def test_mid_zone_value(self):
        # 150 sits squarely inside Z3 (140-160) at max_hr=200
        assert hr_zones.assign_hr_zone(150, 200) == ("Z3", 140, 160)

    def test_value_at_zone_boundary_goes_to_higher_zone(self):
        # 140 is exactly the Z2/Z3 boundary - low end is inclusive on the zone it starts
        assert hr_zones.assign_hr_zone(140, 200) == ("Z3", 140, 160)

    def test_value_below_zone1_clamps_to_zone1(self):
        # a recovery-effort session with avg HR under 50% of max still gets a zone, not None
        assert hr_zones.assign_hr_zone(80, 200) == ("Z1", 100, 120)

    def test_value_at_or_above_max_clamps_to_zone5(self):
        assert hr_zones.assign_hr_zone(205, 200) == ("Z5", 180, 200)
        assert hr_zones.assign_hr_zone(200, 200) == ("Z5", 180, 200)

    def test_none_when_avg_heart_rate_missing(self):
        assert hr_zones.assign_hr_zone(None, 200) is None

    def test_none_when_max_heart_rate_bpm_missing(self):
        assert hr_zones.assign_hr_zone(150, None) is None
