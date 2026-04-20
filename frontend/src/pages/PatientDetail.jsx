import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { ArrowLeft, Phone, Mail, Calendar, FileText, Wallet, Plus, Edit3, PhoneCall } from "lucide-react";
import { fmtDate, fmtEUR, fmtTime, PATIENT_STATUS, ESTIMATE_STATUS, APPT_STATUS, ROLE_LABELS } from "../lib/format";
import { StatusPill } from "../components/StatusPill";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { PatientForm } from "./Patients";

export default function PatientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/patients/${id}`);
      setData(data);
    } catch {
      toast.error("Paziente non trovato");
      nav("/pazienti");
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!data) return <div className="py-10 text-center text-slate-400">Caricamento…</div>;
  const { patient, appointments, estimates, payments, call_logs } = data;

  return (
    <div className="space-y-6" data-testid="patient-detail-page">
      <button onClick={() => nav(-1)} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft size={14} /> Indietro
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 flex flex-col sm:flex-row gap-4 sm:items-center">
        <div className="w-16 h-16 rounded-full bg-df-primary/10 text-df-primary flex items-center justify-center font-bold text-2xl" style={{ fontFamily: "Manrope" }}>
          {(patient.full_name || "?").slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 truncate" style={{ fontFamily: "Manrope" }}>{patient.full_name}</h2>
            <StatusPill {...PATIENT_STATUS[patient.status || "nuovo"]} testid="pd-status" />
            {patient.no_show_risk && <span className="text-[10px] font-semibold status-warning px-2 py-0.5 rounded-full">Rischio no-show</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-slate-500">
            {patient.phone && <a href={`tel:${patient.phone}`} className="inline-flex items-center gap-1 hover:text-df-primary"><Phone size={14} />{patient.phone}</a>}
            {patient.email && <a href={`mailto:${patient.email}`} className="inline-flex items-center gap-1 hover:text-df-primary"><Mail size={14} />{patient.email}</a>}
            {patient.birth_date && <span className="inline-flex items-center gap-1"><Calendar size={14} />{fmtDate(patient.birth_date)}</span>}
          </div>
          {patient.notes && <p className="mt-2 text-sm text-slate-600">{patient.notes}</p>}
          <div className="mt-2 flex flex-wrap gap-1">
            {(patient.tags || []).map((t) => <span key={t} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t}</span>)}
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={callOpen} onOpenChange={setCallOpen}>
            <DialogTrigger asChild>
              <button data-testid="pd-new-call-btn" className="h-10 px-3 rounded-lg bg-sky-50 text-sky-700 font-semibold text-sm hover:bg-sky-100 inline-flex items-center gap-2"><PhoneCall size={14} /> Log chiamata</button>
            </DialogTrigger>
            <CallLogForm patientId={patient.id} onDone={() => { setCallOpen(false); load(); }} />
          </Dialog>
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <button data-testid="pd-edit-btn" className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-semibold hover:bg-slate-50 inline-flex items-center gap-2"><Edit3 size={14} /> Modifica</button>
            </DialogTrigger>
            <PatientForm initial={patient} onDone={() => { setEditOpen(false); load(); }} />
          </Dialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="timeline">
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="timeline" data-testid="pd-tab-timeline">Timeline</TabsTrigger>
          <TabsTrigger value="estimates" data-testid="pd-tab-estimates">Preventivi ({estimates.length})</TabsTrigger>
          <TabsTrigger value="appointments" data-testid="pd-tab-appts">Appuntamenti ({appointments.length})</TabsTrigger>
          <TabsTrigger value="payments" data-testid="pd-tab-payments">Pagamenti ({payments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <Timeline appointments={appointments} estimates={estimates} callLogs={call_logs} />
        </TabsContent>

        <TabsContent value="estimates" className="mt-4">
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {estimates.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Nessun preventivo.</div> : estimates.map((e) => (
              <div key={e.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{e.title}</div>
                  <div className="text-xs text-slate-500">Presentato {fmtDate(e.presented_at)} {e.next_followup_date ? `· Follow-up ${fmtDate(e.next_followup_date)}` : ""}</div>
                </div>
                <div className="text-sm font-semibold">{fmtEUR(e.total_amount)}</div>
                <StatusPill {...ESTIMATE_STATUS[e.status]} />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="appointments" className="mt-4">
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {appointments.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Nessun appuntamento.</div> : appointments.map((a) => (
              <div key={a.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{fmtDate(a.scheduled_at)} · {fmtTime(a.scheduled_at)}</div>
                  <div className="text-xs text-slate-500">{a.reason || "Visita"} · {a.duration_min}′</div>
                </div>
                <StatusPill {...APPT_STATUS[a.status]} />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <div className="space-y-3">
            {payments.length === 0 ? <div className="p-8 text-center text-sm text-slate-400 bg-white rounded-xl border border-slate-200">Nessun pagamento registrato.</div> : payments.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{fmtEUR(p.total_amount)} · {p.installments} rate</div>
                    <div className="text-xs text-slate-500">Pagato {fmtEUR(p.paid_amount)} · Residuo {fmtEUR(p.total_amount - p.paid_amount)}</div>
                  </div>
                </div>
                {p.installments_list?.length > 0 && (
                  <ul className="mt-3 text-xs divide-y divide-slate-100 border-t border-slate-100">
                    {p.installments_list.map((i) => (
                      <li key={i.id} className="py-2 flex items-center justify-between">
                        <span>Rata {i.number} · scadenza {fmtDate(i.due_date)}</span>
                        <span className={`font-semibold ${i.paid ? "text-emerald-600" : new Date(i.due_date) < new Date() ? "text-red-600" : "text-slate-600"}`}>
                          {fmtEUR(i.amount)} {i.paid ? "✓" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Timeline({ appointments, estimates, callLogs }) {
  const items = [
    ...appointments.map((a) => ({ ts: a.scheduled_at, type: "appt", data: a })),
    ...estimates.map((e) => ({ ts: e.created_at, type: "est", data: e })),
    ...callLogs.map((c) => ({ ts: c.created_at, type: "call", data: c })),
  ].sort((a, b) => new Date(b.ts) - new Date(a.ts));

  if (items.length === 0) return <div className="p-8 text-center text-sm text-slate-400 bg-white rounded-xl border border-slate-200">Nessuna attività ancora.</div>;

  return (
    <ol className="relative border-l-2 border-slate-200 ml-3 space-y-4">
      {items.map((it, i) => (
        <li key={i} className="pl-5 relative">
          <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-df-primary border-2 border-white" />
          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{fmtDate(it.ts)}</span>
              <span>·</span>
              <span className="font-semibold">
                {it.type === "appt" && "Appuntamento"}
                {it.type === "est" && "Preventivo"}
                {it.type === "call" && "Chiamata"}
              </span>
            </div>
            {it.type === "appt" && <div className="mt-1 text-sm">{it.data.reason || "Visita"} — <span className="text-slate-500">{APPT_STATUS[it.data.status].label}</span></div>}
            {it.type === "est" && <div className="mt-1 text-sm">{it.data.title} · {fmtEUR(it.data.total_amount)} — <span className="text-slate-500">{ESTIMATE_STATUS[it.data.status].label}</span></div>}
            {it.type === "call" && (
              <div className="mt-1 text-sm">
                <span className="capitalize">{it.data.outcome.replace("_", " ")}</span> {it.data.notes && <span className="text-slate-600">— {it.data.notes}</span>}
                {it.data.next_step && <div className="text-xs text-slate-500 mt-0.5">Prossimo step: {it.data.next_step}</div>}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CallLogForm({ patientId, onDone }) {
  const [outcome, setOutcome] = useState("contattato");
  const [notes, setNotes] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api.post("/call-logs", { patient_id: patientId, outcome, notes, next_step: nextStep, next_step_date: nextDate || null });
      toast.success("Chiamata registrata");
      onDone?.();
    } catch { toast.error("Errore"); }
    finally { setSaving(false); }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Registra chiamata</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Esito</label>
          <select data-testid="cl-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="contattato">Contattato</option>
            <option value="non_risposto">Non risposto</option>
            <option value="richiamare">Da richiamare</option>
            <option value="concluso">Concluso</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Note</label>
          <textarea data-testid="cl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Prossimo step</label>
          <input data-testid="cl-next" value={nextStep} onChange={(e) => setNextStep(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data prossimo step</label>
          <input type="date" data-testid="cl-next-date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
      </div>
      <DialogFooter>
        <button data-testid="cl-save-btn" onClick={submit} disabled={saving} className="h-10 px-4 rounded-lg bg-df-primary text-white text-sm font-semibold hover:bg-[#1E3A8A] disabled:opacity-60">Salva</button>
      </DialogFooter>
    </DialogContent>
  );
}
