"use client";

import { useState, useTransition } from "react";
import { saveMaxHR } from "@/app/actions/user-settings";

interface Props {
  manualValue: number | null;
  garminEstimate: number | null;
}

export function MaxHRInput({ manualValue, garminEstimate }: Props) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(manualValue?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const effectiveHR = manualValue ?? garminEstimate;
  const source = manualValue != null ? "manual" : garminEstimate != null ? "garmin" : null;

  function handleEdit() {
    setInputVal(manualValue?.toString() ?? garminEstimate?.toString() ?? "");
    setError(null);
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setError(null);
  }

  function handleSave(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveMaxHR(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setEditing(false);
      }
    });
  }

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>
            Max Heart Rate
          </div>
          {!editing && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", fontFamily: "var(--mono)" }}>
                {effectiveHR ?? "—"}
              </span>
              {effectiveHR && <span style={{ fontSize: 13, color: "var(--muted)" }}>bpm</span>}
              {source === "manual" && (
                <span className="badge" style={{ fontSize: 10 }}>Manual</span>
              )}
              {source === "garmin" && (
                <span className="badge badge-cyan" style={{ fontSize: 10 }}>Estimated from Garmin</span>
              )}
            </div>
          )}
          {garminEstimate && manualValue != null && (
            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>
              Garmin estimate: {garminEstimate} bpm
            </div>
          )}
          {!effectiveHR && !editing && (
            <div style={{ fontSize: 13, color: "var(--dim)", marginTop: 2 }}>
              Not set — enter manually or run the CLI to estimate from Garmin data
            </div>
          )}
        </div>

        {!editing && (
          <button className="btn-secondary" onClick={handleEdit} style={{ flexShrink: 0 }}>
            <i className="ti ti-pencil" style={{ marginRight: 6 }} />
            {effectiveHR ? "Edit" : "Set"}
          </button>
        )}
      </div>

      {editing && (
        <form action={handleSave} style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                name="max_heart_rate_bpm"
                type="number"
                min={100}
                max={230}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder="e.g. 190"
                autoFocus
                style={{
                  width: 100, padding: "8px 36px 8px 12px",
                  background: "rgba(255,255,255,.06)", border: "1px solid var(--border)",
                  borderRadius: 8, color: "var(--text)", fontSize: 15,
                  fontFamily: "var(--mono)", fontWeight: 700,
                }}
              />
              <span style={{ position: "absolute", right: 10, fontSize: 12, color: "var(--muted)", pointerEvents: "none" }}>bpm</span>
            </div>
            <button type="submit" className="btn-primary" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-secondary" onClick={handleCancel} disabled={isPending}>
              Cancel
            </button>
            {manualValue != null && (
              <button
                type="button"
                className="btn-secondary"
                style={{ color: "var(--dim)" }}
                disabled={isPending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("max_heart_rate_bpm", "");
                  startTransition(async () => {
                    await saveMaxHR(fd);
                    setEditing(false);
                  });
                }}
              >
                Clear (use Garmin estimate)
              </button>
            )}
          </div>
          {error && (
            <div style={{ fontSize: 12, color: "var(--red)", marginTop: 8 }}>{error}</div>
          )}
        </form>
      )}
    </div>
  );
}
