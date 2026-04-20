import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useNavigate } from "react-router-dom";
import { Plus, Phone, Mail, Search, Filter } from "lucide-react";
import { PATIENT_STATUS } from "../lib/format";
import { StatusPill } from "../components/StatusPill";
import EmptyState from "../components/EmptyState";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "../components/ui/dialog";

const STATUSES = ["nuovo", "attivo", "in_attesa", "da_richiamare", "inattivo"];

export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    const params = {};
    if (q) params.q = q;
    if (status) params.status = status;
    const { data } = await api.get("/patients", { params });
    setPatients(data);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [q]);

  return (
    <div className="space-y-5" data-testid="patients-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Manrope" }}>Pazienti</h2>
          <p className="text-sm text-slate-500 mt-0.5">Anagrafica e storico. {patients.length} pazienti.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button data-testid="patients-new-btn" className="h-11 px-4 rounded-lg bg-df-primary text-white font-semibold text-sm hover:bg-[#1E3A8A] inline-flex items-center gap-2">
              <Plus size={16} /> Nuovo paziente
            </button>
          </DialogTrigger>
          <PatientForm onDone={() => { setOpen(false); load(); }} />
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            data-testid="patients-search-input"
            placeholder="Cerca per nome…"
            value={q} onChange={(e) => setQ(e.target.value)}
            className="w-full h-11 pl-9 pr-3 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-df-accent"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Filter size={12} /> Stato:</span>
          <Chip active={!status} onClick={() => setStatus("")} testid="filter-all">Tutti</Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)} testid={`filter-${s}`}>
              {PATIENT_STATUS[s].label}
            </Chip>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-14 text-center text-slate-400">Caricamento…</div>
      ) : patients.length === 0 ? (
        <EmptyState
          testid="patients-empty"
          icon={Search}
          title="Nessun paziente trovato"
          description="Prova a cambiare i filtri o crea un nuovo paziente per iniziare."
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="hidden md:grid grid-cols-12 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
            <div className="col-span-4">Paziente</div>
            <div className="col-span-3">Contatti</div>
            <div className="col-span-2">Stato</div>
            <div className="col-span-2">Tag</div>
            <div className="col-span-1 text-right">Rischio</div>
          </div>
          <ul className="divide-y divide-slate-100">
            {patients.map((p) => (
              <li
                key={p.id}
                data-testid={`patient-row-${p.id}`}
                onClick={() => nav(`/pazienti/${p.id}`)}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-0 px-5 py-4 cursor-pointer hover:bg-slate-50 items-center"
              >
                <div className="md:col-span-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-semibold">
                    {(p.full_name || "?").slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{p.full_name}</div>
                    <div className="text-xs text-slate-400 truncate">{p.birth_date || "—"}</div>
                  </div>
                </div>
                <div className="md:col-span-3 text-xs text-slate-500 space-y-0.5">
                  {p.phone && <div className="flex items-center gap-1.5"><Phone size={12} />{p.phone}</div>}
                  {p.email && <div className="flex items-center gap-1.5"><Mail size={12} />{p.email}</div>}
                </div>
                <div className="md:col-span-2">
                  <StatusPill {...PATIENT_STATUS[p.status || "nuovo"]} />
                </div>
                <div className="md:col-span-2 flex flex-wrap gap-1">
                  {(p.tags || []).slice(0, 2).map((t) => (
                    <span key={t} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t}</span>
                  ))}
                </div>
                <div className="md:col-span-1 md:text-right">
                  {p.no_show_risk && <span className="text-[10px] font-semibold status-warning px-2 py-0.5 rounded-full">No-show</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children, testid }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className={`whitespace-nowrap text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${active ? "bg-df-primary text-white border-df-primary" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

export function PatientForm({ onDone, initial }) {
  const [form, setForm] = useState(initial || {
    full_name: "", phone: "", email: "", birth_date: "", notes: "",
    tags: [], status: "nuovo", no_show_risk: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.full_name.trim()) { toast.error("Inserisci nome e cognome"); return; }
    setSubmitting(true);
    try {
      const payload = { ...form, tags: typeof form.tags === "string" ? form.tags.split(",").map((x) => x.trim()).filter(Boolean) : form.tags };
      if (initial?.id) await api.put(`/patients/${initial.id}`, payload);
      else await api.post("/patients", payload);
      toast.success(initial ? "Paziente aggiornato" : "Paziente creato");
      onDone?.();
    } catch (e) {
      toast.error("Errore nel salvataggio");
    } finally { setSubmitting(false); }
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{initial ? "Modifica paziente" : "Nuovo paziente"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Inp label="Nome e cognome" value={form.full_name} onChange={set("full_name")} span testid="pf-name" />
        <Inp label="Telefono" value={form.phone} onChange={set("phone")} testid="pf-phone" />
        <Inp label="Email" type="email" value={form.email} onChange={set("email")} testid="pf-email" />
        <Inp label="Data di nascita" type="date" value={form.birth_date} onChange={set("birth_date")} testid="pf-birth" />
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Stato</label>
          <select data-testid="pf-status" value={form.status} onChange={set("status")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-df-accent">
            {STATUSES.map((s) => <option key={s} value={s}>{PATIENT_STATUS[s].label}</option>)}
          </select>
        </div>
        <Inp label="Tag (virgola)" value={Array.isArray(form.tags) ? form.tags.join(", ") : form.tags} onChange={set("tags")} testid="pf-tags" />
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Note interne</label>
          <textarea data-testid="pf-notes" value={form.notes} onChange={set("notes")} rows={3} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-df-accent" />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" data-testid="pf-risk" checked={!!form.no_show_risk} onChange={(e) => setForm((f) => ({ ...f, no_show_risk: e.target.checked }))} />
          Segnala come rischio no-show
        </label>
      </div>
      <DialogFooter>
        <button data-testid="pf-save-btn" onClick={submit} disabled={submitting} className="h-10 px-4 rounded-lg bg-df-primary text-white text-sm font-semibold hover:bg-[#1E3A8A] disabled:opacity-60">
          {submitting ? "Salvataggio…" : "Salva"}
        </button>
      </DialogFooter>
    </DialogContent>
  );
}

function Inp({ label, span, testid, ...rest }) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      <input data-testid={testid} {...rest} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-df-accent" />
    </div>
  );
}
