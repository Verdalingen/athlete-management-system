import os
from dataclasses import dataclass
from enum import Enum
from typing import Any


class TimeRange(Enum):
    # Values are determined by AI_MODE environment variable
    RECENT = 7 if os.getenv("AI_MODE") == "development" else 21
    EXTENDED = 14 if os.getenv("AI_MODE") == "development" else 56
    LONG_TERM_RANGE = 360
    LONG_TERM_INTERVAL = 7


@dataclass
class ExtractionConfig:
    activities_range: int = TimeRange.RECENT.value
    metrics_range: int = TimeRange.EXTENDED.value
    include_detailed_activities: bool = True
    # With include_detailed_activities, fetch only the activity-list endpoint and
    # skip per-activity detail calls (splits, sets, weather) — much cheaper.
    activity_summaries_only: bool = False
    include_metrics: bool = True
    include_mindfulness: bool = True
    include_long_term_trends: bool = True
    long_term_range: int = TimeRange.LONG_TERM_RANGE.value
    long_term_interval: int = TimeRange.LONG_TERM_INTERVAL.value


@dataclass
class UserProfile:
    gender: str | None = None
    weight: float | None = None
    height: float | None = None
    birth_date: str | None = None
    activity_level: str | None = None
    vo2max_running: float | None = None
    vo2max_cycling: float | None = None
    lactate_threshold_speed: float | None = None  # Speed in m/s
    lactate_threshold_heart_rate: int | None = None
    ftp_auto_detected: bool | None = None
    available_training_days: list[str] | None = None
    preferred_long_training_days: list[str] | None = None
    sleep_time: str | None = None
    wake_time: str | None = None


@dataclass
class DailyStats:
    date: str | None = None
    total_steps: int | None = None
    total_distance_meters: float | None = None
    total_calories: int | None = None
    active_calories: int | None = None
    bmr_calories: int | None = None
    wellness_start_time: str | None = None
    wellness_end_time: str | None = None
    duration_in_hours: float | None = None
    min_heart_rate: int | None = None
    max_heart_rate: int | None = None
    resting_heart_rate: int | None = None
    average_stress_level: float | None = None
    max_stress_level: int | None = None
    stress_duration_seconds: int | None = None
    sleeping_seconds: int | None = None
    sleeping_hours: float | None = None
    respiration_average: float | None = None
    respiration_highest: float | None = None
    respiration_lowest: float | None = None


@dataclass
class ActivitySummary:
    distance: float | None = None
    duration: int | None = None
    moving_duration: int | None = None
    elevation_gain: float | None = None
    elevation_loss: float | None = None
    average_speed: float | None = None
    max_speed: float | None = None
    calories: int | None = None
    average_hr: int | None = None
    max_hr: int | None = None
    min_hr: int | None = None
    activity_training_load: int | None = None
    moderate_intensity_minutes: int | None = None
    vigorous_intensity_minutes: int | None = None
    recovery_heart_rate: int | None = None
    # Respiration (for meditation/mindfulness-capable activities)
    avg_respiration_rate: float | None = None
    min_respiration_rate: float | None = None
    max_respiration_rate: float | None = None
    # Stress (for meditation/mindfulness-capable activities)
    start_stress: float | None = None
    end_stress: float | None = None
    avg_stress: float | None = None
    max_stress: float | None = None
    difference_stress: float | None = None
    # Power-related fields for cycling activities
    avg_power: float | None = None
    max_power: float | None = None
    normalized_power: float | None = None
    training_stress_score: float | None = None
    intensity_factor: float | None = None


@dataclass
class WeatherData:
    temp: float | None = None
    apparent_temp: float | None = None
    relative_humidity: float | None = None
    wind_speed: float | None = None
    weather_type: str | None = None


@dataclass
class HeartRateZone:
    zone_number: int | None = None
    secs_in_zone: int | None = None
    zone_low_boundary: int | None = None


@dataclass
class ExerciseSet:
    set_type: str | None = None           # "ACTIVE" or "REST"
    exercise_category: str | None = None  # e.g. "BENCH_PRESS", "PULL_UP"
    exercise_name: str | None = None      # specific variant name if Garmin provided one
    reps: int | None = None
    weight_kg: float | None = None
    duration_seconds: float | None = None
    start_time: str | None = None
    # Non-null when this set was part of a coach-planned workout synced to the watch.
    # Null means exercise detection was auto-detected by Garmin (probabilistic, less reliable).
    wkt_step_index: int | None = None


@dataclass
class Activity:
    activity_id: int | None = None
    activity_type: str | None = None
    activity_name: str | None = None
    start_time: str | None = None
    summary: ActivitySummary | None = None
    weather: WeatherData | None = None
    hr_zones: list[HeartRateZone] | None = None
    laps: list[dict[str, Any]] | None = None  # Complex structure, keeping as Dict for now
    exercise_sets: list[ExerciseSet] | None = None  # Populated for strength activities


@dataclass
class PhysiologicalMarkers:
    resting_heart_rate: int | None = None
    vo2_max: float | None = None
    hrv: dict[str, Any] | None = None  # Complex nested structure, keeping as Dict for now


@dataclass
class BodyMetrics:
    weight: dict[str, Any] | None = None  # Complex nested structure with historical data
    hydration: list[dict[str, Any]] | None = None  # Complex structure with daily data


@dataclass
class RecoveryIndicators:
    date: str | None = None
    sleep: dict[str, Any] | None = None  # Complex nested structure
    stress: dict[str, Any] | None = None  # Complex nested structure


@dataclass
class TrainingStatus:
    vo2_max: dict[str, Any] | None = None
    acute_training_load: dict[str, Any] | None = None


@dataclass
class GarminData:
    user_profile: UserProfile | None = None
    daily_stats: list[DailyStats] | None = None  # one entry per day in the metrics range
    recent_activities: list[Activity] | None = None
    all_activities: list[Activity] | None = None
    physiological_markers: PhysiologicalMarkers | None = None
    body_metrics: BodyMetrics | None = None
    recovery_indicators: list[RecoveryIndicators] | None = None
    training_status: TrainingStatus | None = None
    vo2_max_history: dict[str, list[dict[str, Any]]] | None = None
    training_load_history: list[dict[str, Any]] | None = None
    long_term_vo2_max_trend: dict[str, list[dict[str, Any]]] | None = None
    long_term_training_load_trend: list[dict[str, Any]] | None = None
    race_predictions: dict[str, Any] | None = None
    body_battery: list[dict[str, Any]] | None = None       # daily end-of-day body battery
    training_readiness: dict[str, Any] | None = None       # most recent readiness score
    personal_records: list[dict[str, Any]] | None = None   # Garmin-tracked PRs
