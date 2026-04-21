const currency = (n, options = {}) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    ...options,
  }).format(Number(n) || 0);

export const fmtEUR = (n) => currency(n, { maximumFractionDigits: 0 });

export const fmtEUR2 = (n) =>
  currency(n, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const fmtPrice = (n, { maxDecimals = 0, minDecimals = 0 } = {}) =>
  currency(n, {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });

export const annualPlanTotal = (monthly) => monthly * 12 * 0.8;
export const annualMonthlyEquivalent = (monthly) => annualPlanTotal(monthly) / 12;

export const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
};

export const fmtDateShort = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
};

export const fmtTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};

export const fmtDateTime = (iso) => `${fmtDate(iso)} · ${fmtTime(iso)}`;

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const ROLE_LABELS = {
  admin_studio: "Titolare studio",
  segreteria: "Segreteria",
  dentista: "Dentista",
  amministrazione: "Amministrazione",
};

export const PATIENT_STATUS = {
  nuovo: { label: "Nuovo", cls: "status-info" },
  attivo: { label: "Attivo", cls: "status-success" },
  in_attesa: { label: "In attesa", cls: "status-warning" },
  da_richiamare: { label: "Da richiamare", cls: "status-warning" },
  inattivo: { label: "Inattivo", cls: "status-neutral" },
};

export const ESTIMATE_STATUS = {
  bozza: { label: "Bozza", cls: "status-neutral" },
  presentato: { label: "Presentato", cls: "status-info" },
  in_attesa: { label: "In attesa", cls: "status-warning" },
  accettato: { label: "Accettato", cls: "status-success" },
  rifiutato: { label: "Rifiutato", cls: "status-danger" },
  scaduto: { label: "Scaduto", cls: "status-danger" },
};

export const APPT_STATUS = {
  programmato: { label: "Programmato", cls: "status-info" },
  confermato: { label: "Confermato", cls: "status-success" },
  completato: { label: "Completato", cls: "status-neutral" },
  cancellato: { label: "Cancellato", cls: "status-danger" },
  no_show: { label: "No-show", cls: "status-danger" },
};
