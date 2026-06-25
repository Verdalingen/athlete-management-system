"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

const NAV = [
  { href: "/",        label: "Today",   icon: "ti-home" },
  { href: "/week",    label: "Week",    icon: "ti-calendar" },
  { href: "/plan",    label: "Plan",    icon: "ti-route" },
  { href: "/report",  label: "Report",  icon: "ti-file-analytics" },
  { href: "/profile", label: "Profile", icon: "ti-user" },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }
  return (
    <>
      {NAV.map(({ href, label, icon }) => (
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

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restore collapse preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sb-collapsed");
      if (saved !== null) setCollapsed(JSON.parse(saved));
    } catch {}
  }, []);

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (pathname.startsWith("/login")) return null;

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("sb-collapsed", JSON.stringify(next)); } catch {}
  }

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
          <NavItems />
        </nav>

      </aside>

      {/* ── Mobile: top bar ── */}
      <header className="mobile-header">
        <button
          className="mobile-hamburger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <i className="ti ti-menu-2" aria-hidden="true" />
        </button>
        <span className="sb-brand-name" style={{ fontSize: 14 }}>AI Coach</span>
        <div style={{ width: 36 }} />
      </header>

      {/* ── Mobile overlay ── */}
      <div
        className={`mobile-overlay${mobileOpen ? " mobile-overlay-open" : ""}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* ── Mobile drawer ── */}
      <div className={`mobile-drawer${mobileOpen ? " mobile-drawer-open" : ""}`}>
        <div className="sb-brand" style={{ justifyContent: "space-between" }}>
          <div className="sb-brand-text">
            <span className="sb-brand-name">AI Coach</span>
            <span className="sb-brand-sub">Garmin Training</span>
          </div>
          <button
            className="sb-collapse-btn"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        <nav className="sb-nav">
          <NavItems onNavigate={() => setMobileOpen(false)} />
        </nav>

      </div>
    </>
  );
}
