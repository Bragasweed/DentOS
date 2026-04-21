import React from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CalendarCheck2, CheckCircle2, ClipboardList, CreditCard, LineChart, MessageCircle, UserPlus } from "lucide-react";
import MarketingShell from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const steps = [
  {
    title: "Lead enters",
    icon: UserPlus,
    owner: "Vede nuovi lead con priorità e valore stimato.",
    secretary: "Registra il contatto in 20 secondi da desktop o mobile.",
    impact: "+100% lead tracciati",
    data: "Lead: Anna M. · Interesse: Invisalign · Fonte: Instagram",
  },
  {
    title: "Estimate created",
    icon: ClipboardList,
    owner: "Monitora preventivi emessi, aperti e non risposti.",
    secretary: "Crea preventivo, invia riepilogo e imposta task follow-up.",
    impact: "-35% preventivi dimenticati",
    data: "Preventivo #PV-2026-148 · €3.200 · Stato: In attesa",
  },
  {
    title: "Reminder sent",
    icon: MessageCircle,
    owner: "Confronta performance template WhatsApp A/B.",
    secretary: "Invia reminder automatici senza copiare/incollare manualmente.",
    impact: "+22% risposta pazienti",
    data: "Reminder WA inviato ore 18:42 · Template B in test",
  },
  {
    title: "Appointment booked",
    icon: CalendarCheck2,
    owner: "Controlla saturazione agenda e no-show previsti.",
    secretary: "Conferma appuntamento e blocca slot giusto in agenda.",
    impact: "-27% no-show",
    data: "Appuntamento fissato: 24 Apr 2026, ore 17:30",
  },
  {
    title: "Estimate accepted",
    icon: CheckCircle2,
    owner: "Visualizza conversione per medico e tipologia trattamento.",
    secretary: "Aggiorna stato in un click e avvia piano cure.",
    impact: "+18% accettazioni",
    data: "Accettazione firmata digitalmente · 48h dopo follow-up",
  },
  {
    title: "Payment installment tracked",
    icon: CreditCard,
    owner: "Controlla incassi attesi vs reali per settimana.",
    secretary: "Imposta rate e riceve alert su scadenze critiche.",
    impact: "+€11.424/mese recuperati",
    data: "Piano rate: 4 x €800 · prossima scadenza 15 Mag 2026",
  },
];

export default function DemoScript() {
  return (
    <MarketingShell>
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="text-center">
          <Badge className="bg-blue-50 text-df-primary">Demo guidata per vendita</Badge>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">Dal primo contatto all'incasso: demo completa in 6 step</h1>
          <p className="mx-auto mt-3 max-w-3xl text-slate-600">Questa pagina è pensata per mostrare a titolari e clinic manager il percorso premium: demo consulenziale, attivazione e onboarding assistito.</p>
        </div>

        <div className="mt-8 space-y-4">
          {steps.map((step, index) => (
            <motion.div key={step.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35, delay: index * 0.04 }}>
              <Card className="rounded-2xl" data-testid={`demo-step-${index + 1}`}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2"><step.icon className="h-5 w-5 text-df-primary" />{index + 1}. {step.title}</CardTitle>
                    <Badge className="bg-emerald-100 text-emerald-900">Business impact: {step.impact}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border bg-slate-50 p-3 text-sm">
                    <p className="mb-1 font-semibold">Dati demo</p>
                    <p className="text-slate-600">{step.data}</p>
                  </div>
                  <div className="rounded-xl border p-3 text-sm">
                    <p className="mb-1 font-semibold">Cosa vede il titolare</p>
                    <p className="text-slate-600">{step.owner}</p>
                  </div>
                  <div className="rounded-xl border p-3 text-sm">
                    <p className="mb-1 font-semibold">Cosa fa la segreteria</p>
                    <p className="text-slate-600">{step.secretary}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <Card className="mt-8 rounded-2xl border-df-primary/20 bg-df-primary text-white">
          <CardContent className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-blue-100">Chiudi la demo con numeri concreti</p>
              <h2 className="text-2xl font-bold">Mostra come passare da gestione manuale a controllo completo del revenue</h2>
            </div>
            <LineChart className="h-7 w-7 text-blue-100" />
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <Button asChild size="lg" className="bg-df-primary hover:bg-blue-900" data-testid="demo-final-cta">
            <NavLink to="/pricing">Richiedi attivazione <ArrowRight className="ml-2 h-4 w-4" /></NavLink>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
