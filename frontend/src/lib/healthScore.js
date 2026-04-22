export const HEALTH_DIMENSION_LABELS = {
  acceptance_rate: "Accettazione preventivi",
  revenue_trend: "Trend revenue",
  closing_speed: "Velocità chiusura",
  no_show_rate: "No-show",
};

export function getHealthActionRoute(actionKey) {
  switch (actionKey) {
    case "open_agenda":
      return "/appuntamenti";
    case "open_estimate_recovery":
      return "/recupero";
    case "open_revenue_lost_radar":
      return "/revenue/radar";
    case "open_revenue_dashboard":
    default:
      return "/revenue";
  }
}

export function healthCategoryTone(category) {
  if (category === "Ottimo") return "bg-emerald-100 text-emerald-800";
  if (category === "Buono") return "bg-sky-100 text-sky-800";
  if (category === "Attenzione") return "bg-amber-100 text-amber-900";
  return "bg-red-100 text-red-800";
}
