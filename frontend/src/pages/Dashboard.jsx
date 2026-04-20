import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { fmtEUR, fmtTime, fmtDate, APPT_STATUS } from "../lib/format";
import { StatusPill } from "../components/StatusPill";
import { Phone, Users, FileText, Wallet, AlertTriangle, Calendar, CheckCircle2, TrendingUp, Activity, ListChecks, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const KpiCard = ({ icon: Icon, label, value, hint, tone = "slate", testid }) => {
  const toneMap = {
    slate: "bg-slate-50 text-slate-600",
    primary: "bg-[#0C315B]/5 text-[#0C315B]",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    accent: "bg-sky-50 text-sky-700",
  };
  return (
    <div data-testid={testid} className="bg-white rounded-xl border border-slate-200 p-5 df-card-hover">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${toneMap[tone]}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Manrope" }}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  const load = async () => {
    try {
      const { data } = await api.get("/dashboard");
      setData(data);
    } catch (e) {
      toast.error("Impossibile caricare la dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="py-10 text-center text-slate-400" data-testid="dashboard-loading">Caricamento…</div>;
  if (!data) return null;

  const { kpis, appts_today, followups, overdue, tasks_today } = data;

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      {/* Welcome banner - cose da fare oggi */}
      <div className="rounded-2xl bg-df-primary text-white p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-semibold text-sky-200">
              <Activity size={14} /> Cose da fare oggi
            </div>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: "Manrope" }}>
              {appts_today.length} appuntamenti · {followups.length} follow-up · {overdue.length} solleciti
            </h2>
            <p className="mt-1 text-sm text-white/80">Le priorità operative dello studio in tempo reale.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/recupero" data-testid="dash-cta-followup" className="inline-flex items-center gap-2 px-4 h-11 rounded-lg bg-white text-df-primary font-semibold text-sm hover:bg-slate-100 transition">
              <Activity size={16} /> Centro recupero
            </Link>
            <Link to="/preventivi" data-testid="dash-cta-new-estimate" className="inline-flex items-center gap-2 px-4 h-11 rounded-lg bg-sky-500 text-white font-semibold text-sm hover:bg-sky-600 transition">
              <FileText size={16} /> Nuovo preventivo
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <KpiCard icon={FileText} label="Preventivi aperti" value={kpis.open_estimates_count} hint={fmtEUR(kpis.open_estimates_value) + " in trattativa"} tone="primary" testid="kpi-open-estimates" />
        <KpiCard icon={TrendingUp} label="Accettato" value={fmtEUR(kpis.accepted_estimates_value)} hint="Ricavi confermati" tone="success" testid="kpi-accepted-value" />
        <KpiCard icon={Calendar} label="Appuntamenti oggi" value={kpis.appts_today_count} hint={`No-show ${kpis.no_show_rate}% mese`} tone="accent" testid="kpi-appts-today" />
        <KpiCard icon={Wallet} label="Crediti da incassare" value={fmtEUR(kpis.overdue_total)} hint={`${kpis.overdue_count} rate scadute`} tone="danger" testid="kpi-overdue" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Today's appointments */}
        <Panel title="Agenda di oggi" to="/appuntamenti" count={appts_today.length} testid="panel-appts-today">
          {appts_today.length === 0 ? (
            <EmptyRow icon={Calendar} text="Nessun appuntamento in agenda oggi." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {appts_today.map((a) => (
                <li key={a.id} data-testid={`appt-row-${a.id}`} className="py-3 flex items-center gap-3">
                  <div className="w-14 text-center">
                    <div className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{fmtTime(a.scheduled_at)}</div>
                    <div className="text-[11px] text-slate-400">{a.duration_min}′</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => nav(`/pazienti/${a.patient_id}`)} className="text-sm font-medium text-slate-900 hover:underline truncate">
                        {a.patient_name}
                      </button>
                      {a.no_show_risk && (
                        <span className="inline-flex items-center gap-1 status-warning px-2 py-0.5 rounded-full text-[10px] font-semibold">
                          <AlertTriangle size={10} /> Rischio no-show
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{a.reason || "Visita"}</div>
                  </div>
                  <StatusPill {...APPT_STATUS[a.status]} testid={`appt-status-${a.id}`} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Follow-ups preventivi */}
        <Panel title="Preventivi da richiamare oggi" to="/recupero" count={followups.length} testid="panel-followups">
          {followups.length === 0 ? (
            <EmptyRow icon={CheckCircle2} text="Nessun follow-up da gestire. Ottimo lavoro!" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {followups.map((f) => (
                <li key={f.id} data-testid={`followup-row-${f.id}`} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{f.patient_name}</div>
                    <div className="text-xs text-slate-500 truncate">{f.title} · {fmtEUR(f.total_amount)}</div>
                  </div>
                  {f.patient_phone && (
                    <a href={`tel:${f.patient_phone}`} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-sky-50 text-sky-700 font-semibold hover:bg-sky-100">
                      <Phone size={12} /> Chiama
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Overdue payments */}
        <Panel title="Pagamenti da sollecitare" to="/pagamenti" count={overdue.length} testid="panel-overdue">
          {overdue.length === 0 ? (
            <EmptyRow icon={Wallet} text="Nessuna rata scaduta. Tutto in regola." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {overdue.map((o) => (
                <li key={o.id} data-testid={`overdue-row-${o.id}`} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{o.patient_name}</div>
                    <div className="text-xs text-slate-500">Rata {o.number} · scaduta {fmtDate(o.due_date)}</div>
                  </div>
                  <div className="text-sm font-semibold text-red-600">{fmtEUR(o.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Tasks */}
      <Panel title="Task in corso" to="#" count={tasks_today.length} testid="panel-tasks">
        {tasks_today.length === 0 ? (
          <EmptyRow icon={ListChecks} text="Nessuna task aperta." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {tasks_today.map((t) => (
              <li key={t.id} className="py-3 flex items-center gap-3" data-testid={`task-row-${t.id}`}>
                <div className={`w-2 h-2 rounded-full ${t.priority === "alta" ? "bg-red-500" : t.priority === "media" ? "bg-amber-500" : "bg-slate-300"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{t.title}</div>
                  <div className="text-xs text-slate-500">{t.due_date ? `Scadenza ${fmtDate(t.due_date)}` : "Senza scadenza"} {t.patient_name ? `· ${t.patient_name}` : ""}</div>
                </div>
                <span className="text-xs text-slate-400 capitalize">{t.priority}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Panel({ title, to, count, children, testid }) {
  return (
    <div data-testid={testid} className="bg-white rounded-xl border border-slate-200">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold tracking-tight text-slate-900" style={{ fontFamily: "Manrope" }}>{title}</h3>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{count}</span>
        </div>
        {to && to !== "#" && (
          <Link to={to} className="text-xs font-semibold text-df-primary hover:underline inline-flex items-center gap-1">
            Vedi tutto <ArrowRight size={12} />
          </Link>
        )}
      </div>
      <div className="px-5 py-1 max-h-96 overflow-y-auto">{children}</div>
    </div>
  );
}

function EmptyRow({ icon: Icon, text }) {
  return (
    <div className="py-8 text-center text-sm text-slate-400">
      <Icon className="mx-auto mb-2" size={20} />
      {text}
    </div>
  );
}
