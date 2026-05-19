import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function CaseListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm">
          <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <Skeleton className="h-4 w-full max-w-[12rem]" />
            <Skeleton className="h-3 w-full max-w-[18rem]" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={`metric-${i}`} className="rounded-2xl border border-border/70 bg-card/95 p-5 shadow-sm">
            <Skeleton className="h-3 w-24 mb-3" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3 rounded-2xl border border-border/70 bg-card/95 p-5 shadow-sm lg:col-span-2">
          <Skeleton className="h-5 w-40 mb-2" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={`table-${i}`} className="h-12 w-full rounded-lg" />
          ))}
        </div>

        <div className="space-y-3 rounded-2xl border border-border/70 bg-card/95 p-5 shadow-sm">
          <Skeleton className="h-5 w-32 mb-2" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={`side-${i}`} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}