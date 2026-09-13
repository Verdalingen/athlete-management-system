// Filled in by the plan-page translation pass. Keep in sync with dictionaries/no/plan.ts.
export const plan = {
  empty: {
    noPlanPrefix: "No plan found. Run",
    noPlanSuffix: "to generate one.",
  },
  header: {
    defaultTitle: "Training Plan",
    weeks: "weeks",
    generated: "Generated {date}",
  },
  actions: {
    title: "Actions",
  },
  phase: {
    current: "Current Phase",
    phaseNumber: "Phase {number}",
    entryLoad: "Entry load {value}",
    week: "Week {current} / {total}",
    seasonProgress: "Season progress",
    target: "Target",
  },
  seasonCalendar: {
    title: "Season Calendar",
    legend: {
      keySession: "Key session",
      completed: "Completed",
    },
  },
  strategy: {
    title: "Week-by-week Strategy",
    week: "Week",
    goal: "Goal",
  },
  replan: {
    cancel: "Cancel",
    unknownError: "Unknown error",
    notAuthenticated: "Not authenticated",
    recentJobs: "Recent jobs",
    coachFeedback: "Coach Feedback",
    status: {
      pending: "Queued",
      running: "Running…",
      done: "Done",
      error: "Failed",
    },
    jobType: {
      daily: "Reschedule",
      replan: "Check-In",
      sync_kpis: "Data Refresh",
      seasonal: "New Season",
    },
    buttons: {
      queuing: "Queuing…",
      reschedule: "Reschedule",
      checkIn: "Check-In",
      newSeason: "New Season",
    },
    timeAgo: {
      seconds: "{n}s ago",
      minutes: "{n}m ago",
      hours: "{n}h ago",
      days: "{n}d ago",
    },
    comment: {
      missedSessions: "Missed sessions:",
      upcomingConstraints: "Upcoming constraints:",
      note: "Note: {note}",
    },
    calendarPicker: {
      dayHeaders: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      missed: "Missed",
      constrained: "Constrained",
      rangeSelectHint: "Shift+click to range-select",
      clear: "Clear {count}",
    },
    modals: {
      queueHintPrefix: "After queuing, run",
      queueHintSuffix: "to process.",
      daily: {
        title: "Reschedule",
        time: "~30s",
        description: "Mark dates you missed or will be constrained, then add a note. The coach will decide what to reschedule or drop.",
        commentPlaceholder: "Optional note — what happened, or what constraints are coming up? (e.g. sick, travel, limited time)",
        confirmLabel: "Queue Reschedule",
      },
      replan: {
        title: "Check-In",
        time: "~2-3 min",
        description: "Reads 14 days of Garmin data and uses AI to re-plan the next 6 weeks, adapting to what was actually completed while staying true to the season plan. Weeks beyond that window are preserved unchanged.",
        commentPlaceholder: "Optional note — how has training been since last check-in? Fatigue, injuries, upcoming constraints…",
        confirmLabel: "Queue Check-In",
      },
      seasonal: {
        title: "New Season",
        time: "~7-10 min",
        description: "Runs the full AI pipeline — expert analysis, new HTML reports, and a completely new season plan for the next training block. Use when your current season ends or after a major shift in goals.",
        commentPlaceholder: "Optional note — goals or focus areas for the new season…",
        confirmLabel: "Start New Season",
      },
    },
  },
};
