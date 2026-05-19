import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import ContextBar from "./ContextBar";
import AIAssistant from "@/components/ai/AIAssistant";
import HelpAIAssistant from "@/components/help/HelpAIAssistant";
import { cn } from "@/lib/utils";

export default function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile sidebar on route change
  React.useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      <div className={cn(
        "fixed left-0 top-0 h-full z-40 transition-transform duration-300",
        "lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      <div
        className={cn(
          "transition-all duration-300",
          "lg:ml-[240px]",
          sidebarCollapsed && "lg:ml-[68px]"
        )}
      >
        <TopBar onMobileMenuClick={() => setMobileOpen(true)} />
        <ContextBar />
        <main className="p-4 md:p-6 lg:p-8 min-w-0 max-w-full">
          <Outlet />
        </main>
      </div>

      {!location.pathname.match(/^\/cases\/[^/]+$/) && <AIAssistant />}
      {location.pathname.startsWith("/help") && <HelpAIAssistant />}
    </div>
  );
}