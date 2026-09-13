export const plan = {
  empty: {
    noPlanPrefix: "Ingen plan funnet. Kjør",
    noPlanSuffix: "for å generere en.",
  },
  header: {
    defaultTitle: "Treningsplan",
    weeks: "uker",
    generated: "Generert {date}",
  },
  actions: {
    title: "Handlinger",
  },
  phase: {
    current: "Gjeldende fase",
    phaseNumber: "Fase {number}",
    entryLoad: "Inngangsbelastning {value}",
    week: "Uke {current} / {total}",
    seasonProgress: "Sesongfremgang",
    target: "Mål",
  },
  seasonCalendar: {
    title: "Sesongkalender",
    legend: {
      keySession: "Nøkkeløkt",
      completed: "Fullført",
    },
  },
  strategy: {
    title: "Uke-for-uke-strategi",
    week: "Uke",
    goal: "Mål",
  },
  replan: {
    cancel: "Avbryt",
    unknownError: "Ukjent feil",
    notAuthenticated: "Ikke innlogget",
    recentJobs: "Nylige jobber",
    coachFeedback: "Tilbakemelding fra treneren",
    status: {
      pending: "I kø",
      running: "Kjører…",
      done: "Ferdig",
      error: "Mislyktes",
    },
    jobType: {
      daily: "Omplanlegging",
      replan: "Statussjekk",
      sync_kpis: "Dataoppdatering",
      seasonal: "Ny sesong",
    },
    buttons: {
      queuing: "Setter i kø…",
      reschedule: "Omplanlegg",
      checkIn: "Statussjekk",
      newSeason: "Ny sesong",
    },
    timeAgo: {
      seconds: "{n}s siden",
      minutes: "{n}m siden",
      hours: "{n}t siden",
      days: "{n}d siden",
    },
    comment: {
      missedSessions: "Uteblitte økter:",
      upcomingConstraints: "Kommende begrensninger:",
      note: "Merknad: {note}",
    },
    calendarPicker: {
      dayHeaders: ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"],
      missed: "Uteblitt",
      constrained: "Begrenset",
      rangeSelectHint: "Shift+klikk for å velge et intervall",
      clear: "Fjern {count}",
    },
    modals: {
      queueHintPrefix: "Etter du har satt i kø, kjør",
      queueHintSuffix: "for å behandle.",
      daily: {
        title: "Omplanlegging",
        time: "~30s",
        description: "Marker datoer du gikk glipp av eller vil ha begrensninger på, og legg til en merknad. Treneren avgjør hva som skal omplanlegges eller droppes.",
        commentPlaceholder: "Valgfri merknad — hva skjedde, eller hvilke begrensninger kommer? (f.eks. syk, reise, dårlig tid)",
        confirmLabel: "Sett omplanlegging i kø",
      },
      replan: {
        title: "Statussjekk",
        time: "~2-3 min",
        description: "Leser 14 dager med Garmin-data og bruker AI til å omplanlegge de neste 6 ukene, og tilpasser seg det som faktisk ble gjennomført, samtidig som sesongplanen følges. Uker utenfor dette vinduet beholdes uendret.",
        commentPlaceholder: "Valgfri merknad — hvordan har treningen vært siden sist statussjekk? Tretthet, skader, kommende begrensninger…",
        confirmLabel: "Sett statussjekk i kø",
      },
      seasonal: {
        title: "Ny sesong",
        time: "~7-10 min",
        description: "Kjører hele AI-pipelinen — ekspertanalyse, nye HTML-rapporter og en helt ny sesongplan for neste treningsblokk. Brukes når sesongen din avsluttes eller etter en stor endring i målene dine.",
        commentPlaceholder: "Valgfri merknad — mål eller fokusområder for den nye sesongen…",
        confirmLabel: "Start ny sesong",
      },
    },
  },
};
