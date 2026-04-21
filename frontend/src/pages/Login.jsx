import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function Login() {
  const { login, user, loading } = useAuth();
  const [email, setEmail] = useState("admin@dentalflow.it");
  const [password, setPassword] = useState("DentalFlow2026!");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await login(email.trim(), password);
    setSubmitting(false);
    if (res.ok) {
      toast.success("Accesso effettuato");
      nav("/dashboard");
    } else {
      toast.error(res.error || "Errore di accesso");
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-df-bg">
      <div
        className="hidden lg:flex relative items-end p-12 text-white"
        style={{
          backgroundImage: "linear-gradient(180deg, rgba(12,49,91,0.15), rgba(12,49,91,0.85)), url(https://images.pexels.com/photos/4269276/pexels-photo-4269276.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="max-w-md">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] font-semibold opacity-90">
            <span className="w-2 h-2 rounded-full bg-sky-400" /> Operational dashboard
          </div>
          <h2 className="mt-4 text-4xl font-bold tracking-tight" style={{ fontFamily: "Manrope" }}>
            Lo studio dentistico,<br />ogni giorno sotto controllo.
          </h2>
          <p className="mt-4 text-base text-white/80 leading-relaxed">
            Recupera preventivi persi, riduci i no-show, monitora i pagamenti. Una sola dashboard per la segreteria, il titolare e il team clinico.
          </p>
        </div>
      </div>

      <div className="flex flex-col justify-center px-6 sm:px-10 lg:px-16 py-12">
        <div className="max-w-md w-full mx-auto">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-10 h-10 rounded-xl bg-df-primary flex items-center justify-center text-white font-bold text-xl" style={{ fontFamily: "Manrope" }}>D</div>
            <div>
              <div className="font-bold tracking-tight text-lg" style={{ fontFamily: "Manrope" }}>HuDent AI</div>
              <div className="text-xs text-slate-500">Studio operativo · Italia</div>
            </div>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Manrope" }}>Bentornato</h1>
          <p className="text-sm text-slate-500 mt-1">Accesso riservato agli studi già attivi su DentalFlow AI.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
              <input
                data-testid="login-email-input"
                type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 px-3.5 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-df-accent focus:border-transparent"
                placeholder="nome@studio.it"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password</label>
              <div className="relative">
                <input
                  data-testid="login-password-input"
                  type={show ? "text" : "password"} required autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 px-3.5 pr-10 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-df-accent focus:border-transparent"
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              data-testid="login-submit-btn"
              type="submit" disabled={submitting}
              className="w-full h-11 rounded-lg bg-df-primary text-white font-semibold text-sm hover:bg-[#1E3A8A] transition-all inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              Accedi alla piattaforma
            </button>
          </form>

          <div className="mt-6 text-sm text-slate-500 text-center">
            L’accesso è riservato ai clienti attivi. <Link to="/demo" className="text-df-primary font-semibold hover:underline">Richiedi attivazione</Link>
          </div>

          <div className="mt-8 p-4 rounded-lg bg-sky-50 border border-sky-100 text-xs text-sky-900">
            <div className="font-semibold mb-1">Demo studio precompilato</div>
            Email: <code>admin@dentalflow.it</code><br />
            Password: <code>DentalFlow2026!</code>
          </div>
        </div>
      </div>
    </div>
  );
}
