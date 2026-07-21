import { Sidebar } from "@/app/Sidebar";
import { ThemeProvider } from "@/app/ThemeContext";
import { UnitSystemProvider } from "@/app/(app)/nutrition/UnitSystemContext";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="app-shell">
        <Sidebar />
        <div className="main-area">
          <UnitSystemProvider>{children}</UnitSystemProvider>
        </div>
      </div>
    </ThemeProvider>
  );
}
