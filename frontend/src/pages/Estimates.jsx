import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { Plus, Phone, Filter, FileText } from "lucide-react";
import { ESTIMATE_STATUS, fmtDate, fmtEUR } from "../lib/format";
import { StatusPill } from "../components/StatusPill";
import EmptyState from "../components/EmptyState";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "../components/ui/dialog";

const STATUSES = ["bozza", "presentato", "in_attesa", "accettato", "rifiutato", "scaduto"];

export default function Estimates() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (status) params.status = status;
    const { data } = await api.get("/estimates", { params });
    setRows(data);
    setLoading(false);
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const totals = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + r.total_amount; return acc; }, {});

  return (
    <div className="space-y-5" data-testid="estimates-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Manrope" }}>Preventivi</h2>
          <p className="text-sm text-slate-500 mt-0.5">{rows.length} preventivi totali.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button data-testid="estimates-new-btn" className="h-11 px-4 rounded-lg bg-df-primary text-white font-semibold text-sm hover:bg-[#1E3A8A] inline-flex items-center gap-2">
              <Plus size={16} /> Nuovo preventivo
            </button>
          </DialogTrigger>
          <EstimateForm onDone={() => { setOpen(false); load(); }} />
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Summary label="In trattativa" value={fmtEUR((totals.presentato || 0) + (totals.in_attesa || 0))} tone="status-info" />
        <Summary label="Accettati" value={fmtEUR(totals.accettato || 0)} tone="status-success" />
        <Summary label="Persi" value={fmtEUR(totals.rifiutato || 0)} tone="status-danger" />
        <Summary label="Scaduti" value={fmtEUR(totals.scaduto || 0)} tone="status-warning" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Filter size={12} /> Stato:</span>
        <Chip active={!status} onClick={() => setStatus("")} testid="est-filter-all">Tutti</Chip>
        {STATUSES.map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)} testid={`est-filter-${s}`}>
            {ESTIMATE_STATUS[s].label}
          </Chip>
        ))}
      </div>

      {loading ? (
        <div className="py-14 text-center text-slate-400">Caricamento…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="Nessun preventivo" description="Crea il primo preventivo e imposta un follow-up." testid="estimates-empty" />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {rows.map((e) => (
              <li key={e.id} data-testid={`est-row-${e.id}`} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link to={`/pazienti/${e.patient_id}`} className="text-sm font-medium text-slate-900 hover:underline truncate">{e.patient_name}</Link>
                    <StatusPill {...ESTIMATE_STATUS[e.status]} />
                  </div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">{e.title}</div>
                  {e.commercial_notes && <div className="text-xs text-slate-400 truncate">📝 {e.commercial_notes}</div>}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {e.next_followup_date && (
                    <span className={`text-xs font-semibold px-2 py-1 rounded-md ${new Date(e.next_followup_date) <= new Date() ? "status-warning" : "status-info"}`}>
                      Richiamo {fmtDate(e.next_followup_date)}
                    </span>
                  )}
                  <span className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope" }}>{fmtEUR(e.total_amount)}</span>
                  <EditButton est={e} onDone={load} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EditButton({ est, onDone }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button data-testid={`est-edit-${est.id}`} className="text-xs font-semibold text-df-primary hover:underline">Modifica</button>
      </DialogTrigger>
      <EstimateForm initial={est} onDone={() => { setOpen(false); onDone(); }} />
    </Dialog>
  );
}

function Summary({ label, value, tone }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-2 inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${tone}`}>{label}</div>
      <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Manrope" }}>{value}</div>
    </div>
  );
}

function Chip({ active, onClick, children, testid }) {
  return (
    <button data-testid={testid} onClick={onClick} className={`whitespace-nowrap text-xs font-semibold px-3 py-1.5 rounded-full border ${active ? "bg-df-primary text-white border-df-primary" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
      {children}
    </button>
  );
}

export function EstimateForm({ initial, onDone }) {
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState(initial || {
    patient_id: "", title: "", total_amount: 0, status: "presentato",
    presented_at: new Date().toISOString().slice(0, 10),
    commercial_notes: "", rejection_reason: "", next_followup_date: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/patients").then(({ data }) => setPatients(data)); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.patient_id || !form.title) { toast.error("Paziente e titolo sono obbligatori"); return; }
    setSaving(true);
    try {
      const payload = { ...form, total_amount: Number(form.total_amount) };
      if (!payload.next_followup_date) payload.next_followup_date = null;
      if (!payload.presented_at) payload.presented_at = null;
      if (initial?.id) await api.put(`/estimates/${initial.id}`, payload);
      else await api.post("/estimates", payload);
      toast.success(initial ? "Preventivo aggiornato" : "Preventivo creato");
      onDone?.();
    } catch { toast.error("Errore"); }
    finally { setSaving(false); }
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{initial ? "Modifica preventivo" : "Nuovo preventivo"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Paziente</label>
          <select data-testid="ef-patient" value={form.patient_id} onChange={set("patient_id")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="">— seleziona —</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Titolo / descrizione</label>
          <input data-testid="ef-title" value={form.title} onChange={set("title")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Importo (€)</label>
          <input data-testid="ef-amount" type="number" step="0.01" value={form.total_amount} onChange={set("total_amount")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Stato</label>
          <select data-testid="ef-status" value={form.status} onChange={set("status")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white">
            {STATUSES.map((s) => <option key={s} value={s}>{ESTIMATE_STATUS[s].label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data presentazione</label>
          <input data-testid="ef-presented" type="date" value={form.presented_at || ""} onChange={set("presented_at")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Prossimo follow-up</label>
          <input data-testid="ef-followup" type="date" value={form.next_followup_date || ""} onChange={set("next_followup_date")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Note commerciali</label>
          <textarea data-testid="ef-notes" rows={2} value={form.commercial_notes} onChange={set("commercial_notes")} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        {form.status === "rifiutato" && (
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Motivo mancata accettazione</label>
            <input data-testid="ef-reason" value={form.rejection_reason} onChange={set("rejection_reason")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
          </div>
        )}
      </div>
      <DialogFooter>
        <button data-testid="ef-save-btn" onClick={submit} disabled={saving} className="h-10 px-4 rounded-lg bg-df-primary text-white text-sm font-semibold hover:bg-[#1E3A8A] disabled:opacity-60">Salva</button>
      </DialogFooter>
    </DialogContent>
  );
}
