import React from "react";
import { useLocation, Link } from "react-router-dom";
import { primaryWorkflowItems, referenceItems, portalItems, supportItems } from "@/components/layout/navigationConfig";

const allItems = [...primaryWorkflowItems, ...referenceItems, ...portalItems, ...supportItems];

export default function ContextBar() {
  const location = useLocation();
  const current = allItems.find((item) => item.path === "/"
    ? location.pathname === "/"
    : location.pathname.startsWith(item.path));

  if (!current) return null;

  return (
    <div className="border-b border-border bg-background/95 px-4 py-3 md:px-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current workspace</p>
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-foreground md:text-base truncate">{current.label}</h2>
            {current.description && <span className="text-xs text-muted-foreground hidden sm:inline truncate">• {current.description}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/" className="text-xs text-primary hover:underline">Dashboard</Link>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="text-xs text-muted-foreground">{current.label}</span>
        </div>
      </div>
    </div>
  );
}