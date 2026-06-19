// Forward-geocode an address to coordinates + a human region, via Nominatim.
// Used at onboarding to save a private "Home" place. Best-effort — null on fail.
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

export interface GeoResult {
  lat: number;
  lng: number;
  region: string | null;
}

export async function geocodeAddress(q: string): Promise<GeoResult | null> {
  const query = q.trim();
  if (!query) return null;
  const url = `${NOMINATIM_SEARCH}?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&limit=1`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const arr = (await res.json()) as {
      lat: string;
      lon: string;
      address?: Record<string, string>;
    }[];
    const r = arr[0];
    if (!r) return null;
    const a = r.address ?? {};
    const region =
      a.city ||
      a.town ||
      a.village ||
      a.municipality ||
      a.county ||
      a.state ||
      a.country ||
      null;
    return { lat: Number(r.lat), lng: Number(r.lon), region };
  } catch {
    return null;
  }
}
