import React from "react";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Stethoscope, CalendarCheck2 } from "lucide-react";

const navItems = [
  { to: "/landing", label: "Landing" },
  { to: "/pricing", label: "Prezzi" },
  { to: "/demo", label: "Demo" },
];

export default function MarketingShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <NavLink to="/landing" className="flex items-center gap-2" data-testid="marketing-logo-link">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-df-primary text-white">
              <Stethoscope size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">DentalFlow AI</p>
              <p className="text-xs text-slate-500">Commercial Suite</p>
            </div>
          </NavLink>

          <nav className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-sm font-medium transition ${isActive ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-100"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="hidden sm:inline-flex" data-testid="marketing-watch-demo-top">
              <NavLink to="/demo">Guarda demo</NavLink>
            </Button>
            <Button asChild className="bg-df-primary hover:bg-blue-900" data-testid="marketing-book-demo-top">
              <NavLink to="/pricing"><CalendarCheck2 className="mr-2 h-4 w-4" />Prenota demo</NavLink>
            </Button>
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
