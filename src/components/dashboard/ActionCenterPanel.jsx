import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ActionCenterPanel({ actions }) {
  if (!actions || actions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Action Center</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {actions.filter(a => a?.href).map((action) => (
          <Link key={action.label} to={action.href}>
            <Button variant="outline" className="w-full justify-between">
              <span>{action.label}</span>
              <span className="text-xs text-muted-foreground">{action.meta}</span>
            </Button>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}