import React, { useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import GlobalSearch from "@/components/shared/GlobalSearch";
import NotificationBell from "@/components/shared/NotificationBell";

export default function TopBar({ onMobileMenuClick }) {
  const { user } = useAuth();
  const initials = user?.full_name
    ? user.full_name.split(" ").map(n => n[0]).join("").toUpperCase()
    : "U";

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-3 md:px-6 sticky top-0 z-30 min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
        {/* Mobile menu button */}
        <button
          onClick={onMobileMenuClick}
          className="lg:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <GlobalSearch className="flex-1 max-w-xs sm:max-w-sm md:max-w-md" />
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 h-9 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:inline">{user?.full_name || "User"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem className="text-xs text-muted-foreground">{user?.email}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/settings">Settings</Link></DropdownMenuItem>
            <DropdownMenuItem onClick={() => base44.auth.logout()}>Sign Out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}