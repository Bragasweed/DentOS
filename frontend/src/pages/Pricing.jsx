import React, { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, CircleDollarSign, ShieldCheck } from "lucide-react";
import MarketingShell from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { annualMonthlyEquivalent, annualPlanTotal, fmtPrice } from "@/lib/format";

const plans = [
  {
    name: "Starter",
    monthly: 99,
    desc: "Per studi piccoli",
    features: ["CRM pazienti", "Agenda", "Preventivi", "Pagamenti", "Dashboard base", "Fino a 2 utenti"],
  },
  {
    name: "Growth",
    monthly: 249,
    desc: "Più scelto",
    popular: true,
    features: ["Tutto in Starter", "Centro Recupero Preventivi", "WhatsApp/email reminders", "Revenue dashboard", "Automations", "Fino a 8 utenti"],
  },
  {
    name: "Scale",
    monthly: 499,
    desc: "Per cliniche strutturate",
    features: ["Tutto in Growth", "Multi-location", "Staff illimitato", "Priority support", "AI insights", "Custom onboarding", "API access"],
  },
];

const faq = [
  ["Posso cambiare piano in corso d'anno?", "Sì, upgrade o downgrade in qualsiasi momento con riallineamento pro-rata."],
  ["L'onboarding è incluso?", "Sì, in tutti i piani con livelli diversi in base alla complessità dello studio."],
  ["È previsto supporto umano?", "Sì, chat e supporto dedicato, con priorità sul piano Scale."],
];

export default function Pricing() {
  const [annual, setAnnual] = useState(true);

  const roi = useMemo(() => {
    const monthlyRecovered = 11424;
    const growthCost = annual ? annualMonthlyEquivalent(249) : 249;
    const net = monthlyRecovered - growthCost;
    return { monthlyRecovered, growthCost, net };
  }, [annual]);

  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-950">Prezzi chiari, ROI misurabile</h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">Piattaforma premium per studi dentistici con onboarding assistito e attivazione guidata.</p>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3 rounded-2xl border bg-white p-3">
          <span className={`text-sm ${!annual ? "font-semibold text-slate-900" : "text-slate-500"}`}>Mensile</span>
          <Switch checked={annual} onCheckedChange={setAnnual} data-testid="pricing-toggle-annual" />
          <span className={`text-sm ${annual ? "font-semibold text-slate-900" : "text-slate-500"}`}>Annuale</span>
          <Badge className="bg-emerald-100 text-emerald-900">-20%</Badge>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const annualTotal = annualPlanTotal(plan.monthly);
            const monthlyEquivalent = annualMonthlyEquivalent(plan.monthly);
            return (
              <motion.div key={plan.name} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                <Card className={`h-full rounded-2xl ${plan.popular ? "border-df-primary shadow-lg" : ""}`} data-testid={`pricing-plan-${plan.name.toLowerCase()}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{plan.name}</CardTitle>
                      {plan.popular && <Badge className="bg-df-primary">Più scelto</Badge>}
                    </div>
                    <p className="text-sm text-slate-500">{plan.desc}</p>
                    {annual ? (
                      <div className="pt-2">
                        <div className="text-3xl font-extrabold">{fmtPrice(annualTotal)}</div>
                        <p className="text-sm text-slate-500">/anno</p>
                        <p className="text-xs text-slate-500">equivalenti a {fmtPrice(monthlyEquivalent, { minDecimals: 2, maxDecimals: 2 })}/mese</p>
                      </div>
                    ) : (
                      <div className="flex items-end gap-1 pt-2">
                        <span className="text-3xl font-extrabold">{fmtPrice(plan.monthly)}</span>
                        <span className="text-sm text-slate-500">/mese</span>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2 text-sm">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />{feature}</li>
                      ))}
                    </ul>
                    <Button className="w-full bg-df-primary hover:bg-blue-900" data-testid={`pricing-cta-${plan.name.toLowerCase()}`}>Richiedi attivazione</Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-7 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-2xl">
            <CardHeader><CardTitle>Tabella comparativa</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Funzionalità</TableHead><TableHead>Starter</TableHead><TableHead>Growth</TableHead><TableHead>Scale</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    ["Centro Recupero Preventivi", "—", "✓", "✓"],
                    ["Reminder WhatsApp/email", "—", "✓", "✓"],
                    ["Multi-location", "—", "—", "✓"],
                    ["API access", "—", "—", "✓"],
                    ["Utenti inclusi", "2", "8", "Illimitati"],
                  ].map((row) => (
                    <TableRow key={row[0]}>{row.map((c) => <TableCell key={c}>{c}</TableCell>)}</TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-emerald-200 bg-emerald-50/50" data-testid="pricing-roi-card">
            <CardHeader><CardTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-emerald-700" />Calcolatore ROI (demo)</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-slate-600">Se recuperi {fmtPrice(roi.monthlyRecovered)} al mese:</p>
              <p>Costo piano Growth: <strong>{fmtPrice(roi.growthCost, { minDecimals: annual ? 2 : 0, maxDecimals: annual ? 2 : 0 })}/mese</strong></p>
              <p>Margine netto stimato: <strong className="text-emerald-700">{fmtPrice(roi.net, { minDecimals: annual ? 2 : 0, maxDecimals: annual ? 2 : 0 })}/mese</strong></p>
              <p className="rounded-lg bg-white p-2 text-xs text-slate-500">Stima orientativa basata su dataset demo DentalFlow AI.</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6 rounded-2xl border-amber-200 bg-amber-50/70">
          <CardContent className="flex items-start gap-3 p-5 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-amber-800" />
            Se non recuperi almeno un preventivo nei primi 60 giorni, attiviamo un piano assistito di ottimizzazione workflow con il nostro team.
          </CardContent>
        </Card>

        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {faq.map(([q, a]) => (
            <Card key={q} className="rounded-2xl"><CardContent className="space-y-1 p-4"><p className="font-semibold">{q}</p><p className="text-sm text-slate-600">{a}</p></CardContent></Card>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Button asChild size="lg" className="bg-df-primary hover:bg-blue-900" data-testid="pricing-bottom-cta">
            <NavLink to="/demo">Parla con noi</NavLink>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
