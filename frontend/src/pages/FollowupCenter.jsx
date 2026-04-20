import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { Send, Phone, TrendingUp, Award, MessageSquare, Mail, NotebookPen, Flame, Gauge, Sparkles, ArrowUpRight, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { fmtEUR, fmtDate, fmtDateTime, ESTIMATE_STATUS } from "../lib/format";
import { StatusPill } from "../components/StatusPill";
import EmptyState from "../components/EmptyState";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";

const ACTION_ICON = {
  call_now: Flame,
  send_wa_a: MessageSquare,
  send_wa_b: MessageSquare,
  send_email: Mail,
  archive_or_manual: NotebookPen,
};
const ACTION_TONE = {
  call_now: "bg-red-50 text-red-700 border-red-100",
  send_wa_a: "bg-emerald-50 text-emerald-700 border-emerald-100",
  send_wa_b: "bg-sky-50 text-sky-700 border-sky-100",
  send_email: "bg-indigo-50 text-indigo-700 border-indigo-100",
  archive_or_manual: "bg-slate-50 text-slate-600 border-slate-100",
};
const SCORE_TONE = (s) => s >= 75 ? "bg-red-500" : s >= 55 ? "bg-emerald-500" : s >= 35 ? "bg-sky-500" : s >= 15 ? "bg-amber-500" : "bg-slate-400";

const TEMPLATE_ICON = {
  wa_template_a: MessageSquare,
  wa_template_b: MessageSquare,
  email_reminder: Mail,
  manual_note: NotebookPen,
};

const REMINDER_STATUS_LABELS = {
  sent: "Inviato",
  delivered: "Consegnato",
  read: "Letto",
  replied: "Ha risposto",
  appt_booked: "Appuntamento fissato",
  accepted: "Preventivo accettato",
  rejected: "Rifiutato",
  no_response: "Nessuna risposta",
};

export default function FollowupCenter() {
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [studioName, setStudioName] = useState("");
  const [actionLabels, setActionLabels] = useState({});
  const [loading, setLoading] = useState(true);
  const [sendTarget, setSendTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [q, s, t] = await Promise.all([
        api.get("/followup-center/queue"),
        api.get("/followup-center/ab-stats"),
        api.get("/followup-center/templates"),
      ]);
      setQueue(q.data);
      setStats(s.data);
      setTemplates(t.data.templates);
      setStudioName(t.data.studio_name || "");
      setActionLabels(t.data.recommended_action_labels || {});
    } catch {
      toast.error("Impossibile caricare il Follow-up Center");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const openValue = queue.reduce((s, x) => s + (x.estimate_amount || 0), 0);
    const hot = queue.filter((x) => x.score >= 75).length;
    return { queueCount: queue.length, openValue, hot };
  }, [queue]);

  return (
    <div className="space-y-6" data-testid="followup-center-page">
      {/* Hero banner */}
      <div className="rounded-2xl bg-df-primary text-white p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-semibold text-emerald-200">
              <Sparkles size={14} /> Centro recupero preventivi
            </div>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: "Manrope" }}>
              {totals.queueCount} preventivi aperti · {fmtEUR(totals.openValue)} in trattativa
            </h2>
            <p className="mt-1 text-sm text-white/80">
              {totals.hot > 0 ? (<>🔥 <b>{totals.hot}</b> casi ad alta priorità: chiamali oggi per massimizzare le conversioni.</>) : "Nessun caso urgente — tutto sotto controllo."}
            </p>
          </div>
          {stats?.winner && stats.winner !== "tie" && (
            <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 border border-white/10">
              <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] font-semibold text-emerald-200">
                <Award size={12} /> Template vincente
              </div>
              <div className="mt-1 text-lg font-bold" style={{ fontFamily: "Manrope" }}>
                {stats.winner === "wa_template_a" ? "WhatsApp · Amichevole" : "WhatsApp · Diretto"}
              </div>
              <div className="text-xs text-white/80">
                {stats.buckets[stats.winner].acceptance_rate}% preventivi accettati
              </div>
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="queue">
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="queue" data-testid="fc-tab-queue">Priorità di oggi</TabsTrigger>
          <TabsTrigger value="ab" data-testid="fc-tab-ab">A/B testing messaggi</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          {loading ? (
            <div className="py-14 text-center text-slate-400">Caricamento…</div>
          ) : queue.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nessun preventivo da recuperare"
              description="Ottimo lavoro! Tutti i preventivi aperti sono stati gestiti."
              testid="fc-empty"
            />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="hidden md:grid grid-cols-12 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <div className="col-span-3">Paziente & preventivo</div>
                <div className="col-span-2">Importo</div>
                <div className="col-span-2">Tempistica</div>
                <div className="col-span-1 text-center">Score</div>
                <div className="col-span-2">Azione</div>
                <div className="col-span-2 text-right">&nbsp;</div>
              </div>
              <ul className="divide-y divide-slate-100">
                {queue.map((q) => {
                  const Icon = ACTION_ICON[q.recommended_action] || Sparkles;
                  return (
                    <li key={q.estimate_id} data-testid={`fc-queue-row-${q.estimate_id}`} className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-0 px-5 py-4 hover:bg-slate-50 items-center">
                      <div className="md:col-span-3 min-w-0">
                        <Link to={`/pazienti/${q.patient_id}`} className="text-sm font-semibold text-slate-900 hover:underline truncate block">{q.patient_name}</Link>
                        <div className="text-xs text-slate-500 truncate">{q.estimate_title}</div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{fmtEUR(q.estimate_amount)}</div>
                        <StatusPill {...ESTIMATE_STATUS[q.estimate_status]} />
                      </div>
                      <div className="md:col-span-2 text-xs text-slate-600">
                        <div className="inline-flex items-center gap-1"><Clock size={12} /> {q.days_since != null ? `${q.days_since}gg da presentazione` : "—"}</div>
                        <div className="text-slate-400 text-[11px]">
                          {q.last_contact_at ? `Ultimo contatto ${fmtDate(q.last_contact_at)}` : "Mai contattato"}
                          {q.reminders_count > 0 && <> · {q.reminders_count} tentativi</>}
                        </div>
                      </div>
                      <div className="md:col-span-1 flex flex-col items-center gap-1">
                        <div className="relative w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center">
                          <div className={`absolute inset-0.5 rounded-full ${SCORE_TONE(q.score)} opacity-25`} />
                          <span className="relative text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{q.score}</span>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${ACTION_TONE[q.recommended_action]}`}>
                          <Icon size={12} /> {q.recommended_action_label}
                        </span>
                      </div>
                      <div className="md:col-span-2 md:text-right flex gap-2 md:justify-end">
                        {q.patient_phone && (
                          <a href={`tel:${q.patient_phone}`} data-testid={`fc-call-${q.estimate_id}`} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200">
                            <Phone size={12} /> Chiama
                          </a>
                        )}
                        <button
                          data-testid={`fc-send-${q.estimate_id}`}
                          onClick={() => setSendTarget(q)}
                          className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-df-primary text-white text-xs font-semibold hover:bg-[#1E3A8A]"
                        >
                          <Send size={12} /> Invia reminder
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Recent reminders feed */}
          <RecentReminders onChange={load} />
        </TabsContent>

        <TabsContent value="ab" className="mt-4">
          {stats ? <AbDashboard stats={stats} /> : <div className="py-14 text-center text-slate-400">Caricamento…</div>}
        </TabsContent>
      </Tabs>

      {/* Send reminder dialog */}
      <Dialog open={!!sendTarget} onOpenChange={(o) => { if (!o) setSendTarget(null); }}>
        {sendTarget && (
          <SendReminderForm
            target={sendTarget}
            templates={templates}
            studioName={studioName}
            onDone={() => { setSendTarget(null); load(); }}
          />
        )}
      </Dialog>
    </div>
  );
}

function AbDashboard({ stats }) {
  const a = stats.buckets.wa_template_a;
  const b = stats.buckets.wa_template_b;
  const e = stats.buckets.email_reminder;

  return (
    <div className="space-y-4">
      {/* Winner callout */}
      {stats.winner && stats.winner !== "tie" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3" data-testid="ab-winner-banner">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
            <Award size={20} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-emerald-900" style={{ fontFamily: "Manrope" }}>
              Vincitore: {stats.winner === "wa_template_a" ? "Template A — Amichevole" : "Template B — Diretto"}
            </div>
            <div className="text-xs text-emerald-700">
              Migliore tasso di accettazione preventivi. Raccomandiamo di usare questo template come default.
            </div>
          </div>
        </div>
      )}
      {stats.winner === "tie" && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-sm text-sky-900" data-testid="ab-tie-banner">
          Pareggio: i due template hanno lo stesso tasso di accettazione. Continua a inviare per raccogliere più dati.
        </div>
      )}
      {!stats.winner && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600" data-testid="ab-insufficient-banner">
          Servono almeno 5 messaggi per template per determinare un vincitore statisticamente significativo.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <TemplateCard label="WhatsApp · Amichevole" sub="Template A" bucket={a} accent="emerald" winner={stats.winner === "wa_template_a"} testid="ab-card-a" />
        <TemplateCard label="WhatsApp · Diretto" sub="Template B" bucket={b} accent="sky" winner={stats.winner === "wa_template_b"} testid="ab-card-b" />
        <TemplateCard label="Email · Formale" sub="Email" bucket={e} accent="indigo" testid="ab-card-email" />
      </div>

      {/* Comparative bars */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-4" style={{ fontFamily: "Manrope" }}>Confronto metriche</h3>
        <div className="space-y-4">
          <MetricBar label="Tasso di risposta" a={a.reply_rate} b={b.reply_rate} e={e.reply_rate} />
          <MetricBar label="Appuntamenti fissati" a={a.booking_rate} b={b.booking_rate} e={e.booking_rate} />
          <MetricBar label="Preventivi accettati" a={a.acceptance_rate} b={b.acceptance_rate} e={e.acceptance_rate} />
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ label, sub, bucket, accent = "emerald", winner = false, testid }) {
  const accentMap = {
    emerald: "bg-emerald-500 text-white",
    sky: "bg-sky-500 text-white",
    indigo: "bg-indigo-500 text-white",
  };
  return (
    <div data-testid={testid} className={`bg-white rounded-xl border ${winner ? "border-emerald-300 ring-2 ring-emerald-100" : "border-slate-200"} p-5 relative`}>
      {winner && <span className="absolute -top-2 right-3 text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white px-2 py-0.5 rounded-full">Top</span>}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{sub}</div>
          <div className="text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{label}</div>
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accentMap[accent]}`}>
          <TrendingUp size={16} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Inviati" value={bucket.sent} />
        <Metric label="Accettazione" value={`${bucket.acceptance_rate}%`} highlight />
        <Metric label="Risposta" value={`${bucket.reply_rate}%`} />
        <Metric label="Prenotazioni" value={`${bucket.booking_rate}%`} />
      </div>
      <div className="mt-3 text-xs text-slate-500">
        Tempo medio a conversione: <b className="text-slate-800">{bucket.avg_hours_to_conversion != null ? `${bucket.avg_hours_to_conversion}h` : "—"}</b>
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-xl font-bold ${highlight ? "text-df-primary" : "text-slate-900"}`} style={{ fontFamily: "Manrope" }}>{value}</div>
    </div>
  );
}

function MetricBar({ label, a, b, e }) {
  const max = Math.max(a, b, e, 5);
  const Row = ({ title, v, color }) => (
    <div className="flex items-center gap-3 text-xs">
      <div className="w-24 text-slate-500">{title}</div>
      <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${(v / max) * 100}%` }} />
      </div>
      <div className="w-14 text-right font-bold text-slate-800">{v}%</div>
    </div>
  );
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{label}</div>
      <div className="space-y-1.5">
        <Row title="Template A" v={a} color="bg-emerald-500" />
        <Row title="Template B" v={b} color="bg-sky-500" />
        <Row title="Email" v={e} color="bg-indigo-500" />
      </div>
    </div>
  );
}

function SendReminderForm({ target, templates, studioName, onDone }) {
  const [tplKey, setTplKey] = useState(
    target.recommended_action === "send_email" ? "email_reminder"
    : target.recommended_action === "send_wa_b" ? "wa_template_b"
    : target.recommended_action === "archive_or_manual" ? "manual_note"
    : "wa_template_a"
  );
  const tpl = useMemo(() => templates.find((t) => t.key === tplKey), [tplKey, templates]);
  const firstName = (target.patient_name || "Paziente").split(" ")[0];

  const variables = useMemo(() => ({
    patient_first_name: firstName,
    sender_name: "Segreteria",
    studio_name: studioName,
    estimate_title: target.estimate_title,
    estimate_amount: String(Math.round(target.estimate_amount || 0)),
    notes: "",
  }), [firstName, studioName, target]);

  const renderText = (txt) => (txt || "").replace(/\{(\w+)\}/g, (_, k) => variables[k] ?? `{${k}}`);
  const [text, setText] = useState(() => renderText(tpl?.body || ""));
  const [subject, setSubject] = useState(() => renderText(tpl?.subject || ""));

  useEffect(() => {
    setText(renderText(tpl?.body || ""));
    setSubject(renderText(tpl?.subject || ""));
  }, [tplKey]); // eslint-disable-line

  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      await api.post("/reminders", {
        patient_id: target.patient_id,
        estimate_id: target.estimate_id,
        channel: tpl.channel,
        template_key: tplKey,
        subject: subject || null,
        message_text: text,
      });
      toast.success("Reminder registrato. Ricordati di aggiornare l'esito quando il paziente risponde.");
      onDone?.();
    } catch {
      toast.error("Errore nell'invio");
    } finally { setSending(false); }
  };

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Invia reminder a {target.patient_name}</DialogTitle>
        <DialogDescription>
          Preventivo: <b>{target.estimate_title}</b> · {fmtEUR(target.estimate_amount)}
          {target.patient_phone && <> · <a href={`tel:${target.patient_phone}`} className="text-df-primary underline">{target.patient_phone}</a></>}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">Template</label>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((t) => {
              const Icon = TEMPLATE_ICON[t.key] || MessageSquare;
              const active = tplKey === t.key;
              return (
                <button
                  key={t.key}
                  data-testid={`fc-tpl-${t.key}`}
                  onClick={() => setTplKey(t.key)}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${active ? "border-df-primary bg-df-primary/5" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={14} className={active ? "text-df-primary" : "text-slate-500"} />
                    <span className={`text-xs font-semibold uppercase tracking-wider ${active ? "text-df-primary" : "text-slate-500"}`}>{t.channel}</span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{t.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {tpl?.channel === "email" && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Oggetto email</label>
            <input
              data-testid="fc-send-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-df-accent"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Messaggio (modificabile)</label>
          <textarea
            data-testid="fc-send-message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono bg-slate-50 focus:ring-2 focus:ring-df-accent"
          />
          <div className="mt-1.5 text-[11px] text-slate-500">
            Il messaggio sarà registrato e tracciato per il calcolo conversioni. In produzione verrà inviato tramite WhatsApp Business API o Resend.
          </div>
        </div>
      </div>

      <DialogFooter>
        <button
          data-testid="fc-send-submit"
          onClick={send}
          disabled={sending || !text.trim()}
          className="h-10 px-4 rounded-lg bg-df-primary text-white text-sm font-semibold hover:bg-[#1E3A8A] disabled:opacity-60 inline-flex items-center gap-2"
        >
          <Send size={14} /> {sending ? "Invio…" : "Invia e traccia"}
        </button>
      </DialogFooter>
    </DialogContent>
  );
}

function RecentReminders({ onChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/reminders");
      setRows(data.slice(0, 15));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/reminders/${id}/status`, { status, outcome_notes: "" });
      toast.success("Esito aggiornato");
      load();
      onChange?.();
    } catch {
      toast.error("Errore aggiornamento");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 mt-4">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Ultimi reminder inviati</h3>
        <span className="text-xs text-slate-500">Aggiorna l'esito quando il paziente risponde</span>
      </div>
      {loading ? (
        <div className="p-6 text-sm text-slate-400 text-center">Caricamento…</div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-sm text-slate-400 text-center">Ancora nessun reminder inviato.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => {
            const Icon = TEMPLATE_ICON[r.template_key] || MessageSquare;
            return (
              <li key={r.id} data-testid={`fc-recent-${r.id}`} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{r.patient_name}</div>
                    <div className="text-xs text-slate-500 truncate">{r.template_key === "wa_template_a" ? "WhatsApp A" : r.template_key === "wa_template_b" ? "WhatsApp B" : r.template_key === "email_reminder" ? "Email" : "Manuale"} · {fmtDateTime(r.sent_at)}</div>
                  </div>
                </div>
                <select
                  data-testid={`fc-recent-status-${r.id}`}
                  value={r.status}
                  onChange={(e) => updateStatus(r.id, e.target.value)}
                  className="h-9 px-2 rounded-lg border border-slate-200 text-xs bg-white font-medium"
                >
                  {Object.entries(REMINDER_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
