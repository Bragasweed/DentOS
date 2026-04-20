import React from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, Tooltip } from "recharts";
import { ArrowRight, BadgeEuro, BellRing, CheckCircle2, Clock3, MessageSquare, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import MarketingShell from "@/components/marketing/MarketingShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const metrics = [
  { label: "preventivi recuperati", value: "+18%" },
  { label: "no-show", value: "-27%" },
  { label: "risparmiate/settimana", value: "+3.4h" },
  { label: "recuperati/mese", value: "€11.424" },
];

const trendData = [
  { mese: "Gen", recuperato: 6200 },
  { mese: "Feb", recuperato: 7800 },
  { mese: "Mar", recuperato: 9600 },
  { mese: "Apr", recuperato: 11424 },
];

const featureBlocks = [
  {
    title: "Agenda e appuntamenti",
    outcome: "-27% no-show",
    bullets: ["Conferme automatiche e promemoria intelligenti", "Vista giornaliera chiara per segreteria e medici", "Riduzione dei buchi agenda nelle ore premium"],
  },
  {
    title: "Preventivi e follow-up",
    outcome: "+18% accettazioni",
    bullets: ["Timeline completa del paziente dal lead alla firma", "Follow-up WhatsApp/email con priorità automatiche", "Visibilità immediata sui preventivi a rischio"],
  },
  {
    title: "Pagamenti e rate",
    outcome: "Incassi più prevedibili",
    bullets: ["Scadenze rate con reminder automatici", "Storico pagamenti centralizzato", "Riduzione ritardi e chiamate manuali"],
  },
  {
    title: "Revenue dashboard",
    outcome: "Decisioni in tempo reale",
    bullets: ["KPI clinica, team e canale in un colpo d'occhio", "Trend mensile di fatturato e conversioni", "Segmentazione pazienti per valore"],
  },
  {
    title: "Automazioni intelligenti",
    outcome: "+3.4h/sett. recuperate",
    bullets: ["Regole su task ripetitivi della segreteria", "Assegnazione automatica dei follow-up", "Alert su pazienti caldi da richiamare"],
  },
];

const testimonials = [
  {
    name: "Dr.ssa Marta Valli",
    clinic: "Studio Odontoiatrico Valli",
    role: "Titolare",
    quote: "Prima avevamo preventivi persi in chat e fogli sparsi. Ora il team sa sempre chi richiamare e quando.",
    result: "+€14.900 recuperati in 90 giorni",
  },
  {
    name: "Dr. Luca Ferrero",
    clinic: "Ferrero Dental Group",
    role: "Direttore sanitario",
    quote: "In 3 settimane abbiamo ridotto i no-show e smesso di rincorrere i pazienti all'ultimo minuto.",
    result: "-31% no-show su igiene e visite",
  },
  {
    name: "Giulia Bianchi",
    clinic: "Clinica Sorriso Milano",
    role: "Clinic manager",
    quote: "La segreteria ha finalmente un flusso unico: meno caos, più conversioni, più controllo sui numeri.",
    result: "+21% preventivi accettati",
  },
];

const faqs = [
  ["Quanto tempo serve per iniziare?", "In genere 3-7 giorni: importiamo i dati, configuriamo automazioni e formiamo il team operativo."],
  ["Posso usarlo dal telefono?", "Sì. Interfaccia mobile-first per titolare e segreteria, senza perdere funzioni fondamentali."],
  ["Funziona con WhatsApp?", "Sì, puoi inviare reminder e follow-up su WhatsApp con tracciamento esiti e test A/B sui messaggi."],
  ["I miei dati sono sicuri?", "Sì. Accessi multi-tenant per studio, permessi per ruolo e policy di accesso centralizzate."],
  ["Serve installare qualcosa?", "No. È una piattaforma cloud: apri il browser, accedi e il team lavora subito."],
  ["Posso provarlo prima?", "Sì, prenoti una demo guidata e impostiamo insieme un piano pilota sui tuoi flussi reali."],
];

function FadeIn({ children, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.4, delay }}>
      {children}
    </motion.div>
  );
}

export default function Landing() {
  return (
    <MarketingShell>
      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-2 md:items-center">
        <FadeIn>
          <Badge className="mb-4 bg-blue-50 text-df-primary">Dental CRM che spinge risultati reali</Badge>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-slate-950 md:text-5xl">
            Recupera più preventivi.
            <span className="block text-df-primary">Riduci i pazienti persi.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
            DentalFlow AI unisce agenda, follow-up e revenue in un solo flusso operativo. Meno lavoro manuale, più preventivi accettati.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-df-primary hover:bg-blue-900" data-testid="landing-cta-book-demo">
              <NavLink to="/pricing">Prenota demo <ArrowRight className="ml-2 h-4 w-4" /></NavLink>
            </Button>
            <Button asChild size="lg" variant="outline" data-testid="landing-cta-watch-how">
              <NavLink to="/demo">Guarda come funziona</NavLink>
            </Button>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            {["Riduci i no-show", "Recupera preventivi persi", "Più follow-up, meno lavoro manuale"].map((label) => (
              <Badge key={label} variant="secondary" className="rounded-full px-3 py-1">{label}</Badge>
            ))}
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <Card className="overflow-hidden border-slate-200 shadow-sm" data-testid="landing-hero-dashboard-preview">
            <CardHeader className="bg-gradient-to-r from-slate-100 to-slate-50 pb-3">
              <CardTitle className="text-base">Preview dashboard: recupero revenue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="recovery" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="mese" axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                    <Tooltip formatter={(value) => [`€${value.toLocaleString("it-IT")}`, "Revenue recuperato"]} />
                    <Area type="monotone" dataKey="recuperato" stroke="#0C315B" fill="url(#recovery)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">Preventivi caldi</p><p className="font-semibold">42</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-500">Task automatici</p><p className="font-semibold">128</p></div>
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      </section>

      <section className="border-y border-slate-200 bg-white py-6">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-3 px-4 sm:grid-cols-4 sm:px-6">
          {metrics.map((m) => (
            <Card key={m.label} className="rounded-2xl" data-testid={`metric-card-${m.label.replace(/[^a-z]/gi, "-").toLowerCase()}`}>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-df-primary">{m.value}</p>
                <p className="text-sm text-slate-500">{m.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-12 sm:px-6 md:grid-cols-2">
        <Card className="rounded-2xl border-rose-200 bg-rose-50/60">
          <CardHeader><CardTitle>Prima: il caos tipico in studio</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>• Preventivi senza follow-up strutturato</p>
            <p>• Agenda piena di buchi e no-show</p>
            <p>• Segreteria sommersa da attività ripetitive</p>
            <p>• Nessuna vista chiara del revenue perso</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-emerald-200 bg-emerald-50/50">
          <CardHeader><CardTitle>Dopo: il flusso DentalFlow</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>• Follow-up automatici per priorità clinica</p>
            <p>• Reminder omnicanale con tracciamento</p>
            <p>• Task chiari per ogni ruolo del team</p>
            <p>• Dashboard con KPI azionabili in tempo reale</p>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          {featureBlocks.map((feature, idx) => (
            <FadeIn key={feature.title} delay={idx * 0.05}>
              <Card className="rounded-2xl" data-testid={`feature-card-${idx + 1}`}>
                <CardHeader>
                  <div className="mb-2 flex items-center gap-2 text-df-primary"><Sparkles className="h-4 w-4" />{feature.outcome}</div>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1 text-sm text-slate-600">
                    {feature.bullets.map((bullet) => (
                      <li className="flex gap-2" key={bullet}><CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />{bullet}</li>
                    ))}
                  </ul>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">Preview modulo: {feature.title}</div>
                </CardContent>
              </Card>
            </FadeIn>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-12">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <Badge className="mb-4 bg-amber-100 text-amber-900">Revenue Recovery Engine</Badge>
          <h2 className="text-3xl font-bold">Recupero preventivi persi, in modo sistematico</h2>
          <p className="mt-2 max-w-3xl text-slate-600">Centro Recupero Preventivi, test A/B su WhatsApp, Revenue Lost Radar e regole automatiche collaborano per riportare in pipeline chi stava uscendo.</p>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {[
              ["Centro Recupero Preventivi", UsersRound],
              ["A/B WhatsApp testing", MessageSquare],
              ["Revenue Lost Radar", BadgeEuro],
              ["Automation rules", BellRing],
            ].map(([label, Icon]) => (
              <Card key={label} className="rounded-2xl">
                <CardContent className="flex items-center gap-2 p-4 text-sm font-medium"><Icon className="h-4 w-4 text-df-primary" />{label}</CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-4 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900">8-12% dei preventivi persi recuperati</p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-3xl font-bold">Cosa dicono i titolari di studio</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {testimonials.map((t) => (
            <Card key={t.name} className="rounded-2xl" data-testid={`testimonial-${t.name.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="space-y-3 p-5">
                <p className="text-sm text-slate-600">“{t.quote}”</p>
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.role} · {t.clinic}</p>
                </div>
                <Badge className="bg-emerald-100 text-emerald-900">{t.result}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
        <Card className="rounded-2xl border-df-primary/20 bg-df-primary text-white">
          <CardContent className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-blue-100">Piani flessibili per studio</p>
              <h3 className="text-2xl font-bold">Scopri il piano più adatto alla tua crescita</h3>
            </div>
            <Button asChild variant="secondary" data-testid="landing-pricing-teaser-cta">
              <NavLink to="/pricing">Vai ai prezzi</NavLink>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <h2 className="text-3xl font-bold">FAQ</h2>
        <Accordion type="single" collapsible className="mt-4 rounded-2xl border bg-white px-4">
          {faqs.map(([q, a]) => (
            <AccordionItem key={q} value={q}>
              <AccordionTrigger>{q}</AccordionTrigger>
              <AccordionContent>{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-14 pt-6 sm:px-6">
        <Card className="overflow-hidden rounded-3xl border-slate-300 bg-gradient-to-r from-slate-900 to-df-primary text-white">
          <CardContent className="flex flex-col gap-4 p-7 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-blue-100">Prenota una demo di 20 minuti</p>
              <h2 className="text-3xl font-extrabold">Scopri quanto revenue stai lasciando sul tavolo</h2>
            </div>
            <Button asChild size="lg" className="bg-white text-slate-900 hover:bg-slate-100" data-testid="landing-final-cta">
              <NavLink to="/pricing"><Clock3 className="mr-2 h-4 w-4" />Prenota demo</NavLink>
            </Button>
          </CardContent>
        </Card>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" />Dati clinica protetti · Accessi per ruolo · Nessuna installazione</div>
      </section>
    </MarketingShell>
  );
}
