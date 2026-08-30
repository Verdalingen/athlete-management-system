"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onScan: (barcode: string) => void;
  onClose: () => void;
};

// Two rounds of tuning getUserMedia constraints (facingMode, resolution, focusMode) couldn't get
// the live in-page video preview sharp enough to reliably resolve a barcode — mobile browsers cap
// what quality they hand to a raw MediaStream well below what the OS camera app itself can do.
// This hands the whole capture step to the native camera app instead (via <input capture>, which
// gets its own autofocus/HDR/stabilization pipeline) and decodes the single resulting photo.
export function BarcodeScanner({ onScan, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"opening" | "decoding" | "error">("opening");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    inputRef.current?.click();

    // Chrome 113+ fires `cancel` on the input if the user backs out of the native camera
    // without taking a photo — Safari doesn't, so this is best-effort; the Cancel button
    // below is what actually guarantees a way out.
    const input = inputRef.current;
    const handleCancel = () => onClose();
    input?.addEventListener("cancel", handleCancel);
    return () => input?.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow retaking the same shot again on retry
    if (!file) { onClose(); return; }

    setStatus("decoding");
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      onScan(result.getText());
    } catch {
      setErrorMsg("No barcode found in that photo. Try again with the barcode centered and in focus.");
      setStatus("error");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const retake = () => {
    setStatus("opening");
    inputRef.current?.click();
  };

  const buttonStyle: React.CSSProperties = {
    background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.2)",
    color: "#fff", borderRadius: 8, padding: "10px 18px", cursor: "pointer",
    fontSize: 14, fontWeight: 600, backdropFilter: "blur(4px)",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "#000",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 20, padding: 24,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <div
        style={{
          color: "rgba(255,255,255,.85)",
          fontSize: 14, fontWeight: 600,
          textAlign: "center", maxWidth: 320,
        }}
      >
        {status === "opening" && "Opening camera…"}
        {status === "decoding" && "Reading barcode…"}
        {status === "error" && <span style={{ color: "var(--red)" }}>{errorMsg}</span>}
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        {status === "error" && (
          <button onClick={retake} style={buttonStyle}>Try again</button>
        )}
        <button onClick={onClose} style={buttonStyle}>Cancel</button>
      </div>
    </div>
  );
}
