import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { Plus, AlertTriangle, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { APPT_STATUS, fmtDate, fmtTime, todayISO } from "../lib/format";
import { StatusPill } from "../components/StatusPill";
import EmptyState from "../components/EmptyState";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "../components/ui/dialog";

const STATUSES = ["programmato", "confermato", "completato", "cancellato", "no_show"];

function addDays(iso, d) {
  const dt = new Date(iso);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}

export default function Appointments() {
  const [view, setView] = useState("today"); // today | week | list
  const [anchor, setAnchor] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const { from, to } = useMemo(() => {
    if (view === "today") return { from: anchor, to: addDays(anchor, 1) };
    if (view === "week") return { from: anchor, to: addDays(anchor, 7) };
    return { from: addDays(anchor, -30), to: addDays(anchor, 60) };
  }, [view, anchor]);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get("/appointments", { params: { date_from: from, date_to: to } });
    setRows(data);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);

  const waitlist = rows.filter((r) => r.status === "cancellato");

  return (
    <div className="space-y-5" data-testid="appointments-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Manrope" }}>Agenda</h2>
          <p className="text-sm text-slate-500 mt-0.5">Appuntamenti, conferme e no-show.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button data-testid="appts-new-btn" className="h-11 px-4 rounded-lg bg-df-primary text-white font-semibold text-sm hover:bg-[#1E3A8A] inline-flex items-center gap-2">
              <Plus size={16} /> Nuovo appuntamento
            </button>
          </DialogTrigger>
          <AppointmentForm onDone={() => { setOpen(false); load(); }} />
        </Dialog>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden">
          <ViewTab active={view === "today"} onClick={() => setView("today")} testid="appts-view-today">Oggi</ViewTab>
          <ViewTab active={view === "week"} onClick={() => setView("week")} testid="appts-view-week">Settimana</ViewTab>
          <ViewTab active={view === "list"} onClick={() => setView("list")} testid="appts-view-list">Lista</ViewTab>
        </div>
        <div className="inline-flex items-center gap-1">
          <button data-testid="appts-prev-day" onClick={() => setAnchor(addDays(anchor, view === "week" ? -7 : -1))} className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center justify-center"><ChevronLeft size={14} /></button>
          <div className="px-3 h-9 rounded-lg border border-slate-200 bg-white inline-flex items-center text-sm font-semibold">{fmtDate(anchor)}</div>
          <button data-testid="appts-next-day" onClick={() => setAnchor(addDays(anchor, view === "week" ? 7 : 1))} className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center justify-center"><ChevronRight size={14} /></button>
          <button onClick={() => setAnchor(todayISO())} className="ml-1 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold hover:bg-slate-50">Oggi</button>
        </div>
      </div>

      {loading ? (
        <div className="py-14 text-center text-slate-400">Caricamento…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Calendar} title="Nessun appuntamento nel periodo" description="Cambia periodo o crea un nuovo appuntamento." testid="appts-empty" />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {rows.map((a) => (
            <div key={a.id} data-testid={`appts-row-${a.id}`} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="w-20 shrink-0">
                <div className="text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{fmtTime(a.scheduled_at)}</div>
                <div className="text-[11px] text-slate-500">{fmtDate(a.scheduled_at)} · {a.duration_min}′</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link to={`/pazienti/${a.patient_id}`} className="text-sm font-medium text-slate-900 hover:underline truncate">{a.patient_name}</Link>
                  {a.no_show_risk && <span className="text-[10px] font-semibold status-warning px-2 py-0.5 rounded-full inline-flex items-center gap-1"><AlertTriangle size={10} /> Rischio</span>}
                </div>
                <div className="text-xs text-slate-500 truncate">{a.reason || "Visita"}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill {...APPT_STATUS[a.status]} />
                <StatusSelect a={a} onDone={load} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lista attesa / buchi */}
      {waitlist.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3" style={{ fontFamily: "Manrope" }}>Slot cancellati ({waitlist.length})</h3>
          <p className="text-xs text-slate-500 mb-3">Questi slot sono stati cancellati e possono essere riutilizzati per pazienti in attesa.</p>
          <ul className="divide-y divide-slate-100">
            {waitlist.map((w) => (
              <li key={w.id} className="py-2 text-sm flex justify-between">
                <span>{fmtDate(w.scheduled_at)} · {fmtTime(w.scheduled_at)}</span>
                <span className="text-slate-500">{w.patient_name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ViewTab({ active, onClick, children, testid }) {
  return (
    <button data-testid={testid} onClick={onClick} className={`px-3 h-9 text-xs font-semibold ${active ? "bg-df-primary text-white" : "text-slate-600 hover:bg-slate-50"}`}>{children}</button>
  );
}

function StatusSelect({ a, onDone }) {
  const change = async (newStatus) => {
    try {
      await api.put(`/appointments/${a.id}`, { ...a, status: newStatus });
      toast.success("Stato aggiornato");
      onDone();
    } catch { toast.error("Errore"); }
  };
  return (
    <select data-testid={`appts-status-${a.id}`} value={a.status} onChange={(e) => change(e.target.value)} className="h-8 px-2 rounded-md border border-slate-200 text-xs bg-white">
      {STATUSES.map((s) => <option key={s} value={s}>{APPT_STATUS[s].label}</option>)}
    </select>
  );
}

function AppointmentForm({ onDone, initial }) {
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState(initial || {
    patient_id: "", scheduled_at: new Date().toISOString().slice(0, 16),
    duration_min: 30, reason: "", status: "programmato", notes: "",
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get("/patients").then(({ data }) => setPatients(data)); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.patient_id) { toast.error("Seleziona un paziente"); return; }
    setSaving(true);
    try {
      const payload = { ...form, duration_min: Number(form.duration_min), scheduled_at: new Date(form.scheduled_at).toISOString() };
      if (initial?.id) await api.put(`/appointments/${initial.id}`, payload);
      else await api.post("/appointments", payload);
      toast.success("Appuntamento salvato");
      onDone?.();
    } catch { toast.error("Errore"); }
    finally { setSaving(false); }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "Modifica appuntamento" : "Nuovo appuntamento"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Paziente</label>
          <select data-testid="af-patient" value={form.patient_id} onChange={set("patient_id")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="">— seleziona —</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data e ora</label>
          <input data-testid="af-datetime" type="datetime-local" value={form.scheduled_at} onChange={set("scheduled_at")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Durata (min)</label>
          <input data-testid="af-duration" type="number" min={5} value={form.duration_min} onChange={set("duration_min")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Motivo</label>
          <input data-testid="af-reason" value={form.reason} onChange={set("reason")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Note</label>
          <textarea data-testid="af-notes" rows={2} value={form.notes} onChange={set("notes")} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
      </div>
      <DialogFooter>
        <button data-testid="af-save-btn" onClick={submit} disabled={saving} className="h-10 px-4 rounded-lg bg-df-primary text-white text-sm font-semibold hover:bg-[#1E3A8A] disabled:opacity-60">Salva</button>
      </DialogFooter>
    </DialogContent>
  );
}
