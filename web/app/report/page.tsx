import { createServerClient, userId } from "@/lib/supabase-server";
import ReportTabs from "./ReportTabs";

interface Analysis {
  id: string;
  created_at: string;
  report_date: string;
  analysis_html: string;
  planning_html: string;
}

function extractMain(html: string): string {
  const start = html.indexOf('<main');
  const end = html.lastIndexOf('</main>');
  if (start === -1 || end === -1) return html;
  const tagEnd = html.indexOf('>', start);
  return html.slice(tagEnd + 1, end);
}

export default async function ReportPage() {
  const sb = createServerClient();
  const uid = userId();

  const { data } = await sb
    .from("analyses")
    .select("*")
    .eq("user_id", uid)
    .order("report_date", { ascending: false })
    .limit(1);

  const report: Analysis | null = data?.[0] ?? null;

  if (!report) {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ color: "var(--muted)", marginBottom: 8 }}>No analysis report found.</p>
          <p style={{ color: "var(--dim)", fontSize: 13 }}>
            Run <code style={{ fontFamily: "var(--mono)" }}>--replan</code> to generate one.
          </p>
        </div>
      </div>
    );
  }

  const reportDate = new Date(report.report_date).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const html = report.analysis_html || report.planning_html || "";
  const mainContent = extractMain(html);

  return (
    <>
      <div className="page">
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Latest Report</h1>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>{reportDate}</p>
        </div>

        {/* Tab switcher if both reports exist */}
        {report.analysis_html && report.planning_html && (
          <ReportTabs analysis={report.analysis_html} planning={report.planning_html} />
        )}

        {/* Single report fallback */}
        {!(report.analysis_html && report.planning_html) && (
          <div className="report-content" dangerouslySetInnerHTML={{ __html: mainContent }} />
        )}
      </div>
    </>
  );
}
