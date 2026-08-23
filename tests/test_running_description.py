"""Tests for the deterministic run-session rendering in services/garmin/running_uploader.

render_running_description() is the single source of truth for what a run day says: the
planner's own `description` field is discarded for run days and this output used instead, so
display text cannot disagree with the workout that got pushed to the watch. It also feeds
web/lib/duration.ts, which parses this notation back into a duration — two real parsing bugs
came from that notation not being what the parser expected, so the exact shape matters.
"""
from services.garmin.running_uploader import (
    estimate_running_duration_secs,
    normalize_recovery_segments,
    render_running_description,
)


def seg(segment_type: str, **kw) -> dict:
    base = {
        "segment_type": segment_type,
        "zone": None,
        "duration_secs": None,
        "distance_meters": None,
        "pace_low": None,
        "pace_high": None,
        "repeat_count": 1,
        "note": None,
    }
    base.update(kw)
    return base


class TestSingleSegments:
    def test_empty_session_renders_empty(self):
        assert render_running_description([]) == ""

    def test_whole_minute_durations_render_as_minutes(self):
        assert render_running_description([seg("steady", zone="Z2", duration_secs=2700)]) == (
            "45min Z2 continuous"
        )

    def test_non_whole_minutes_keep_their_seconds(self):
        assert render_running_description([seg("steady", zone="Z2", duration_secs=150)]) == (
            "2:30min Z2 continuous"
        )

    def test_warmup_and_cooldown_get_readable_labels(self):
        assert render_running_description([seg("warmup", zone="Z2", duration_secs=900)]) == (
            "15min Z2 warm-up"
        )
        assert render_running_description([seg("cooldown", zone="Z2", duration_secs=600)]) == (
            "10min Z2 cool-down"
        )

    def test_round_kilometres_render_as_km(self):
        assert render_running_description([seg("interval", zone="Z5", distance_meters=1000)]) == (
            "1km Z5"
        )

    def test_sub_kilometre_distances_render_as_metres(self):
        assert render_running_description([seg("interval", zone="Z5", distance_meters=400)]) == (
            "400m Z5"
        )

    def test_non_round_distances_stay_in_metres(self):
        assert render_running_description([seg("interval", zone="Z5", distance_meters=1500)]) == (
            "1500m Z5"
        )

    def test_a_pace_range_is_appended(self):
        rendered = render_running_description(
            [seg("interval", zone="Z5", distance_meters=1000, pace_low="3:50", pace_high="4:00")]
        )
        assert rendered == "1km Z5 @3:50-4:00/km"

    def test_a_single_pace_is_not_rendered_as_a_range(self):
        rendered = render_running_description(
            [seg("interval", zone="Z4", distance_meters=1000, pace_low="4:10", pace_high="4:10")]
        )
        assert rendered == "1km Z4 @4:10/km"

    def test_a_half_specified_pace_is_dropped(self):
        rendered = render_running_description(
            [seg("interval", zone="Z5", distance_meters=400, pace_low="3:50")]
        )
        assert rendered == "400m Z5"


class TestRepeatsAndGrouping:
    def test_a_lone_repeated_segment_renders_without_brackets(self):
        rendered = render_running_description(
            [seg("interval", zone="Z5", distance_meters=200, repeat_count=6)]
        )
        assert rendered == "6x200m Z5"

    def test_a_work_and_recovery_pair_is_grouped_into_brackets(self):
        rendered = render_running_description([
            seg("interval", zone="Z5", distance_meters=1000,
                pace_low="3:50", pace_high="4:00", repeat_count=5),
            seg("recovery", duration_secs=150, note="jog", repeat_count=5),
        ])
        assert rendered == "5x(1km Z5 @3:50-4:00/km, 2:30min jog r)"

    def test_recovery_without_a_note_defaults_to_jog(self):
        rendered = render_running_description([
            seg("interval", zone="Z5", distance_meters=400, repeat_count=4),
            seg("recovery", duration_secs=90, repeat_count=4),
        ])
        assert rendered == "4x(400m Z5, 1:30min jog r)"

    def test_segments_are_joined_with_plus(self):
        rendered = render_running_description([
            seg("warmup", zone="Z2", duration_secs=900),
            seg("interval", zone="Z5", distance_meters=1000,
                pace_low="3:50", pace_high="4:00", repeat_count=5),
            seg("recovery", duration_secs=150, note="jog", repeat_count=5),
            seg("cooldown", zone="Z2", duration_secs=600),
        ])
        assert rendered == (
            "15min Z2 warm-up + 5x(1km Z5 @3:50-4:00/km, 2:30min jog r) + 10min Z2 cool-down"
        )

    def test_the_zone_sits_between_distance_and_pace(self):
        # web/lib/duration.ts has to bridge whatever sits between the distance and the "@".
        # A parser assuming they are adjacent silently undercounts every interval, which is
        # exactly the bug that shipped.
        rendered = render_running_description(
            [seg("interval", zone="Z5", distance_meters=400, pace_low="1:30", pace_high="1:35")]
        )
        assert rendered == "400m Z5 @1:30-1:35/km"
        assert "Z5 @" in rendered


class TestDurationEstimation:
    def test_time_based_segments_are_summed(self):
        total = estimate_running_duration_secs([
            seg("warmup", duration_secs=900),
            seg("cooldown", duration_secs=600),
        ])
        assert total == 1500

    def test_repeats_multiply(self):
        assert estimate_running_duration_secs([seg("interval", duration_secs=60, repeat_count=5)]) == 300

    def test_distance_is_estimated_from_the_midpoint_of_the_pace_range(self):
        # 1km at a 4:00-4:20 range -> 250s midpoint.
        total = estimate_running_duration_secs(
            [seg("interval", distance_meters=1000, pace_low="4:00", pace_high="4:20")]
        )
        assert total == 250

    def test_distance_without_pace_uses_the_flat_fallback(self):
        # 1km at the 5:30/km fallback.
        assert estimate_running_duration_secs([seg("interval", distance_meters=1000)]) == 330

    def test_a_full_session_totals_all_parts(self):
        total = estimate_running_duration_secs([
            seg("warmup", duration_secs=900),
            seg("interval", distance_meters=1000, pace_low="4:00", pace_high="4:00", repeat_count=4),
            seg("recovery", duration_secs=120, repeat_count=4),
            seg("cooldown", duration_secs=600),
        ])
        assert total == 900 + (240 * 4) + (120 * 4) + 600

    def test_an_empty_session_is_zero(self):
        assert estimate_running_duration_secs([]) == 0


class TestRecoveryNormalisation:
    """The schema says only the work interval should be distance-based, but the LLM has been
    observed emitting a distance-based jog recovery with no pace at all. Rather than keep
    tightening prompt wording, the rule is enforced in code."""

    def test_a_distance_based_recovery_becomes_time_based(self):
        segments = [seg("recovery", distance_meters=200)]
        normalize_recovery_segments(segments)

        assert segments[0]["distance_meters"] is None
        assert segments[0]["duration_secs"] == 66  # 200m at the 5:30/km fallback

    def test_conversion_uses_the_segment_pace_when_it_has_one(self):
        segments = [seg("recovery", distance_meters=1000, pace_low="6:00", pace_high="6:00")]
        normalize_recovery_segments(segments)

        assert segments[0]["duration_secs"] == 360
        assert segments[0]["distance_meters"] is None

    def test_work_intervals_stay_distance_based(self):
        segments = [seg("interval", distance_meters=400, zone="Z5")]
        normalize_recovery_segments(segments)

        assert segments[0]["distance_meters"] == 400
        assert segments[0]["duration_secs"] is None

    def test_already_time_based_segments_are_untouched(self):
        segments = [seg("recovery", duration_secs=120)]
        normalize_recovery_segments(segments)

        assert segments[0]["duration_secs"] == 120
        assert segments[0]["distance_meters"] is None

    def test_normalising_changes_how_the_session_renders(self):
        segments = [
            seg("interval", zone="Z5", distance_meters=400, repeat_count=6),
            seg("recovery", distance_meters=200, repeat_count=6),
        ]
        normalize_recovery_segments(segments)

        assert render_running_description(segments) == "6x(400m Z5, 1:06min jog r)"
