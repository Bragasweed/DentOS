import React, { useEffect, useState } from "react";
import { Search, Bell, LogOut, Menu } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { ROLE_LABELS } from "../lib/format";

export default function TopBar({ title }) {
  const { user, studio, logout } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/search", { params: { q } });
        setResults(data.patients || []);
        setOpen(true);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 h-16">
        <div className="lg:hidden flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-df-primary flex items-center justify-center text-white font-bold" style={{ fontFamily: "Manrope" }}>D</div>
          <span className="font-bold tracking-tight" style={{ fontFamily: "Manrope" }}>DentalFlow</span>
        </div>
        <h1 className="hidden lg:block text-xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Manrope" }} data-testid="topbar-title">{title}</h1>

        <div className="relative flex-1 max-w-xl ml-auto">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            data-testid="global-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Cerca paziente, telefono, email…"
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-df-accent focus:bg-white"
          />
          {open && results.length > 0 && (
            <div className="absolute mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto" data-testid="search-results">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { nav(`/pazienti/${p.id}`); setQ(""); setOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0"
                >
                  <div className="text-sm font-medium text-slate-900">{p.full_name}</div>
                  <div className="text-xs text-slate-500">{p.phone || p.email || "—"}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button data-testid="topbar-user-menu" className="w-9 h-9 rounded-full bg-df-primary text-white text-sm font-semibold hover:opacity-90 transition">
              {(user?.full_name || "?").slice(0, 1).toUpperCase()}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="font-semibold">{user?.full_name}</div>
              <div className="text-xs text-slate-500 font-normal">{ROLE_LABELS[user?.role]}</div>
              <div className="text-[11px] text-slate-400 mt-1">{studio?.name}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => nav("/impostazioni")}>Impostazioni studio</DropdownMenuItem>
            <DropdownMenuItem onClick={logout} data-testid="topbar-logout-btn" className="text-red-600">
              <LogOut size={14} className="mr-2" /> Esci
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <h1 className="lg:hidden px-4 pb-3 text-xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Manrope" }}>{title}</h1>
    </header>
  );
}
