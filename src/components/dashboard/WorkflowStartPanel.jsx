import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { primaryWorkflowItems } from "@/components/layout/navigationConfig";

export default function WorkflowStartPanel() {
  const quickPath = primaryWorkflowItems.filter((item) => item.path !== "/").slice(0, 6);

  return (
    <div className="grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      {quickPath.map((item, index) => (
        <Link
          key={item.path}
          to={item.path}
          className="rounded-xl border border-border bg-card p-3.5 transition-all duration-200 hover:bg-muted/40 hover:border-primary/20 hover:shadow-sm"
        >
          <div className="flex flex-col gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/8 text-primary text-xs font-bold border border-primary/10">
              {index + 1}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">{item.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{item.description}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}