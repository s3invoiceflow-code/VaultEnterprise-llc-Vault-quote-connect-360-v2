import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FileWarning, ShieldAlert, Workflow } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const ITEMS = [
  { key: "exceptions", label: "Open Exceptions", href: "/exceptions", icon: ShieldAlert, tone: "red" },
  { key: "censusIssues", label: "Census Issues", href: "/census", icon: FileWarning, tone: "orange" },
  { key: "stalledCases", label: "Stalled Cases", href: "/cases", icon: Workflow, tone: "amber" },
  { key: "healthy", label: "Health Checks Passing", href: "/", icon: CheckCircle2, tone: "green" },
];

const toneClass = {
  red: "border-red-200 bg-red-50 text-red-700",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  green: "border-green-200 bg-green-50 text-green-700",
};

export default function SystemHealthStrip({ metrics }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const value = metrics[item.key] ?? 0;
        return (
          <Link key={item.key} to={item.href}>
            <Card className={`border transition-colors hover:shadow-sm ${toneClass[item.tone]}`}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{item.label}</p>
                  <p className="text-2xl font-bold mt-1">{value}{item.key === "healthy" ? "/4" : ""}</p>
                </div>
                <div className="p-2 rounded-xl bg-white/60">
                  <Icon className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}