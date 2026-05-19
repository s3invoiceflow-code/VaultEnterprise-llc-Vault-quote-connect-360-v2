import React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function MetricCard({ label, value, icon: Icon, trend, trendLabel, className }) {
  return (
    <Card className={cn("group relative overflow-hidden rounded-2xl border-border/70 bg-card/95 p-4 md:p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md", className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-2 md:gap-4">
        <div className="space-y-1 md:space-y-1.5 min-w-0">
          <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground truncate">{label}</p>
          <p className="text-2xl md:text-3xl font-bold leading-none text-foreground">{value}</p>
          {trendLabel && (
            <p className={cn(
              "text-[11px] md:text-xs font-medium truncate",
              trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-muted-foreground"
            )}>
              {trend === "up" ? "↑" : trend === "down" ? "↓" : ""} {trendLabel}
            </p>
          )}
        </div>
        {Icon && (
          <div className="rounded-xl md:rounded-2xl border border-primary/10 bg-primary/5 p-2 md:p-3 text-primary shadow-sm transition-colors group-hover:bg-primary/10 flex-shrink-0">
            <Icon className="h-4 w-4 md:h-5 md:w-5" />
          </div>
        )}
      </div>
    </Card>
  );
}