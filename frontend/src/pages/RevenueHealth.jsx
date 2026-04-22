import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { ArrowUpRight, TrendingDown, TrendingUp, Activity } from "lucide-react";
import { HEALTH_DIMENSION_LABELS, getHealthActionRoute, healthCategoryTone } from "../lib/healthScore";

export default function RevenueHealth() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/revenue/health-score").then(({ data }) => setData(data));
  }, []);

  if (!data) return <div className="py-14 text-center text-slate-400" data-testid="health-loading">Caricamento Health Score…</div>;

  const actionHref = getHealthActionRoute(data.recommended_action?.key);
  const isUp = data.trend?.direction !== "down";

  return (
    <div className="space-y-5" data-testid="health-page">
      <div className="rounded-2xl bg-df-primary text-white p-6">
        <div className="text-xs uppercase tracking-[0.18em] text-white/70 font-semibold">Health Score Studio</div>
        <div className="mt-3 flex items-center gap-4">
          <div className="text-5xl font-bold tracking-tight" style={{ fontFamily: "Manrope" }} data-testid="health-score-value">{data.score}</div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${healthCategoryTone(data.category)}`} data-testid="health-category-badge">{data.category}</span>
        </div>
        <div className={`mt-2 inline-flex items-center gap-1 text-sm ${isUp ? "text-emerald-300" : "text-red-300"}`} data-testid="health-trend">
          {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {data.trend.delta_score >= 0 ? "+" : ""}{data.trend.delta_score} vs periodo precedente
        </div>
        <p className="mt-3 text-sm text-white/85" data-testid="health-explanation">{data.explanation}</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="health-breakdown">
        <div className="flex items-center gap-2 mb-3 text-slate-900 font-semibold"><Activity size={16} /> Breakdown score</div>
        <div className="grid sm:grid-cols-2 gap-3">
          {Object.entries(data.subscores).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-200 p-3" data-testid={`health-subscore-${k}`}>
              <div className="text-xs text-slate-500">{HEALTH_DIMENSION_LABELS[k] || k}</div>
              <div className="mt-1 flex items-end justify-between">
                <div className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope" }}>{Math.round(v)}</div>
                <div className="text-xs text-slate-500">/100</div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-df-primary" style={{ width: `${Math.max(2, Math.min(100, v))}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="health-action-card">
        <div className="text-sm font-semibold text-slate-900">Azione consigliata oggi</div>
        <p className="text-xs text-slate-500 mt-1">Intervieni sulla dimensione più debole per alzare il KPI giornaliero.</p>
        <Link
          to={actionHref}
          className="mt-3 inline-flex h-11 px-4 items-center gap-2 rounded-lg bg-df-primary text-white text-sm font-semibold hover:opacity-95"
          data-testid="health-primary-cta"
        >
          {data.recommended_action?.label} <ArrowUpRight size={16} />
        </Link>
      </div>
    </div>
  );
}
