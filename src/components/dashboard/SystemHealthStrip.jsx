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
  red:    { card: "border-border bg-card hover:border-red-200",    text: "text-red-600",    icon: "bg-red-50 text-red-500" },
  orange: { card: "border-border bg-card hover:border-orange-200", text: "text-orange-600", icon: "bg-orange-50 text-orange-500" },
  amber:  { card: "border-border bg-card hover:border-amber-200",  text: "text-amber-600",  icon: "bg-amber-50 text-amber-500" },
  green:  { card: "border-border bg-card hover:border-green-200",  text: "text-green-600",  icon: "bg-green-50 text-green-500" },
};

export default function SystemHealthStrip({ metrics }) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const value = metrics[item.key] ?? 0;
        const t = toneClass[item.tone];
        return (
          <Link key={item.key} to={item.href}>
            <Card className={`transition-all duration-200 hover:shadow-md cursor-pointer ${t.card}`}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{item.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${t.text}`}>{value}{item.key === "healthy" ? "/4" : ""}</p>
                </div>
                <div className={`p-2.5 rounded-xl flex-shrink-0 ${t.icon}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}