export interface Plan {
  id: string;
  created_at: string;
  start_date: string;
  end_date: string;
  markdown: string;
}

export interface ScheduledDay {
  id: string;
  plan_id: string;
  date: string;
  session_type: string;
  focus: string | null;
  description: string | null;
  is_key: boolean;
  is_rest: boolean;
}

export interface StrengthSession {
  id: string;
  plan_id: string;
  date: string;
  name: string;
  garmin_workout_id: number | null;
  estimated_duration_secs: number;
  exercises: Exercise[];
}

export interface Exercise {
  id: string;
  display_order: number;
  garmin_category: string | null;
  garmin_exercise_key: string | null;
  display_name: string;
  sets: number;
  reps: number;
  rest_seconds: number;
  rir: number | null;
}
