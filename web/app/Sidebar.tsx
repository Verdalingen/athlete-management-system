"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

const NAV = [
  { href: "/",           label: "Today",     icon: "ti-home" },
  { href: "/plan",       label: "Plan",      icon: "ti-route" },
  { href: "/nutrition",  label: "Nutrition", icon: "ti-salad" },
  { href: "/report",     label: "Progress",  icon: "ti-trending-up" },
];

const BOTTOM_ITEM = { href: "/profile", label: "Settings", icon: "ti-settings" };

function NavItems({ items, onNavigate }: { items: typeof NAV; onNavigate?: () => void }) {
  const pathname = usePathname();
  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }
  return (
    <>
      {items.map(({ href, label, icon }) => (
        <Link
          key={href}
          href={href}
          className={`sb-item${isActive(href) ? " sb-active" : ""}`}
          onClick={onNavigate}
          title={label}
        >
          <i className={`ti ${icon}`} aria-hidden="true" />
          <span className="sb-label">{label}</span>
        </Link>
      ))}
    </>
  );
}

function BottomTabBar() {
  const pathname = usePathname();
  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }
  return (
    <nav className="tab-bar" aria-label="Primary">
      {NAV.map(({ href, label, icon }) => (
        <Link
          key={href}
          href={href}
          className={`tab-bar-item${isActive(href) ? " tab-bar-active" : ""}`}
        >
          <i className={`ti ${icon}`} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Restore collapse preference from localStorage. The blocking script in
  // layout.tsx already snapshotted the same preference onto
  // <html class="sb-collapsed-init"> so the first paint renders correctly
  // (see the CSS comment in globals.css) — drop that snapshot class here,
  // once this component's own `collapsed` state is about to take over, so
  // later toggles get their normal transition instead of colliding with the
  // pre-hydration "no transition" override.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sb-collapsed");
      if (saved !== null) setCollapsed(JSON.parse(saved));
    } catch {}
    document.documentElement.classList.remove("sb-collapsed-init");
  }, []);

  if (pathname.startsWith("/login")) return null;

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("sb-collapsed", JSON.stringify(next)); } catch {}
  }

  const onSettings = BOTTOM_ITEM.href === "/" ? pathname === "/" : pathname.startsWith(BOTTOM_ITEM.href);

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className={`sidebar${collapsed ? " sb-collapsed" : ""}`}>
        <div className="sb-brand">
          <div className="sb-brand-text">
            <span className="sb-brand-name">AI Coach</span>
            <span className="sb-brand-sub">Garmin Training</span>
          </div>
          <button
            className="sb-collapse-btn"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <i className={`ti ${collapsed ? "ti-arrow-bar-right" : "ti-arrow-bar-left"}`} aria-hidden="true" />
          </button>
        </div>

        <nav className="sb-nav">
          <NavItems items={NAV} />
        </nav>

        <div className="sb-bottom">
          <NavItems items={[BOTTOM_ITEM]} />
        </div>
      </aside>

      {/* ── Mobile: slim top bar ── */}
      <header className="mobile-header">
        <span className="sb-brand-name" style={{ fontSize: 14 }}>AI Coach</span>
        <Link
          href={BOTTOM_ITEM.href}
          className={`mobile-header-icon-btn${onSettings ? " mobile-header-icon-active" : ""}`}
          aria-label={BOTTOM_ITEM.label}
          title={BOTTOM_ITEM.label}
        >
          <i className={`ti ${BOTTOM_ITEM.icon}`} aria-hidden="true" />
        </Link>
      </header>

      {/* ── Mobile: fixed bottom tab bar ── */}
      <BottomTabBar />
    </>
  );
}
