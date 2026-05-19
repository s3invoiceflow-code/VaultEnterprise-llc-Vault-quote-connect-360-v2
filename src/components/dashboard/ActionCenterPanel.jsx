import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ActionCenterPanel({ actions }) {
  if (!actions || actions.length === 0) return null;

  return (
    <Card className="border-amber-200/60 bg-amber-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-amber-900">Requires Attention</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {actions.filter(a => a?.href).map((action) => (
          <Link key={action.label} to={action.href}>
            <div className="flex items-center justify-between rounded-lg border border-amber-200/80 bg-white px-3 py-2.5 hover:bg-amber-50 hover:border-amber-300 transition-colors cursor-pointer">
              <span className="text-sm font-medium text-foreground">{action.label}</span>
              <span className="text-xs font-semibold text-amber-700 ml-2 flex-shrink-0">{action.meta}</span>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}