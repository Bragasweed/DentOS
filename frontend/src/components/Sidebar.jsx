import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, FileText, Calendar, Wallet, Settings, LogOut, Sparkles, Target, Radar, Cog } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ROLE_LABELS } from "../lib/format";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "sidebar-dashboard-link" },
  { to: "/recupero", label: "Centro recupero", icon: Sparkles, testid: "sidebar-followup-link" },
  { to: "/revenue", label: "Revenue", icon: Target, testid: "sidebar-revenue-link" },
  { to: "/revenue/radar", label: "Revenue Radar", icon: Radar, testid: "sidebar-radar-link" },
  { to: "/automations", label: "Automazioni", icon: Cog, testid: "sidebar-automations-link" },
  { to: "/pazienti", label: "Pazienti", icon: Users, testid: "sidebar-patients-link" },
  { to: "/preventivi", label: "Preventivi", icon: FileText, testid: "sidebar-estimates-link" },
  { to: "/appuntamenti", label: "Appuntamenti", icon: Calendar, testid: "sidebar-appointments-link" },
  { to: "/pagamenti", label: "Pagamenti", icon: Wallet, testid: "sidebar-payments-link" },
  { to: "/impostazioni", label: "Impostazioni", icon: Settings, testid: "sidebar-settings-link" },
];

export default function Sidebar() {
  const { user, studio, logout } = useAuth();
  const loc = useLocation();

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-slate-200 bg-white h-screen sticky top-0" data-testid="desktop-sidebar">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-df-primary flex items-center justify-center text-white font-bold text-lg" style={{ fontFamily: "Manrope" }}>D</div>
          <div>
            <div className="font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Manrope" }}>HuDent AI</div>
            <div className="text-xs text-slate-500">Studio operativo</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Area studio</div>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            data-testid={l.testid}
            className={({ isActive }) => `df-nav-link ${isActive || loc.pathname.startsWith(l.to) && l.to !== "/dashboard" ? "active" : ""}`}
          >
            <l.icon size={18} strokeWidth={2} />
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-100">
        <div className="px-3 py-2 rounded-lg bg-slate-50">
          <div className="text-sm font-semibold text-slate-900 truncate" data-testid="sidebar-user-name">{user?.full_name}</div>
          <div className="text-xs text-slate-500 truncate">{ROLE_LABELS[user?.role] || user?.role}</div>
          <div className="text-[11px] text-slate-400 truncate mt-0.5">{studio?.name}</div>
        </div>
        <button
          data-testid="sidebar-logout-btn"
          onClick={logout}
          className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all"
        >
          <LogOut size={16} /> Esci
        </button>
      </div>
    </aside>
  );
}
