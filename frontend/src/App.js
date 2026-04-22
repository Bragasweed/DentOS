import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "sonner";

import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Patients from "@/pages/Patients";
import PatientDetail from "@/pages/PatientDetail";
import Estimates from "@/pages/Estimates";
import Appointments from "@/pages/Appointments";
import Payments from "@/pages/Payments";
import FollowupCenter from "@/pages/FollowupCenter";
import RevenueDashboard from "@/pages/RevenueDashboard";
import RevenueRadar from "@/pages/RevenueRadar";
import RevenueHealth from "@/pages/RevenueHealth";
import Automations from "@/pages/Automations";
import Settings from "@/pages/Settings";
import Layout from "@/components/Layout";
import Landing from "@/pages/Landing";
import Pricing from "@/pages/Pricing";
import DemoScript from "@/pages/DemoScript";

function Guarded({ title }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400" data-testid="auth-loading">
        <div className="animate-pulse">Caricamento…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Layout title={title}><Outlet /></Layout>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth" element={<Navigate to="/login" replace />} />
          <Route path="/register" element={<Navigate to="/login" replace />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/demo" element={<DemoScript />} />

          <Route element={<Guarded title="Dashboard" />}>
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>
          <Route element={<Guarded title="Pazienti" />}>
            <Route path="/pazienti" element={<Patients />} />
            <Route path="/pazienti/:id" element={<PatientDetail />} />
          </Route>
          <Route element={<Guarded title="Preventivi" />}>
            <Route path="/preventivi" element={<Estimates />} />
          </Route>
          <Route element={<Guarded title="Centro recupero" />}>
            <Route path="/recupero" element={<FollowupCenter />} />
          </Route>
          <Route element={<Guarded title="Revenue" />}>
            <Route path="/revenue" element={<RevenueDashboard />} />
            <Route path="/revenue/health" element={<RevenueHealth />} />
            <Route path="/revenue/radar" element={<RevenueRadar />} />
          </Route>
          <Route element={<Guarded title="Automazioni" />}>
            <Route path="/automations" element={<Automations />} />
          </Route>
          <Route element={<Guarded title="Agenda" />}>
            <Route path="/appuntamenti" element={<Appointments />} />
          </Route>
          <Route element={<Guarded title="Pagamenti" />}>
            <Route path="/pagamenti" element={<Payments />} />
          </Route>
          <Route element={<Guarded title="Impostazioni" />}>
            <Route path="/impostazioni" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
