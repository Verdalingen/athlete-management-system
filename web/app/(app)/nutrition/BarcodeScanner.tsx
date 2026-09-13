"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useT } from "@/lib/i18n/LanguageContext";

type Props = {
  onScan: (barcode: string) => void;
  onClose: () => void;
};

// Chromium (Android Chrome/Brave) ships the native BarcodeDetector API — an OS/ML-backed
// detector that's far more tolerant of blur and skew than ZXing's classic decode algorithm —
// so where it's available we run it live against the getUserMedia preview instead of needing a
// single clean photo. WebKit (every iOS browser, Brave included, since Apple forces the WebKit
// engine on iOS) has never implemented it and has no announced plans to, so this always falls
// back to native-camera-capture + ZXing still-image decode there instead.
declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats: string[] }): {
        detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
      };
    };
  }
}

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
  },
};

type Mode = "live" | "capture-opening" | "capture-decoding" | "capture-error";

export function BarcodeScanner({ onScan, onClose }: Props) {
  const nt = useT().nutrition;
  const t = nt.barcodeScanner;
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<number | null>(null);
  const scannedRef = useRef(false);

  const [mode, setMode] = useState<Mode>(
    typeof window !== "undefined" && "BarcodeDetector" in window ? "live" : "capture-opening"
  );
  const [errorMsg, setErrorMsg] = useState("");

  const stopLive = useCallback(() => {
    if (pollRef.current != null) { window.clearInterval(pollRef.current); pollRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Live path: BarcodeDetector polling a getUserMedia preview.
  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new window.BarcodeDetector!({ formats: BARCODE_FORMATS });
        pollRef.current = window.setInterval(async () => {
          if (cancelled || scannedRef.current || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            if (results.length > 0 && !scannedRef.current) {
              scannedRef.current = true;
              stopLive();
              onScan(results[0].rawValue);
            }
          } catch {
            // Transient failure decoding a mid-transition video frame — next tick retries.
          }
        }, 300);
      } catch {
        // Camera denied/unavailable for a live preview — fall back to native capture.
        if (!cancelled) setMode("capture-opening");
      }
    }

    start();
    return () => { cancelled = true; stopLive(); };
  }, [mode, onScan, stopLive]);

  // Fallback path: hand capture off to the native camera app, decode the resulting photo.
  useEffect(() => {
    if (mode !== "capture-opening") return;
    inputRef.current?.click();

    // Chrome 113+ fires `cancel` on the input if the user backs out of the native camera
    // without taking a photo — Safari doesn't, so this is best-effort; the Cancel button
    // below is what actually guarantees a way out.
    const input = inputRef.current;
    const handleCancel = () => onClose();
    input?.addEventListener("cancel", handleCancel);
    return () => input?.removeEventListener("cancel", handleCancel);
  }, [mode, onClose]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow retaking the same shot again on retry
    if (!file) { onClose(); return; }

    setMode("capture-decoding");
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      onScan(result.getText());
    } catch {
      setErrorMsg(t.noBarcodeFound);
      setMode("capture-error");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const buttonStyle: React.CSSProperties = {
    background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.2)",
    color: "#fff", borderRadius: 8, padding: "10px 18px", cursor: "pointer",
    fontSize: 14, fontWeight: 600, backdropFilter: "blur(4px)",
  };

  if (mode === "live") {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#000", display: "flex", flexDirection: "column" }}>
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />

        {/* Dark overlay with scanning window cut-out */}
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <mask id="scanMask">
              <rect width="100" height="100" fill="white" />
              <rect x="15" y="35" width="70" height="30" rx="2" fill="black" />
            </mask>
          </defs>
          <rect width="100" height="100" fill="rgba(0,0,0,0.55)" mask="url(#scanMask)" />
        </svg>

        <div
          style={{
            position: "absolute", top: "calc(35% + 32%)", left: 0, right: 0,
            textAlign: "center", color: "rgba(255,255,255,.75)", fontSize: 13, fontWeight: 600,
          }}
        >
          {t.alignFrame}
        </div>

        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0,
            padding: "16px 20px",
            background: "linear-gradient(rgba(0,0,0,.6), transparent)",
          }}
        >
          <button onClick={() => { stopLive(); onClose(); }} style={buttonStyle}>✕ {nt.actions.cancel}</button>
        </div>
      </div>
    );
  }

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
        {mode === "capture-opening" && t.openingCamera}
        {mode === "capture-decoding" && t.readingBarcode}
        {mode === "capture-error" && <span style={{ color: "var(--red)" }}>{errorMsg}</span>}
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        {mode === "capture-error" && (
          <button onClick={() => setMode("capture-opening")} style={buttonStyle}>{t.tryAgain}</button>
        )}
        <button onClick={onClose} style={buttonStyle}>{nt.actions.cancel}</button>
      </div>
    </div>
  );
}
