import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Loader2, ArrowRight, Check } from "lucide-react";

export default function Register() {
  const { register, user, loading } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    studio_name: "",
    studio_city: "",
    studio_phone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const nav = useNavigate();

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const next = () => {
    if (!form.full_name || !form.email || form.password.length < 6) {
      toast.error("Completa tutti i campi. Password minimo 6 caratteri.");
      return;
    }
    setStep(2);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.studio_name) {
      toast.error("Inserisci il nome dello studio");
      return;
    }
    setSubmitting(true);
    const res = await register(form);
    setSubmitting(false);
    if (res.ok) {
      toast.success("Studio creato. Benvenuto in DentalFlow!");
      nav("/dashboard");
    } else {
      toast.error(res.error || "Errore di registrazione");
    }
  };

  return (
    <div className="min-h-screen bg-df-bg flex items-center justify-center px-4 py-10">
      <div className="max-w-lg w-full">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-df-primary flex items-center justify-center text-white font-bold text-xl" style={{ fontFamily: "Manrope" }}>D</div>
          <div>
            <div className="font-bold tracking-tight text-lg" style={{ fontFamily: "Manrope" }}>DentalFlow AI</div>
            <div className="text-xs text-slate-500">Crea il tuo studio</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= s ? "bg-df-primary text-white" : "bg-slate-100 text-slate-400"}`}>
                  {step > s ? <Check size={14} /> : s}
                </div>
                <span className={`text-xs font-medium ${step >= s ? "text-slate-900" : "text-slate-400"}`}>
                  {s === 1 ? "Account" : "Studio"}
                </span>
                {s < 2 && <div className={`flex-1 h-px ${step > s ? "bg-df-primary" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Manrope" }}>
            {step === 1 ? "Inizia gratis" : "Dati dello studio"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {step === 1 ? "Un solo account per tutto il team." : "Queste informazioni compariranno nei documenti e nei reminder."}
          </p>

          {step === 1 ? (
            <div className="mt-6 space-y-4">
              <Field label="Nome e cognome" value={form.full_name} onChange={set("full_name")} testid="register-fullname" />
              <Field label="Email" type="email" value={form.email} onChange={set("email")} testid="register-email" />
              <Field label="Password" type="password" value={form.password} onChange={set("password")} testid="register-password" />
              <button
                data-testid="register-next-btn"
                onClick={next}
                className="w-full h-11 rounded-lg bg-df-primary text-white font-semibold text-sm hover:bg-[#1E3A8A] inline-flex items-center justify-center gap-2 transition-all"
              >
                Continua <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="Nome studio" value={form.studio_name} onChange={set("studio_name")} testid="register-studio-name" />
              <Field label="Città" value={form.studio_city} onChange={set("studio_city")} testid="register-studio-city" />
              <Field label="Telefono" value={form.studio_phone} onChange={set("studio_phone")} testid="register-studio-phone" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(1)} className="flex-1 h-11 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50">
                  Indietro
                </button>
                <button
                  data-testid="register-submit-btn"
                  disabled={submitting}
                  type="submit"
                  className="flex-1 h-11 rounded-lg bg-df-primary text-white font-semibold text-sm hover:bg-[#1E3A8A] inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  Crea studio
                </button>
              </div>
            </form>
          )}

          <div className="mt-5 text-sm text-slate-500 text-center">
            Hai già un account?{" "}
            <Link to="/login" data-testid="register-goto-login" className="text-df-primary font-semibold hover:underline">Accedi</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", testid }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      <input
        data-testid={testid}
        required type={type} value={value} onChange={onChange}
        className="w-full h-11 px-3.5 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-df-accent focus:border-transparent"
      />
    </div>
  );
}
