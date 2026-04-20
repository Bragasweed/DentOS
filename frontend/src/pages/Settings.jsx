import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Plus, UserPlus, Building2 } from "lucide-react";
import { ROLE_LABELS } from "../lib/format";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "../components/ui/dialog";

export default function Settings() {
  const { user, studio } = useAuth();
  const [team, setTeam] = useState([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await api.get("/auth/team");
    setTeam(data);
  };
  useEffect(() => { load(); }, []);

  const canInvite = user?.role === "admin_studio";

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Manrope" }}>Impostazioni</h2>
        <p className="text-sm text-slate-500 mt-0.5">Profilo studio e gestione del team.</p>
      </div>

      {/* Studio card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-df-primary/10 text-df-primary flex items-center justify-center">
            <Building2 size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Profilo studio</h3>
            <p className="text-xs text-slate-500">Queste informazioni compariranno nei documenti.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase">Nome</div>
            <div className="mt-1 text-slate-900">{studio?.name || "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase">Città</div>
            <div className="mt-1 text-slate-900">{studio?.city || "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase">Telefono</div>
            <div className="mt-1 text-slate-900">{studio?.phone || "—"}</div>
          </div>
        </div>
      </div>

      {/* Team */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>Team</h3>
            <p className="text-xs text-slate-500">{team.length} collaboratori con accesso allo studio.</p>
          </div>
          {canInvite && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button data-testid="team-invite-btn" className="h-10 px-3 rounded-lg bg-df-primary text-white text-sm font-semibold hover:bg-[#1E3A8A] inline-flex items-center gap-2">
                  <UserPlus size={14} /> Invita
                </button>
              </DialogTrigger>
              <InviteForm onDone={() => { setOpen(false); load(); }} />
            </Dialog>
          )}
        </div>
        <ul className="divide-y divide-slate-100">
          {team.map((m) => (
            <li key={m.id} className="px-5 py-3 flex items-center gap-3" data-testid={`team-row-${m.id}`}>
              <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-semibold">
                {(m.full_name || "?").slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{m.full_name}</div>
                <div className="text-xs text-slate-500 truncate">{m.email}</div>
              </div>
              <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700">{ROLE_LABELS[m.role] || m.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function InviteForm({ onDone }) {
  const [form, setForm] = useState({ full_name: "", email: "", role: "segreteria", password: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.full_name || !form.email || form.password.length < 6) { toast.error("Compila tutti i campi. Password minimo 6 caratteri."); return; }
    setSaving(true);
    try {
      await api.post("/auth/invite", form);
      toast.success("Membro aggiunto al team");
      onDone?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Errore"); }
    finally { setSaving(false); }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Invita collaboratore</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome completo</label>
          <input data-testid="inv-name" value={form.full_name} onChange={set("full_name")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
          <input data-testid="inv-email" type="email" value={form.email} onChange={set("email")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Ruolo</label>
          <select data-testid="inv-role" value={form.role} onChange={set("role")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white">
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password temporanea</label>
          <input data-testid="inv-pwd" type="text" value={form.password} onChange={set("password")} className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm" />
        </div>
      </div>
      <DialogFooter>
        <button data-testid="inv-save-btn" onClick={submit} disabled={saving} className="h-10 px-4 rounded-lg bg-df-primary text-white text-sm font-semibold hover:bg-[#1E3A8A] disabled:opacity-60">Aggiungi</button>
      </DialogFooter>
    </DialogContent>
  );
}
