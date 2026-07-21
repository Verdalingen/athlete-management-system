/** Stock-ticker-style delta pill (arrow + colored value on a tinted rounded
 * background) — the actual "stock-like KPI change" look from the Tripper
 * reference. Colors purely by direction (up = green, down = red), matching
 * that reference exactly rather than editorializing "is this metric's
 * increase good or bad" — `positiveIsGood` is there for the rare caller that
 * genuinely needs the inverse, but every current usage wants plain direction
 * coloring. */
export function DeltaBadge({
  value, format, positiveIsGood = true, unit, neutralThreshold = 0, size = 11,
}: {
  value: number | null | undefined;
  format?: (v: number) => string;
  positiveIsGood?: boolean;
  unit?: string;
  neutralThreshold?: number;
  size?: number;
}) {
  if (value == null) return null;
  const isFlat = Math.abs(value) <= neutralThreshold;
  const isPositive = value > 0;
  const isGood = positiveIsGood ? isPositive : !isPositive;
  const color = isFlat ? "var(--dim)" : isGood ? "var(--green)" : "var(--red)";
  const rgb = isFlat ? null : isGood ? "var(--green-rgb)" : "var(--red-rgb)";
  const icon = isFlat ? "ti-minus" : isPositive ? "ti-trending-up" : "ti-trending-down";
  const display = format ? format(Math.abs(value)) : Math.abs(value).toFixed(1);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.3),
      padding: `${Math.round(size * 0.3)}px ${Math.round(size * 0.75)}px`,
      borderRadius: 999,
      background: rgb ? `rgba(${rgb}, .14)` : "var(--overlay-3)",
      color, fontSize: size, fontWeight: 700, fontFamily: "var(--font-mono)", lineHeight: 1,
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: size + 3 }} aria-hidden="true" />
      {display}{unit ? ` ${unit}` : ""}
    </span>
  );
}
