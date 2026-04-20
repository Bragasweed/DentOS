import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, FileText, Wallet, Sparkles } from "lucide-react";

const items = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard, testid: "bottomnav-dashboard" },
  { to: "/recupero", label: "Recupero", icon: Sparkles, testid: "bottomnav-followup" },
  { to: "/pazienti", label: "Pazienti", icon: Users, testid: "bottomnav-patients" },
  { to: "/preventivi", label: "Prev.", icon: FileText, testid: "bottomnav-estimates" },
  { to: "/pagamenti", label: "Pagam.", icon: Wallet, testid: "bottomnav-payments" },
];

export default function BottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]" data-testid="mobile-bottom-nav">
      <div className="grid grid-cols-5">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            data-testid={i.testid}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 gap-0.5 text-[11px] font-medium transition-colors ${isActive ? "text-df-primary" : "text-slate-500"}`
            }
          >
            {({ isActive }) => (
              <>
                <i.icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
                <span>{i.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
