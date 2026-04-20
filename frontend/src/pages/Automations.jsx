import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Plus, Play, CheckCircle2, Clock, XCircle, MessageSquare, Mail, ListChecks, ToggleRight, Trash2, Cog } from "lucide-react";
import { fmtDateTime, fmtEUR } from "../lib/format";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";

const CHANNEL_ICON = { whatsapp: MessageSquare, email: Mail, task: ListChecks };
const STATUS_TONE = {
  scheduled: { icon: Clock, cls: "bg-sky-50 text-sky-700 border-sky-100", label: "Programmato" },
  executed: { icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-100", label: "Eseguito" },
  failed: { icon: XCircle, cls: "bg-red-50 text-red-700 border-red-100", label: "Fallito" },
  skipped: { icon: XCircle, cls: "bg-slate-50 text-slate-600 border-slate-200", label: "Saltato" },
};
const TPL_LABELS = {
  wa_template_a: "WhatsApp · Amichevole",
  wa_template_b: "WhatsApp · Diretto",
  email_reminder: "Email · Formale",
  manual_note: "Manuale",
};

export default function Automations() {
  const [rules, setRules] = useState([]);
  const [runs, setRuns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [team, setTeam] = useState([]);
  const [open, setOpen] = useState(false);
  const [simulating, setSimulating] = useState(false);

  const load = async () => {
    try {
      const [r, runsRes, tp, tm] = await Promise.all([
        api.get("/automations/rules"),
        api.get("/automations/runs", { params: { limit: 200 } }),
        api.get("/followup-center/templates"),
        api.get("/auth/team"),
      ]);
      setRules(r.data);
      setRuns(runsRes.data);
      setTemplates(tp.data.templates);
      setTeam(tm.data);
    } catch { toast.error("Errore caricamento automazioni"); }
  };
  useEffect(() => { load(); }, []);

  const upcoming = runs.filter((r) => r.status === "scheduled").slice(0, 50);
  const executed = runs.filter((r) => r.status === "executed").slice(0, 50);
  const failed = runs.filter((r) => r.status === "failed").slice(0, 50);

  const simulate = async () => {
    setSimulating(true);
    try {
      const { data } = await api.post("/automations/simulate");
      if (data.created === 0 && data.executed === 0) {
        toast.info("Scheduler eseguito · niente di nuovo da fare al momento");
      } else {
        toast.success(`Scheduler: ${data.created} nuovi run, ${data.executed} eseguiti`);
      }
      load();
    } catch { toast.error("Errore simulazione"); }
    finally { setSimulating(false); }
  };

  const toggleRule = async (rule, nextActive) => {
    try {
      await api.put(`/automations/rules/${rule.id}`, { ...rule, active: nextActive });
      toast.success(nextActive ? "Regola attivata" : "Regola disattivata");
      load();
    } catch { toast.error("Errore"); }
  };

  const deleteRule = async (rule) => {
    if (!window.confirm(`Eliminare la regola "${rule.name}"?`)) return;
    try {
      await api.delete(`/automations/rules/${rule.id}`);
      toast.success("Regola eliminata");
      load();
    } catch { toast.error("Errore"); }
  };

  return (
    <div className="space-y-6" data-testid="automations-page">
      {/* Hero */}
      <div className="rounded-2xl bg-df-primary text-white p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-semibold text-sky-200">
              <Cog size={14} /> Automazioni follow-up
            </div>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: "Manrope" }}>
              {rules.filter((r) => r.active).length} sequenze attive · {upcoming.length} in arrivo
            </h2>
            <p className="mt-1 text-sm text-white/80">
              Lo studio non si deve più ricordare ogni reminder. Definisci una sequenza, la applichiamo a ogni nuovo preventivo.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              data-testid="automations-simulate-btn"
              onClick={simulate}
              disabled={simulating}
              className="inline-flex items-center gap-2 px-4 h-11 rounded-lg bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 disabled:opacity-60"
            >
              <Play size={14} /> {simulating ? "Esecuzione…" : "Simula scheduler"}
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button data-testid="automations-new-btn" className="inline-flex items-center gap-2 px-4 h-11 rounded-lg bg-white text-df-primary text-sm font-semibold hover:bg-slate-100">
                  <Plus size={14} /> Nuova regola
                </button>
              </DialogTrigger>
              <RuleForm templates={templates} team={team} onDone={() => { setOpen(false); load(); }} />
            </Dialog>
          </div>
        </div>
      </div>

      <Tabs defaultValue="rules">
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="rules" data-testid="auto-tab-rules">Regole ({rules.length})</TabsTrigger>
          <TabsTrigger value="upcoming" data-testid="auto-tab-upcoming">In arrivo ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="executed" data-testid="auto-tab-executed">Eseguiti ({executed.length})</TabsTrigger>
          <TabsTrigger value="failed" data-testid="auto-tab-failed">Falliti ({failed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {rules.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">Nessuna regola. Crea la tua prima sequenza di follow-up.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {rules.map((r) => {
                  const Icon = CHANNEL_ICON[r.channel] || MessageSquare;
                  return (
                    <li key={r.id} data-testid={`rule-row-${r.id}`} className="px-5 py-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <div className="md:col-span-5 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><Icon size={16} /></div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{r.name}</div>
                          <div className="text-xs text-slate-500">Trigger: preventivo presentato · Canale: {r.channel}{r.template_key ? ` · ${TPL_LABELS[r.template_key]}` : ""}</div>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ritardo</span>
                        <div className="text-sm font-bold text-slate-900">Giorno {r.delay_days}</div>
                      </div>
                      <div className="md:col-span-2">
                        {(() => {
                          const u = team.find((t) => t.id === r.assigned_to);
                          return u ? (
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Assegnata a</div>
                              <div className="text-xs text-slate-700">{u.full_name}</div>
                            </div>
                          ) : <div className="text-xs text-slate-400">Automatica</div>;
                        })()}
                      </div>
                      <div className="md:col-span-3 flex items-center gap-2 md:justify-end">
                        <button
                          data-testid={`rule-toggle-${r.id}`}
                          onClick={() => toggleRule(r, !r.active)}
                          className={`h-8 px-3 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 ${r.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          <ToggleRight size={14} className={r.active ? "" : "rotate-180"} /> {r.active ? "Attiva" : "Disattivata"}
                        </button>
                        <button
                          data-testid={`rule-delete-${r.id}`}
                          onClick={() => deleteRule(r)}
                          className="w-8 h-8 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 inline-flex items-center justify-center"
                          title="Elimina"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4"><RunList runs={upcoming} empty="Nessun run programmato. Clicca 'Simula scheduler' per generarne alcuni." /></TabsContent>
        <TabsContent value="executed" className="mt-4"><RunList runs={executed} empty="Nessun run eseguito." /></TabsContent>
        <TabsContent value="failed" className="mt-4"><RunList runs={failed} empty="Nessun run fallito. 🎉" /></TabsContent>
      </Tabs>
    </div>
  );
}

function RunList({ runs, empty }) {
  if (runs.length === 0) return <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">{empty}</div>;
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {runs.map((r) => {
          const st = STATUS_TONE[r.status] || STATUS_TONE.scheduled;
          const SIcon = st.icon;
          const CIcon = CHANNEL_ICON[r.rule_channel] || MessageSquare;
          return (
            <li key={r.id} data-testid={`run-row-${r.id}`} className="px-5 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600"><CIcon size={14} /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{r.rule_name} · {r.patient_name}</div>
                <div className="text-xs text-slate-500 truncate">
                  {r.estimate_title} {r.estimate_amount != null ? `· ${fmtEUR(r.estimate_amount)}` : ""} · pianificato {fmtDateTime(r.scheduled_at)}
                  {r.error_msg && <span className="text-red-600"> · {r.error_msg}</span>}
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${st.cls}`}>
                <SIcon size={12} /> {st.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RuleForm({ templates, team, onDone, initial }) {
  const [form, setForm] = useState(initial || {
    name: "", delay_days: 3, channel: "whatsapp", template_key: "wa_template_a", assigned_to: "", active: true,
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Inserisci un nome"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        trigger: "estimate_presented",
        delay_days: Number(form.delay_days),
        channel: form.channel,
        template_key: (form.channel === "task") ? null : (form.template_key || null),
        assigned_to: form.assigned_to || null,
        active: !!form.active,
      };
      if (initial?.id) await api.put(`/automations/rules/${initial.id}`, payload);
      else await api.post("/automations/rules", payload);
      toast.success("Regola salvata");
      onDone?.();
    } catch { toast.error("Errore salvataggio"); }
    finally { setSaving(false); }
  };

  const filteredTemplates = templates.filter((t) => (
    (form.channel === "whatsapp" && t.key.startsWith("wa_"))
    || (form.channel === "email" && t.key === "email_reminder")
  ));

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{initial ? "Modifica regola" : "Nuova regola automazione"}</DialogTitle>
        <DialogDescription>Definisci quando e come inviare follow-up automatici dopo un preventivo presentato.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome</label>
          <input data-testid="rf-name" value={form.name} onChange={set("name")} placeholder="es. Giorno 5 · WhatsApp" className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Ritardo (giorni)</label>
            <input data-testid="rf-delay" type="number" min={0} max={365} value={form.delay_days} onChange={set("delay_days")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Canale</label>
            <select data-testid="rf-channel" value={form.channel} onChange={set("channel")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white">
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="task">Task (chiamata)</option>
            </select>
          </div>
        </div>
        {form.channel !== "task" && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Template</label>
            <select data-testid="rf-template" value={form.template_key || ""} onChange={set("template_key")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white">
              <option value="">— seleziona —</option>
              {filteredTemplates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Assegna a</label>
          <select data-testid="rf-assignee" value={form.assigned_to || ""} onChange={set("assigned_to")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="">Automatico</option>
            {team.map((u) => <option key={u.id} value={u.id}>{u.full_name} · {u.role}</option>)}
          </select>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" data-testid="rf-active" checked={!!form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Regola attiva
        </label>
      </div>
      <DialogFooter>
        <button data-testid="rf-save-btn" onClick={submit} disabled={saving} className="h-10 px-4 rounded-lg bg-df-primary text-white text-sm font-semibold hover:bg-[#1E3A8A] disabled:opacity-60">Salva</button>
      </DialogFooter>
    </DialogContent>
  );
}
