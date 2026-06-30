import { Sidebar } from "@/app/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        {children}
      </div>
    </div>
  );
}
