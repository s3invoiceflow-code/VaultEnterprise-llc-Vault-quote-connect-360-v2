import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DomainControlGrid({ domains }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Domain Overview</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {domains.map((domain) => {
          const Icon = domain.icon;
          return (
            <Card key={domain.key} className="hover:shadow-md transition-all duration-200 hover:border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/8 text-primary flex items-center justify-center flex-shrink-0 border border-primary/10">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-semibold">{domain.label}</CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{domain.description}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="grid grid-cols-4 gap-1.5">
                  {domain.stats.map((stat) => (
                    <div key={stat.label} className="rounded-md bg-muted/40 p-2 text-center">
                      <p className="text-base font-bold text-foreground leading-none">{stat.value}</p>
                      <p className="text-[9px] uppercase tracking-wide text-muted-foreground mt-1 leading-tight">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {domain.actions.map((action, i) => (
                    <Link key={action.label} to={action.href}>
                      <Badge variant={i === 0 ? "default" : "outline"} className="text-[11px] cursor-pointer hover:opacity-80 transition-opacity font-normal py-1">
                        {action.label}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}