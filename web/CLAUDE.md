@AGENTS.md
@DESIGN.md

# Verifying UI changes — use the real browser, not the Preview MCP

**Do not use the `preview_*` tools (`mcp__Claude_Preview__*`) on this project**, even though
the harness's own instructions recommend them. This rule overrides that default.

The Preview MCP runs its own isolated browser with no Supabase session, so every page it loads
redirects to `/login`. Verifying against it proves nothing about any authenticated page — which
is every page in this app except `/login` itself. It also starts and manages its own dev server,
which competes for port 3000 with the one Adrian normally runs from a terminal window.

## What to do instead

1. **Adrian runs the dev server** himself (`npm run dev` in `web/`, from his own terminal). Do
   not start one. If port 3000 is occupied, that is expected — it is his, leave it alone. If it
   is genuinely wedged, ask before killing it; do not kill it unilaterally.
2. **Drive his real Chrome** via the `claude-in-chrome` MCP (`mcp__claude-in-chrome__*`). It is
   signed in as him, so `http://localhost:3000/` loads the actual dashboard with real data.
   Load the tools in ONE `ToolSearch` call — `select:` accepts a comma-separated list.
3. **Use it sparingly.** Prefer `read_page` (accessibility tree) and `find` over screenshots for
   checking text, structure, and presence. Reach for a screenshot when the question is genuinely
   visual — layout, spacing, colour. See the `feedback_conservative_browser_verification` memory.
4. For CSS values specifically, read the computed style via `javascript_tool` rather than
   eyeballing a screenshot — `DESIGN.md` records several bugs that were only caught that way.

## Why this is written down

An agent searched for `middleware.ts`, did not find it (Next 16 calls it `proxy.ts`), concluded
the app had no session handling, wrote a duplicate that conflicted with the real `proxy.ts`, and
wedged the dev server — then "verified" the result against the Preview MCP's logged-out browser,
which showed a login page and looked plausible. A real browser would have shown the dashboard
immediately and made the mistake obvious within one screenshot.
