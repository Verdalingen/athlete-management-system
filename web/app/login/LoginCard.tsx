"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { signIn, signUp } from "./actions";

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908C16.658 14.017 17.64 11.71 17.64 9.2z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.706c-.18-.54-.282-1.117-.282-1.706s.102-1.166.282-1.706V4.962H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.038l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 6.294C4.672 4.167 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", padding: "10px 14px",
  background: "var(--surface2)", border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)", color: "var(--text)",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700,
  color: "var(--muted)", marginBottom: 6, letterSpacing: ".6px", textTransform: "uppercase",
};

export function LoginCard({
  initialMode = "signin",
  error,
  message,
}: {
  initialMode?: "signin" | "signup";
  error?: string;
  message?: string;
}) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [localError, setLocalError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  function switchMode(m: "signin" | "signup") {
    setMode(m);
    setLocalError(null);
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setLocalError(null);
    const supabase = getSupabase();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (oauthError) {
      setLocalError(oauthError.message);
      setGoogleLoading(false);
    }
    // on success the browser navigates away — no cleanup needed
  }

  const displayError = localError ?? error;

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(124,92,255,.12) 0%, transparent 70%)",
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>

        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 52, height: 52, borderRadius: 14,
            background: "rgba(124,92,255,.15)", border: "1px solid rgba(124,92,255,.3)",
            marginBottom: 14,
          }}>
            <i className="ti ti-device-watch-stats" style={{ fontSize: 26, color: "var(--accent)" }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-.3px", marginBottom: 4 }}>
            Garmin AI Coach
          </div>
          <div style={{ fontSize: 13, color: "var(--dim)" }}>
            Your personal training intelligence
          </div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: "28px 28px 24px" }}>

          {/* Tabs */}
          <div style={{
            display: "flex", borderBottom: "1px solid var(--border)",
            marginBottom: 24, gap: 4,
          }}>
            {(["signin", "signup"] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                style={{
                  flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 700,
                  background: "none", border: "none", cursor: "pointer",
                  textAlign: "center",
                  color: mode === m ? "var(--text)" : "var(--dim)",
                  borderBottom: mode === m ? "2px solid var(--accent)" : "2px solid transparent",
                  marginBottom: -1, transition: "color .15s, border-color .15s",
                }}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {/* Error */}
          {displayError && (
            <div className="alert alert-bad" style={{ marginBottom: 18, fontSize: 13 }}>
              {displayError}
            </div>
          )}

          {/* Success message */}
          {message && !displayError && (
            <div style={{
              marginBottom: 18, padding: "10px 14px", fontSize: 13,
              background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.25)",
              borderRadius: "var(--radius-sm)", color: "var(--green)", lineHeight: 1.5,
            }}>
              {message}
            </div>
          )}

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              gap: 10, padding: "10px 16px",
              background: "#fff", border: "1px solid #dadce0",
              borderRadius: "var(--radius-sm)", cursor: googleLoading ? "not-allowed" : "pointer",
              fontSize: 14, fontWeight: 600, color: "#3c4043",
              transition: "background .15s", opacity: googleLoading ? 0.7 : 1,
            }}
            onMouseOver={e => { if (!googleLoading) e.currentTarget.style.background = "#f8f8f8"; }}
            onMouseOut={e => (e.currentTarget.style.background = "#fff")}
          >
            <GoogleIcon />
            {googleLoading ? "Redirecting…" : "Continue with Google"}
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 12, color: "var(--dim)", letterSpacing: ".3px" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          {/* Email + password form */}
          <form action={mode === "signin" ? signIn : signUp} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={LABEL_STYLE}>Email</label>
              <input name="email" type="email" required autoComplete="email" style={INPUT_STYLE} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Password</label>
              <input
                name="password" type="password" required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                style={INPUT_STYLE}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              style={{ marginTop: 4, padding: "11px 0", width: "100%", fontSize: 14, fontWeight: 700, justifyContent: "center" }}
            >
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          {/* Toggle link */}
          <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--muted)" }}>
            {mode === "signin" ? (
              <>
                Don&apos;t have an account?{" "}
                <button type="button" onClick={() => switchMode("signup")}
                  style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontWeight: 600, fontSize: 13, padding: 0 }}>
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("signin")}
                  style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontWeight: 600, fontSize: 13, padding: 0 }}>
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer note */}
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "var(--dim)", lineHeight: 1.6 }}>
          By continuing, you agree to our terms of service and privacy policy.
        </div>
      </div>
    </div>
  );
}
