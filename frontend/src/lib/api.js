import axios from "axios";

function getBackendBaseUrl() {
  const configured = (process.env.REACT_APP_BACKEND_URL || "").trim();
  if (configured && configured.toLowerCase() !== "undefined") {
    return configured.replace(/\/+$/, "");
  }

  // In local dev prefer same-origin + CRA proxy to avoid browser CORS noise.
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (isLocal) return "";
  }

  // Same-origin fallback for deployed environments behind a reverse-proxy.
  return "";
}

const BACKEND_URL = getBackendBaseUrl();
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("df_access_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function formatApiError(err) {
  const d = err?.response?.data?.detail;
  if (!d) return err?.message || "Errore imprevisto";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => (e?.msg ? e.msg : JSON.stringify(e))).join(" · ");
  if (d?.msg) return d.msg;
  return String(d);
}
