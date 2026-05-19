import React from "react";
import { Link } from "react-router-dom";
import { Briefcase, Upload, ClipboardCheck, Users, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACTIONS = [
  { label: "New Case", icon: Briefcase, href: "/cases/new", variant: "default" },
  { label: "Upload Census", icon: Upload, href: "/census", variant: "outline" },
  { label: "Start Enrollment", icon: ClipboardCheck, href: "/enrollment", variant: "outline" },
  { label: "Add Employer", icon: Users, href: "/employers", variant: "outline" },
  { label: "Build Quote", icon: FileText, href: "/quotes", variant: "outline" },
  { label: "View Renewals", icon: RefreshCw, href: "/renewals", variant: "outline" },
];

export default function QuickActions() {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mr-1">Quick actions</span>
      {ACTIONS.map(a => (
        <Link key={a.href} to={a.href}>
          <Button size="sm" variant={a.variant} className="h-8 text-xs gap-1.5 font-medium">
            <a.icon className="w-3.5 h-3.5" />
            {a.label}
          </Button>
        </Link>
      ))}
    </div>
  );
}