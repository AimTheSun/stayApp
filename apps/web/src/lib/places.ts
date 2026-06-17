import { haversineM } from "./geo";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";

/**
 * Suggest names for a coordinate using OpenStreetMap: nearby named points of
 * interest first (bar, beach, stadium, café…), then the area/neighbourhood as
 * a fallback. Best-effort — returns [] if the lookups fail or are blocked.
 */
export async function suggestPlaceNames(lat: number, lng: number): Promise<string[]> {
  const [pois, rev] = await Promise.all([
    nearbyPois(lat, lng).catch(() => [] as string[]),
    reverse(lat, lng).catch(() => ({ name: null, area: null })),
  ]);
  const out: string[] = [];
  const push = (n: string | null) => {
    if (n && !out.includes(n)) out.push(n);
  };
  push(rev.name); // the named feature you're standing on (most specific)
  for (const n of pois) push(n); // nearby named POIs (alternatives)
  push(rev.area); // neighbourhood / street fallback
  return out.slice(0, 4);
}

interface OverpassEl {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Nearest named POIs within ~90 m, closest first, de-duped by name. */
async function nearbyPois(lat: number, lng: number): Promise<string[]> {
  const kinds = ["amenity", "leisure", "shop", "tourism", "natural"];
  const clauses = kinds
    .map((k) => `nwr(around:90,${lat},${lng})[name][${k}];`)
    .join("");
  const query = `[out:json][timeout:12];(${clauses});out center 50;`;

  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) return [];

  const json = (await res.json()) as { elements?: OverpassEl[] };
  const items = (json.elements ?? [])
    .map((e) => {
      const elat = e.lat ?? e.center?.lat;
      const elon = e.lon ?? e.center?.lon;
      return {
        name: e.tags?.name,
        dist:
          elat != null && elon != null
            ? haversineM(lat, lng, elat, elon)
            : Infinity,
      };
    })
    .filter((x): x is { name: string; dist: number } => Boolean(x.name))
    .sort((a, b) => a.dist - b.dist);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of items) {
    if (!seen.has(x.name)) {
      seen.add(x.name);
      out.push(x.name);
    }
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Reverse-geocode via Nominatim: `name` is the specific feature you're on
 * (a POI/building, e.g. "Oceanário de Lisboa"); `area` is the surrounding
 * neighbourhood/street used as a fallback when there's no specific name.
 */
async function reverse(
  lat: number,
  lng: number,
): Promise<{ name: string | null; area: string | null }> {
  const url = `${NOMINATIM}?lat=${lat}&lon=${lng}&format=jsonv2&zoom=18&addressdetails=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return { name: null, area: null };

  const json = (await res.json()) as {
    name?: string;
    address?: Record<string, string>;
  };
  const a = json.address ?? {};
  const area =
    a.neighbourhood ||
    a.suburb ||
    a.quarter ||
    a.hamlet ||
    a.village ||
    a.town ||
    a.road ||
    a.city ||
    a.county ||
    null;
  // Only treat `name` as a specific POI when it isn't just the street we
  // already surface as the area.
  const name = json.name && json.name !== a.road ? json.name : null;
  return { name, area };
}
