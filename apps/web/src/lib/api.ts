import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL;

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export interface IngestPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  recorded_at: string; // ISO 8601
}

/** Send a batch of captured location points to the API. */
export function ingestPoints(points: IngestPoint[]) {
  return apiPost<{ inserted: number }>("/ingest", { points });
}

/** Process captured points into stays/places for an optional date range. */
export function detectStays(range?: { from?: string; to?: string }) {
  return apiPost<{ stays: unknown[]; created: number }>("/detect", range ?? {});
}
