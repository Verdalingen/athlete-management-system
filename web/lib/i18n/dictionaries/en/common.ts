// Truly cross-cutting strings only — used by more than one page/namespace. Anything specific
// to a single page belongs in that page's own namespace file instead, even if it duplicates a
// word here, so namespace files can be edited independently without merging conflicts.
export const common = {
  appName: "Athlete Management System",
  appNameShort: "AMS",
  actions: {
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    edit: "Edit",
    delete: "Remove",
    add: "Add",
    confirm: "Confirm",
    back: "Back",
    retry: "Retry",
  },
  loading: "Loading…",
  error: "Something went wrong",
};
