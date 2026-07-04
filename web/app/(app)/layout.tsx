import { Sidebar } from "@/app/Sidebar";
import { UnitSystemProvider } from "@/app/(app)/nutrition/UnitSystemContext";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <UnitSystemProvider>{children}</UnitSystemProvider>
      </div>
    </div>
  );
}
