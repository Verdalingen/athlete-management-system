"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { IScannerControls } from "@zxing/browser";

type Props = {
  onScan: (barcode: string) => void;
  onClose: () => void;
};

export function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [status, setStatus] = useState<"loading" | "scanning" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [torch, setTorch] = useState(false);
  const scannedRef = useRef(false);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        // Dynamic import keeps ZXing out of the SSR bundle
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;

        const reader = new BrowserMultiFormatReader();

        // Explicit facingMode + resolution: `decodeFromVideoDevice(undefined, ...)` lets the
        // browser pick any camera with its own default (often low) resolution, which on phones
        // with multiple cameras can silently select the front-facing one — the scanner then
        // never finds a barcode no matter how good the lighting is, because it's pointed the
        // wrong way. Requesting the rear camera and a higher resolution up front fixes both.
        // 1080p (not 720p) because resolving fine barcode bars needs more pixels than typical
        // video calls do; `focusMode: "continuous"` (inside `advanced`, so unsupported browsers
        // just ignore it per spec rather than failing) keeps the lens hunting for sharp focus
        // instead of settling once and staying there.
        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
            },
          },
          videoRef.current!,
          (result, err) => {
            if (cancelled || scannedRef.current) return;
            if (result) {
              scannedRef.current = true;
              stopScanner();
              onScan(result.getText());
            }
            // NotFoundException fires constantly when no barcode is visible — ignore it
            if (err && err.name !== "NotFoundException") {
              console.warn("[BarcodeScanner]", err.message);
            }
          },
        );

        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;
        setStatus("scanning");
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")) {
          setErrorMsg("Camera access denied. Allow camera in your browser settings.");
        } else if (msg.toLowerCase().includes("found") || msg.toLowerCase().includes("device")) {
          setErrorMsg("No camera found on this device.");
        } else {
          setErrorMsg(`Camera error: ${msg}`);
        }
        setStatus("error");
      }
    }

    start();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [onScan, stopScanner]);

  const toggleTorch = async () => {
    if (!controlsRef.current) return;
    const next = !torch;
    try {
      await controlsRef.current.switchTorch?.(next);
      setTorch(next);
    } catch {
      // Torch not supported on this device — silently ignore
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "#000",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Video feed */}
      <video
        ref={videoRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        playsInline
        muted
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

      {/* Animated scan line */}
      {status === "scanning" && (
        <div
          style={{
            position: "absolute",
            left: "15%", right: "15%",
            top: "35%",
            height: 2,
            background: "linear-gradient(90deg, transparent, var(--cyan, #2de2e6), transparent)",
            borderRadius: 1,
            animation: "scanline 1.6s ease-in-out infinite",
          }}
        />
      )}

      {/* Corner brackets */}
      {(["tl","tr","bl","br"] as const).map(corner => {
        const top  = corner.startsWith("t") ? "35%" : undefined;
        const bottom = corner.startsWith("b") ? "35%" : undefined;
        const left  = corner.endsWith("l") ? "15%" : undefined;
        const right = corner.endsWith("r") ? "15%" : undefined;
        const bTop    = corner.startsWith("t") ? "2px solid var(--cyan, #2de2e6)" : undefined;
        const bBottom = corner.startsWith("b") ? "2px solid var(--cyan, #2de2e6)" : undefined;
        const bLeft   = corner.endsWith("l")   ? "2px solid var(--cyan, #2de2e6)" : undefined;
        const bRight  = corner.endsWith("r")   ? "2px solid var(--cyan, #2de2e6)" : undefined;
        return (
          <div
            key={corner}
            style={{
              position: "absolute",
              top, bottom, left, right,
              width: 24, height: 24,
              borderTop: bTop, borderBottom: bBottom,
              borderLeft: bLeft, borderRight: bRight,
            }}
          />
        );
      })}

      {/* Label */}
      <div
        style={{
          position: "absolute",
          top: "calc(35% + 32%)",
          left: 0, right: 0,
          textAlign: "center",
          color: "rgba(255,255,255,.75)",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: ".02em",
        }}
      >
        {status === "loading" && "Starting camera…"}
        {status === "scanning" && "Align barcode within the frame"}
        {status === "error" && (
          <span style={{ color: "var(--red)" }}>{errorMsg}</span>
        )}
      </div>

      {/* Controls */}
      <div
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px",
          background: "linear-gradient(rgba(0,0,0,.6), transparent)",
        }}
      >
        <button
          onClick={() => { stopScanner(); onClose(); }}
          style={{
            background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.2)",
            color: "#fff", borderRadius: 8, padding: "8px 14px", cursor: "pointer",
            fontSize: 13, fontWeight: 600, backdropFilter: "blur(4px)",
          }}
        >
          ✕ Cancel
        </button>

        <span style={{ color: "rgba(255,255,255,.8)", fontSize: 13, fontWeight: 700 }}>
          Barcode Scanner
        </span>

        <button
          onClick={toggleTorch}
          title={torch ? "Turn off flashlight" : "Turn on flashlight"}
          style={{
            background: torch ? "rgba(255,204,102,.25)" : "rgba(255,255,255,.15)",
            border: `1px solid ${torch ? "rgba(255,204,102,.5)" : "rgba(255,255,255,.2)"}`,
            color: torch ? "var(--amber, #ffcc66)" : "rgba(255,255,255,.8)",
            borderRadius: 8, padding: "8px 14px", cursor: "pointer",
            fontSize: 16, backdropFilter: "blur(4px)",
          }}
        >
          🔦
        </button>
      </div>

      <style>{`
        @keyframes scanline {
          0%   { transform: translateY(0); opacity: 0.8; }
          50%  { transform: translateY(calc(30vw * 0.43)); opacity: 1; }
          100% { transform: translateY(0); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
