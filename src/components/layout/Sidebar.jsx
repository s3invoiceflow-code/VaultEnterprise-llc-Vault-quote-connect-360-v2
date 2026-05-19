import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { navGroups, supportItems as bottomItems } from "@/components/layout/navigationConfig";

export default function Sidebar({ collapsed, onToggle }) {
  const { user } = useAuth();
  const location = useLocation();
  const { data: pendingTasks = [] } = useQuery({
    queryKey: ["tasks-pending"],
    queryFn: () => base44.entities.CaseTask.filter({ status: "pending" }, "-created_date", 50),
    refetchInterval: 60000,
  });

  const { data: openExceptions = [] } = useQuery({
    queryKey: ["exceptions-open-count"],
    queryFn: () => base44.entities.ExceptionItem.list("-created_date", 100),
    refetchInterval: 120000,
    select: (data) => data.filter(e => !["resolved","dismissed"].includes(e.status)),
  });

  const { data: activeEnrollments = [] } = useQuery({
    queryKey: ["enrollments-active-count"],
    queryFn: () => base44.entities.EnrollmentWindow.list("-created_date", 30),
    refetchInterval: 120000,
    select: (data) => data.filter(e => ["open","closing_soon"].includes(e.status)),
  });

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const canViewItem = (item) => {
    if (user?.role === 'platform_super_admin') return true;
    if (!item.roles) return true;
    return item.roles.includes(user?.role);
  };

  const NavItem = ({ item }) => {
    const active = isActive(item.path);
    const linkContent = (
      <Link
        to={item.path}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-primary/20"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        )}
      >
        <item.icon className={cn("w-5 h-5 flex-shrink-0", active && "drop-shadow-sm")} />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{item.label}</span>
            {item.description && !active && (
              <span className="block truncate text-[10px] text-sidebar-foreground/45">{item.description}</span>
            )}
          </div>
        )}
        {item.path === "/tasks" && pendingTasks.length > 0 && !collapsed && (
          <span className="ml-auto text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
            {pendingTasks.length > 99 ? "99+" : pendingTasks.length}
          </span>
        )}
        {item.path === "/tasks" && pendingTasks.length > 0 && collapsed && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-destructive rounded-full border-2 border-sidebar" />
        )}
        {item.path === "/exceptions" && openExceptions.length > 0 && !collapsed && (
          <span className="ml-auto text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
            {openExceptions.length > 99 ? "99+" : openExceptions.length}
          </span>
        )}
        {item.path === "/exceptions" && openExceptions.length > 0 && collapsed && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-sidebar" />
        )}
        {item.path === "/enrollment" && activeEnrollments.length > 0 && !collapsed && (
          <span className="ml-auto text-[10px] font-bold bg-blue-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
            {activeEnrollments.length}
          </span>
        )}
        {item.path === "/enrollment" && activeEnrollments.length > 0 && collapsed && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full border-2 border-sidebar" />
        )}
        {active && !collapsed && pendingTasks.length === 0 && (
          <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-sidebar-primary-foreground/80" />
        )}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  return (
    <TooltipProvider>
      <div
        className={cn(
          "fixed left-0 top-0 h-full bg-sidebar border-r border-sidebar-border flex flex-col z-40 transition-all duration-300 overflow-hidden",
          collapsed ? "w-[68px]" : "w-[240px]"
        )}
      >
        {/* Logo */}
        <div className={cn("flex items-center gap-2.5 px-4 h-16 border-b border-sidebar-border flex-shrink-0", collapsed && "justify-center")}>
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-lg">
            <svg width="24" height="24" viewBox="0 0 100 100" fill="none">
              {/* Circular arrows - bright colors */}
              <path d="M 50 20 A 30 30 0 0 1 80 50" stroke="#3b82f6" strokeWidth="10" strokeLinecap="round" fill="none" />
              <path d="M 80 50 A 30 30 0 0 1 50 80" stroke="#10b981" strokeWidth="10" strokeLinecap="round" fill="none" />
              <path d="M 50 80 A 30 30 0 0 1 20 50" stroke="#8b5cf6" strokeWidth="10" strokeLinecap="round" fill="none" />
              <path d="M 20 50 A 30 30 0 0 1 50 20" stroke="#f59e0b" strokeWidth="10" strokeLinecap="round" fill="none" />
              
              {/* Document icon */}
              <rect x="38" y="35" width="24" height="30" rx="2" stroke="#1e3a5f" strokeWidth="3" fill="white" />
              <line x1="43" y1="45" x2="57" y2="45" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" />
              <line x1="43" y1="53" x2="57" y2="53" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" />
              
              {/* Checkmark */}
              <circle cx="62" cy="65" r="10" stroke="#10b981" strokeWidth="3" fill="white" />
              <path d="M 58 65 L 61 68 L 66 62" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold text-sidebar-foreground leading-tight truncate">Connect Quote</h1>
              <p className="text-[10px] font-medium text-accent tracking-wider">360</p>
            </div>
          )}
        </div>

        {/* Main Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4 overscroll-contain">
          {navGroups.map((group, gi) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-sidebar-foreground/25 px-3 mb-2">{group.label}</p>
              )}
              {collapsed && gi > 0 && <div className="border-t border-sidebar-border mb-2 mx-1" />}
              <div className="space-y-0.5">
                {group.items.filter(canViewItem).map((item) => (
                  <NavItem key={item.path} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-4 space-y-1 border-t border-sidebar-border pt-3">
          {bottomItems.filter(canViewItem).map((item) => (
            <NavItem key={item.path} item={item} />
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="w-full justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent mt-2"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}