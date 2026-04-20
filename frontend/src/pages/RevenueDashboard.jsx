import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { fmtEUR, fmtDate, todayISO } from "../lib/format";
import { TrendingUp, TrendingDown, Users, Send, Clock, Award, Radar, ArrowUpRight, Target, CheckCircle2, MessageSquare, Mail } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toast } from "sonner";

const TPL_LABELS = {
  wa_template_a: "WhatsApp A",
  wa_template_b: "WhatsApp B",
  email_reminder: "Email",
  manual_note: "Manuale",
};

const KpiCard = ({ icon: Icon, label, value, sub, tone = "slate", testid }) => {
  const toneMap = {
    slate: "bg-slate-50 text-slate-600",
    primary: "bg-[#0C315B]/10 text-[#0C315B]",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    accent: "bg-sky-50 text-sky-700",
  };
  return (
    <div data-testid={testid} className="bg-white rounded-xl border border-slate-200 p-4 df-card-hover">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${toneMap[tone]}`}><Icon size={14} /></div>
      </div>
      <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Manrope" }}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
};

export default function RevenueDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    date_from: "",
    date_to: "",
    staff_member: "",
    template: "",
    channel: "",
  });
  const [staff, setStaff] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await api.get("/revenue/overview", { params });
      setData(data);
    } catch { toast.error("Errore caricamento revenue"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters]);
  useEffect(() => { api.get("/auth/team").then(({ data }) => setStaff(data)); }, []);

  if (loading || !data) return <div className="py-14 text-center text-slate-400" data-testid="revenue-loading">Caricamento…</div>;

  const { kpis, funnel, weekly_recovered, templates_performance, top_open_estimates, lost_by_reason, month_compare } = data;
  const mom = (() => {
    const cur = month_compare.current.revenue;
    const prev = month_compare.previous.revenue;
    if (!prev) return { delta: cur > 0 ? 100 : 0, up: cur >= prev };
    return { delta: Math.round(((cur - prev) / prev) * 100), up: cur >= prev };
  })();

  return (
    <div className="space-y-6" data-testid="revenue-page">
      {/* Hero */}
      <div className="rounded-2xl bg-df-primary text-white p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-semibold text-emerald-200">
              <Target size={14} /> Revenue recovery dashboard
            </div>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: "Manrope" }}>
              {fmtEUR(kpis.recovered_revenue_this_month)} recuperati questo mese
            </h2>
            <p className="mt-1 text-sm text-white/80">
              {kpis.recovered_estimates_count_this_month} preventivi salvati su {kpis.sent_reminders_this_month} reminder inviati.
              <span className={`ml-2 inline-flex items-center gap-1 ${mom.up ? "text-emerald-300" : "text-red-300"}`}>
                {mom.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {mom.delta >= 0 ? "+" : ""}{mom.delta}% vs mese scorso
              </span>
            </p>
          </div>
          <Link to="/revenue/radar" data-testid="revenue-cta-radar" className="inline-flex items-center gap-2 px-4 h-11 rounded-lg bg-white text-df-primary font-semibold text-sm hover:bg-slate-100 self-start">
            <Radar size={16} /> Revenue Lost Radar
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end" data-testid="revenue-filters">
        <F label="Da"><input data-testid="rev-filter-from" type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-sm" /></F>
        <F label="A"><input data-testid="rev-filter-to" type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-sm" /></F>
        <F label="Staff">
          <select data-testid="rev-filter-staff" value={filters.staff_member} onChange={(e) => setFilters({ ...filters, staff_member: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white">
            <option value="">Tutti</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </F>
        <F label="Template">
          <select data-testid="rev-filter-template" value={filters.template} onChange={(e) => setFilters({ ...filters, template: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white">
            <option value="">Tutti</option>
            {Object.entries(TPL_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </F>
        <F label="Canale">
          <select data-testid="rev-filter-channel" value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value })} className="h-9 px-2 rounded-md border border-slate-200 text-sm bg-white">
            <option value="">Tutti</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="manual">Manuale</option>
          </select>
        </F>
        <button onClick={() => setFilters({ date_from: "", date_to: "", staff_member: "", template: "", channel: "" })} className="h-9 px-3 rounded-md border border-slate-200 text-xs font-semibold hover:bg-slate-50" data-testid="rev-filter-reset">Reset</button>
      </div>

      {/* KPIs row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={CheckCircle2} label="Preventivi recuperati" value={kpis.recovered_estimates_count_this_month} sub="Questo mese" tone="success" testid="kpi-recovered-count" />
        <KpiCard icon={TrendingUp} label="Revenue recuperato" value={fmtEUR(kpis.recovered_revenue_this_month)} sub="Questo mese" tone="primary" testid="kpi-recovered-rev" />
        <KpiCard icon={Send} label="Reminder inviati" value={kpis.sent_reminders_this_month} sub="Questo mese" tone="accent" testid="kpi-sent" />
        <KpiCard icon={Target} label="Tasso accettazione" value={`${kpis.reminder_to_acceptance_rate}%`} sub={`Risposta ${kpis.reminder_to_reply_rate}% · Appt ${kpis.reminder_to_appointment_rate}%`} tone="success" testid="kpi-accept" />
      </div>
      {/* KPIs row 2 - insights */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Award} label="Miglior template" value={kpis.best_template ? TPL_LABELS[kpis.best_template.key] || kpis.best_template.key : "—"} sub={kpis.best_template ? `${kpis.best_template.acceptance_rate}% su ${kpis.best_template.sent} invii` : "Dati insufficienti"} tone="warning" testid="kpi-best-tpl" />
        <KpiCard icon={Clock} label="Momento migliore" value={kpis.best_contact_time_range || "—"} sub={kpis.best_contact_delay_days ? `${kpis.best_contact_delay_days}gg medi dopo preventivo` : "—"} tone="accent" testid="kpi-best-time" />
        <KpiCard icon={Users} label="Top collaboratore" value={kpis.top_staff_member_by_conversion_rate ? kpis.top_staff_member_by_conversion_rate.name : "—"} sub={kpis.top_staff_member_by_conversion_rate ? `${kpis.top_staff_member_by_conversion_rate.acceptance_rate}% accettazione` : "—"} tone="primary" testid="kpi-top-staff" />
        <KpiCard icon={TrendingUp} label="MoM revenue" value={`${mom.delta >= 0 ? "+" : ""}${mom.delta}%`} sub={`Ora ${fmtEUR(month_compare.current.revenue)} vs ${fmtEUR(month_compare.previous.revenue)}`} tone={mom.up ? "success" : "danger"} testid="kpi-mom" />
      </div>

      {/* Weekly chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="rev-weekly-chart">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Revenue recuperato per settimana (ultime 8)</h3>
          <span className="text-xs text-slate-500">Solo preventivi accettati via reminder</span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly_recovered}>
              <CartesianGrid vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="week_start" tickFormatter={(v) => new Date(v).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} tick={{ fill: "#64748B", fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${v / 1000}k`} tick={{ fill: "#64748B", fontSize: 11 }} />
              <Tooltip
                formatter={(v) => [fmtEUR(v), "Recuperato"]}
                labelFormatter={(l) => new Date(l).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }}
              />
              <Bar dataKey="revenue" fill="#0C315B" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Funnel + templates */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="rev-funnel">
          <h3 className="text-sm font-bold text-slate-900 mb-3" style={{ fontFamily: "Manrope" }}>Funnel di conversione</h3>
          <FunnelStep label="Inviati" value={funnel.sent} total={funnel.sent} color="bg-slate-700" />
          <FunnelStep label="Risposta" value={funnel.replied} total={funnel.sent} color="bg-sky-500" />
          <FunnelStep label="Appt. fissato" value={funnel.appt_booked} total={funnel.sent} color="bg-emerald-500" />
          <FunnelStep label="Accettato" value={funnel.accepted} total={funnel.sent} color="bg-df-primary bg-[#0C315B]" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="rev-templates">
          <h3 className="text-sm font-bold text-slate-900 mb-3" style={{ fontFamily: "Manrope" }}>Accettati per template</h3>
          {templates_performance.length === 0 ? (
            <div className="text-sm text-slate-400">Ancora nessun dato.</div>
          ) : (
            <ul className="space-y-3">
              {templates_performance.sort((a, b) => b.accepted - a.accepted).map((t) => {
                const Icon = t.template_key?.startsWith("wa") ? MessageSquare : Mail;
                return (
                  <li key={t.template_key} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><Icon size={14} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900">{TPL_LABELS[t.template_key] || t.template_key}</div>
                      <div className="text-[11px] text-slate-500">{t.accepted}/{t.sent} · {t.acceptance_rate}% accettazione</div>
                    </div>
                    <div className="w-28 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-df-primary" style={{ width: `${Math.min(100, t.acceptance_rate)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Top open + Lost reasons */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200" data-testid="rev-top-open">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Top 10 preventivi aperti</h3>
            <Link to="/recupero" className="text-xs font-semibold text-df-primary hover:underline">Vai al centro recupero <ArrowUpRight size={12} className="inline" /></Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {top_open_estimates.length === 0 ? (
              <li className="p-6 text-sm text-slate-400 text-center">Nessun preventivo aperto.</li>
            ) : top_open_estimates.map((e) => (
              <li key={e.estimate_id} className="px-5 py-3 flex items-center gap-3" data-testid={`top-open-${e.estimate_id}`}>
                <div className="flex-1 min-w-0">
                  <Link to={`/pazienti/${e.patient_id}`} className="text-sm font-medium text-slate-900 hover:underline truncate block">{e.patient_name}</Link>
                  <div className="text-xs text-slate-500 truncate">{e.title}</div>
                </div>
                <div className="text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{fmtEUR(e.amount)}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-slate-200" data-testid="rev-lost-reasons">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Revenue persa per motivo</h3>
            <p className="text-xs text-slate-500">Solo preventivi rifiutati</p>
          </div>
          <ul className="p-3 space-y-2">
            {lost_by_reason.length === 0 ? (
              <li className="p-4 text-sm text-slate-400 text-center">Nessuna perdita registrata.</li>
            ) : lost_by_reason.map((l) => {
              const maxAmt = Math.max(...lost_by_reason.map((x) => x.amount));
              return (
                <li key={l.reason} className="p-2 rounded-md hover:bg-slate-50">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900 truncate">{l.reason}</span>
                    <span className="font-bold text-red-600">{fmtEUR(l.amount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-red-400" style={{ width: `${(l.amount / maxAmt) * 100}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{l.count} preventivi</div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Month compare */}
      <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="rev-mom">
        <h3 className="text-sm font-bold text-slate-900 mb-3" style={{ fontFamily: "Manrope" }}>Questo mese vs mese scorso</h3>
        <div className="grid grid-cols-2 gap-6">
          <MomCol title="Questo mese" m={month_compare.current} accent="text-df-primary" />
          <MomCol title="Mese scorso" m={month_compare.previous} accent="text-slate-500" />
        </div>
      </div>
    </div>
  );
}

function F({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function FunnelStep({ label, value, total, color }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-bold text-slate-900">{value} <span className="text-slate-400 font-normal">· {pct}%</span></span>
      </div>
      <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MomCol({ title, m, accent }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{title}</div>
      <div className={`text-3xl font-bold ${accent}`} style={{ fontFamily: "Manrope" }}>{fmtEUR(m.revenue)}</div>
      <div className="text-xs text-slate-500 mt-1">{m.accepted} accettati su {m.sent} invii · {m.accept_rate}%</div>
    </div>
  );
}
