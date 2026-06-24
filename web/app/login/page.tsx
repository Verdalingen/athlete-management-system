import { signIn } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
    }}>
      <div className="card" style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".3px", marginBottom: 4 }}>
            Garmin AI Coach
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Sign in</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Enter your credentials to access your dashboard
          </div>
        </div>

        <ErrorMessage searchParams={searchParams} />

        <form action={signIn} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6, letterSpacing: ".3px" }}>
              EMAIL
            </label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              style={{
                width: "100%", padding: "10px 14px",
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", color: "var(--text)",
                fontSize: 14, outline: "none",
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6, letterSpacing: ".3px" }}>
              PASSWORD
            </label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              style={{
                width: "100%", padding: "10px 14px",
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", color: "var(--text)",
                fontSize: 14, outline: "none",
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              marginTop: 6,
              padding: "11px 0",
              background: "var(--accent)", border: "none",
              borderRadius: "var(--radius-sm)", color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
              letterSpacing: ".3px",
            }}
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}

async function ErrorMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <div className="alert alert-bad" style={{ marginBottom: 16 }}>
      {error}
    </div>
  );
}
