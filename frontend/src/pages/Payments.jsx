import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { Plus, Wallet, CheckCircle2, AlertCircle } from "lucide-react";
import { fmtDate, fmtEUR, todayISO } from "../lib/format";
import EmptyState from "../components/EmptyState";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "../components/ui/dialog";

export default function Payments() {
  const [rows, setRows] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [p, o] = await Promise.all([api.get("/payments"), api.get("/payments/overdue")]);
    setRows(p.data);
    setOverdue(o.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    let total = 0, paid = 0, overdueAmt = 0;
    rows.forEach((r) => { total += r.total_amount; paid += r.paid_amount; });
    overdue.forEach((o) => { overdueAmt += o.amount; });
    return { total, paid, residue: total - paid, overdueAmt };
  }, [rows, overdue]);

  return (
    <div className="space-y-5" data-testid="payments-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Manrope" }}>Pagamenti</h2>
          <p className="text-sm text-slate-500 mt-0.5">Saldi, rate e scadenze.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button data-testid="payments-new-btn" className="h-11 px-4 rounded-lg bg-df-primary text-white font-semibold text-sm hover:bg-[#1E3A8A] inline-flex items-center gap-2">
              <Plus size={16} /> Nuovo piano
            </button>
          </DialogTrigger>
          <PaymentForm onDone={() => { setOpen(false); load(); }} />
        </Dialog>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Totale fatturato" value={fmtEUR(totals.total)} />
        <Card label="Incassato" value={fmtEUR(totals.paid)} tone="emerald" />
        <Card label="Residuo da incassare" value={fmtEUR(totals.residue)} tone="amber" />
        <Card label="Scaduto" value={fmtEUR(totals.overdueAmt)} tone="red" />
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200">
          <div className="px-5 py-4 border-b border-red-100 flex items-center gap-2">
            <AlertCircle size={16} className="text-red-600" />
            <h3 className="text-sm font-bold text-red-800" style={{ fontFamily: "Manrope" }}>Da sollecitare — {overdue.length} rate scadute</h3>
          </div>
          <ul className="divide-y divide-red-50">
            {overdue.map((o) => (
              <li key={o.id} data-testid={`overdue-${o.id}`} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-red-50/30">
                <div>
                  <Link to={`/pazienti/${o.patient_id}`} className="text-sm font-medium text-slate-900 hover:underline">{o.patient_name}</Link>
                  <div className="text-xs text-slate-500">Rata {o.number} · scadenza {fmtDate(o.due_date)}</div>
                </div>
                <div className="text-sm font-bold text-red-700">{fmtEUR(o.amount)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="py-14 text-center text-slate-400">Caricamento…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Wallet} title="Nessun piano di pagamento" description="Crea un piano rate per iniziare a monitorare i pagamenti." testid="payments-empty" />
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <div key={p.id} data-testid={`payment-row-${p.id}`} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <Link to={`/pazienti/${p.patient_id}`} className="text-sm font-semibold text-slate-900 hover:underline">{p.patient_name}</Link>
                  <div className="text-xs text-slate-500">{p.installments} rate · creato il {fmtDate(p.created_at)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Pagato / Totale</div>
                  <div className="text-sm font-bold" style={{ fontFamily: "Manrope" }}>{fmtEUR(p.paid_amount)} / {fmtEUR(p.total_amount)}</div>
                </div>
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-df-primary" style={{ width: `${Math.min(100, (p.paid_amount / p.total_amount) * 100)}%` }} />
              </div>
              {p.installments_list?.length > 0 && (
                <ul className="mt-4 divide-y divide-slate-100 text-sm">
                  {p.installments_list.map((i) => {
                    const overdueFlag = !i.paid && i.due_date < todayISO();
                    return (
                      <li key={i.id} className="py-2 flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <div className="text-sm">Rata {i.number} <span className="text-slate-500">· {fmtDate(i.due_date)}</span></div>
                          {overdueFlag && <div className="text-[10px] font-semibold text-red-600 uppercase">Scaduta</div>}
                        </div>
                        <div className={`text-sm font-semibold ${i.paid ? "text-emerald-600" : overdueFlag ? "text-red-600" : "text-slate-700"}`}>{fmtEUR(i.amount)}</div>
                        <button
                          data-testid={`inst-toggle-${i.id}`}
                          onClick={async () => {
                            try { await api.put(`/installments/${i.id}/pay`, { paid: !i.paid }); toast.success(i.paid ? "Segnata non pagata" : "Rata pagata"); load(); }
                            catch { toast.error("Errore"); }
                          }}
                          className={`h-8 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1 ${i.paid ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-df-primary text-white hover:bg-[#1E3A8A]"}`}
                        >
                          {i.paid ? <><CheckCircle2 size={12} /> Pagata</> : "Segna pagata"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ label, value, tone = "slate" }) {
  const toneMap = { slate: "text-slate-900", emerald: "text-emerald-600", amber: "text-amber-600", red: "text-red-600" };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-2 text-xl sm:text-2xl font-bold tracking-tight ${toneMap[tone]}`} style={{ fontFamily: "Manrope" }}>{value}</div>
    </div>
  );
}

function PaymentForm({ onDone }) {
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({ patient_id: "", total_amount: 0, installments: 3, paid_amount: 0, notes: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get("/patients").then(({ data }) => setPatients(data)); }, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.patient_id || !form.total_amount) { toast.error("Paziente e importo obbligatori"); return; }
    setSaving(true);
    try {
      await api.post("/payments", { ...form, total_amount: Number(form.total_amount), installments: Number(form.installments), paid_amount: Number(form.paid_amount) });
      toast.success("Piano creato");
      onDone?.();
    } catch { toast.error("Errore"); }
    finally { setSaving(false); }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nuovo piano di pagamento</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Paziente</label>
          <select data-testid="pmf-patient" value={form.patient_id} onChange={set("patient_id")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white">
            <option value="">— seleziona —</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Importo totale (€)</label>
          <input data-testid="pmf-total" type="number" step="0.01" value={form.total_amount} onChange={set("total_amount")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Numero rate</label>
          <input data-testid="pmf-installments" type="number" min={1} max={60} value={form.installments} onChange={set("installments")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Note</label>
          <textarea rows={2} value={form.notes} onChange={set("notes")} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
      </div>
      <DialogFooter>
        <button data-testid="pmf-save-btn" onClick={submit} disabled={saving} className="h-10 px-4 rounded-lg bg-df-primary text-white text-sm font-semibold hover:bg-[#1E3A8A] disabled:opacity-60">Crea piano</button>
      </DialogFooter>
    </DialogContent>
  );
}
