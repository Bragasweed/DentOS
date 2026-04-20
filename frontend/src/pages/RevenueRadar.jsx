import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { Radar as RadarIcon, AlertTriangle, Mail, Send, Sparkles, ArrowUpRight, Target, Flame, MessageSquare, Clock } from "lucide-react";
import { fmtEUR, fmtDate } from "../lib/format";
import { toast } from "sonner";

const ACTION_LABEL = {
  call_now: "Chiama subito",
  send_wa_a: "WhatsApp amichevole",
  send_wa_b: "WhatsApp diretto",
  send_email: "Email formale",
  archive_or_manual: "Nota manuale",
  offer_financing: "Proponi finanziamento",
};
const ACTION_ICON = { call_now: Flame, send_wa_a: MessageSquare, send_wa_b: MessageSquare, send_email: Mail, offer_financing: Sparkles, archive_or_manual: AlertTriangle };

export default function RevenueRadar() {
  const [items, setItems] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [r, rep] = await Promise.all([api.get("/revenue/radar"), api.get("/revenue/radar/report")]);
      setItems(r.data);
      setReport(rep.data);
    } catch { toast.error("Errore radar"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="py-14 text-center text-slate-400">Caricamento…</div>;

  const top5 = items.slice(0, 5);

  return (
    <div className="space-y-6" data-testid="radar-page">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-red-600 to-orange-600 text-white p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-yellow-300/20 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-semibold text-orange-100">
              <RadarIcon size={14} /> Revenue Lost Radar
            </div>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: "Manrope" }}>
              Top 5 preventivi da salvare questa settimana
            </h2>
            <p className="mt-1 text-sm text-white/90">
              {fmtEUR(report?.total_at_risk || 0)} a rischio · potenziale recupero <b>{fmtEUR(report?.recoverable_estimate || 0)}</b>
            </p>
          </div>
          <Link to="/recupero" data-testid="radar-cta-followup" className="inline-flex items-center gap-2 px-4 h-11 rounded-lg bg-white text-red-700 font-semibold text-sm hover:bg-slate-100">
            <Send size={14} /> Apri Centro recupero
          </Link>
        </div>
      </div>

      {/* Email preview */}
      {report && (
        <div className="bg-white rounded-xl border-2 border-dashed border-slate-200 p-5" data-testid="radar-email-preview">
          <div className="flex items-center gap-2 mb-3">
            <Mail size={14} className="text-slate-500" />
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Anteprima report lunedì mattina</span>
          </div>
          <div className="max-w-2xl bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{report.title}</h3>
            <p className="mt-2 text-sm text-slate-700 leading-relaxed">{report.summary}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white border border-slate-200 rounded-md p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">A rischio</div>
                <div className="text-lg font-bold text-red-600" style={{ fontFamily: "Manrope" }}>{fmtEUR(report.total_at_risk)}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-md p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Recuperabile</div>
                <div className="text-lg font-bold text-emerald-600" style={{ fontFamily: "Manrope" }}>{fmtEUR(report.recoverable_estimate)}</div>
              </div>
            </div>
            <Link to="/recupero" className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-df-primary text-white text-sm font-semibold hover:bg-[#1E3A8A]">
              <Target size={14} /> {report.cta_label} <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* Top 5 prominent */}
      <div className="bg-white rounded-xl border border-slate-200" data-testid="radar-top5">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>🎯 Top 5 priorità settimanali</h3>
        </div>
        <ul className="divide-y divide-slate-100">
          {top5.map((it) => <RadarRow key={it.estimate_id} it={it} featured />)}
        </ul>
      </div>

      {/* Rest */}
      {items.length > 5 && (
        <div className="bg-white rounded-xl border border-slate-200" data-testid="radar-rest">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Altri preventivi monitorati ({items.length - 5})</h3>
          </div>
          <ul className="divide-y divide-slate-100">
            {items.slice(5).map((it) => <RadarRow key={it.estimate_id} it={it} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

function RadarRow({ it, featured = false }) {
  const Icon = ACTION_ICON[it.suggested_action] || Sparkles;
  return (
    <li data-testid={`radar-row-${it.estimate_id}`} className="px-5 py-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center hover:bg-slate-50">
      <div className="md:col-span-3">
        <Link to={`/pazienti/${it.patient_id}`} className="text-sm font-semibold text-slate-900 hover:underline block truncate">{it.patient_name}</Link>
        <div className="text-xs text-slate-500 truncate">{it.estimate_title}</div>
        {it.rejection_reason && <div className="text-[10px] text-red-600 mt-0.5 truncate">Rifiutato: {it.rejection_reason}</div>}
      </div>
      <div className="md:col-span-2">
        <div className={`text-base font-bold ${featured ? "text-df-primary" : "text-slate-900"}`} style={{ fontFamily: "Manrope" }}>{fmtEUR(it.estimate_amount)}</div>
        <div className="text-[11px] text-slate-500 capitalize">{it.estimate_status.replace("_", " ")}</div>
      </div>
      <div className="md:col-span-2 text-xs text-slate-600">
        <div className="inline-flex items-center gap-1"><Clock size={12} /> {it.days_since != null ? `${it.days_since}gg` : "—"}</div>
        <div className="text-[10px] text-slate-400">{it.last_reminder_at ? `Ultimo reminder ${fmtDate(it.last_reminder_at)}` : "Mai contattato"}</div>
      </div>
      <div className="md:col-span-2">
        <div className="flex items-center gap-2">
          <div className="relative w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <span className="text-sm font-bold text-red-600" style={{ fontFamily: "Manrope" }}>{it.lost_risk_score}</span>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Recovery</div>
            <div className="text-sm font-bold text-emerald-600">{it.recovery_probability}%</div>
          </div>
        </div>
      </div>
      <div className="md:col-span-3 md:text-right flex md:justify-end gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded-full" data-testid={`radar-action-${it.estimate_id}`}>
          <Icon size={12} /> {ACTION_LABEL[it.suggested_action] || it.suggested_action}
        </span>
      </div>
    </li>
  );
}
