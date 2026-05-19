import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Search, Briefcase, Building2, FileText, ClipboardCheck, X, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const RECENT_KEY = "qc360_recent_searches";
const MAX_RECENT = 5;

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const RESULT_ICONS = {
  case: Briefcase,
  employer: Building2,
  proposal: FileText,
  task: ClipboardCheck,
};

const RESULT_COLORS = {
  case: "text-primary",
  employer: "text-emerald-600",
  proposal: "text-purple-600",
  task: "text-amber-600",
};

export default function GlobalSearch({ className }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
  });
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) { setResults([]); return; }
    const search = async () => {
      setLoading(true);
      const q = debouncedQuery.toLowerCase();
      try {
        const [cases, employers, proposals, tasks] = await Promise.all([
          base44.entities.BenefitCase.list("-created_date", 100),
          base44.entities.EmployerGroup.list("-created_date", 100),
          base44.entities.Proposal.list("-created_date", 50),
          base44.entities.CaseTask.list("-created_date", 50),
        ]);

        const r = [];
        cases.filter(c => c.employer_name?.toLowerCase().includes(q) || c.case_number?.toLowerCase().includes(q)).slice(0, 4).forEach(c =>
          r.push({ type: "case", id: c.id, label: c.employer_name || "Unnamed", sub: c.case_number || `#${c.id.slice(-6)}`, badge: c.stage?.replace(/_/g, " "), path: `/cases/${c.id}` })
        );
        employers.filter(e => e.name?.toLowerCase().includes(q) || e.ein?.includes(q)).slice(0, 3).forEach(e =>
          r.push({ type: "employer", id: e.id, label: e.name, sub: e.city ? `${e.city}, ${e.state}` : e.industry, path: `/employers` })
        );
        proposals.filter(p => p.title?.toLowerCase().includes(q) || p.employer_name?.toLowerCase().includes(q)).slice(0, 3).forEach(p =>
          r.push({ type: "proposal", id: p.id, label: p.title, sub: p.employer_name, badge: p.status, path: `/proposals` })
        );
        tasks.filter(t => t.title?.toLowerCase().includes(q) || t.employer_name?.toLowerCase().includes(q)).slice(0, 2).forEach(t =>
          r.push({ type: "task", id: t.id, label: t.title, sub: t.employer_name, badge: t.status, path: `/tasks` })
        );
        setResults(r);
      } finally { setLoading(false); }
    };
    search();
  }, [debouncedQuery]);

  const handleSelect = (result) => {
    navigate(result.path);
    setOpen(false);
    setQuery("");
    const newRecent = [{ label: result.label, path: result.path, type: result.type }, ...recent.filter(r => r.path !== result.path)].slice(0, MAX_RECENT);
    setRecent(newRecent);
    localStorage.setItem(RECENT_KEY, JSON.stringify(newRecent));
  };

  const showDropdown = open && (results.length > 0 || (recent.length > 0 && !query) || loading);

  return (
    <div ref={containerRef} className={cn("relative min-w-0", className)}>
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search… (⌘K)"
          className="pl-9 pr-8 h-9 w-full text-sm bg-muted/50 border-0 focus:bg-background focus:border transition-all"
        />
        {query && (
          <button onClick={() => { setQuery(""); setResults([]); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full mt-2 left-0 w-[min(24rem,calc(100vw-2rem))] bg-popover border rounded-xl shadow-xl z-50 overflow-hidden">
          {loading && (
            <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <div className="w-3 h-3 border border-primary/30 border-t-primary rounded-full animate-spin" />
              Searching…
            </div>
          )}

          {!loading && !query && recent.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Recent
              </p>
              {recent.map((r, i) => {
                const Icon = RESULT_ICONS[r.type] || Search;
                return (
                  <button key={i} onClick={() => navigate(r.path)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60 text-left transition-colors">
                    <Icon className={cn("w-4 h-4 flex-shrink-0", RESULT_COLORS[r.type])} />
                    <span className="text-sm truncate">{r.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto capitalize">{r.type}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="pb-2">
              {["case", "employer", "proposal", "task"].map(type => {
                const group = results.filter(r => r.type === type);
                if (!group.length) return null;
                const Icon = RESULT_ICONS[type];
                return (
                  <div key={type}>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest capitalize">{type}s</p>
                    {group.map(r => (
                      <button key={r.id} onClick={() => handleSelect(r)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60 text-left transition-colors">
                        <Icon className={cn("w-4 h-4 flex-shrink-0", RESULT_COLORS[type])} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{r.label}</p>
                          {r.sub && <p className="text-xs text-muted-foreground truncate">{r.sub}</p>}
                        </div>
                        {r.badge && <Badge variant="outline" className="text-[10px] flex-shrink-0 capitalize">{r.badge.replace(/_/g, " ")}</Badge>}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No results for "{query}"</div>
          )}
        </div>
      )}
    </div>
  );
}