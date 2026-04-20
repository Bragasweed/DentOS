import axios from "axios";

function getBackendBaseUrl() {
  const configured = (process.env.REACT_APP_BACKEND_URL || "").trim();
  if (configured && configured.toLowerCase() !== "undefined") {
    return configured.replace(/\/+$/, "");
  }

  // Local DX fallback: CRA on :3000 + FastAPI on :8000.
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const protocol = window.location.protocol || "http:";
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (isLocal) return `${protocol}//${host}:8000`;
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
