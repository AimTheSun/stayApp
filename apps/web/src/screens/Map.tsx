import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { supabase } from "../lib/supabase";
import { formatDuration } from "../lib/format";
import { colorForName } from "../lib/avatarColor";
import type { Place } from "../types";

interface PlaceWithStats extends Place {
  totalS: number;
  visits: number;
}

interface LeaderRow {
  user_id: string;
  name: string;
  avatar_url: string | null;
  total_s: number;
  is_me: boolean;
}

const ACCENT = "#e8b14e";

// Public Mapbox token comes from the build env (apps/web/.env, gitignored) so
// it never lives in source. Restrict it by URL in the Mapbox dashboard.
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

// A circle polygon (lng/lat ring) of a given radius in metres — Mapbox has no
// native metres-radius circle, so we approximate one as GeoJSON.
function circleRing(lat: number, lng: number, radiusM: number, steps = 64) {
  const coords: [number, number][] = [];
  const latR = (radiusM / 6371000) * (180 / Math.PI);
  const lngR = latR / Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([lng + lngR * Math.cos(t), lat + latR * Math.sin(t)]);
  }
  return coords;
}

export default function MapScreen() {
  const [places, setPlaces] = useState<PlaceWithStats[] | null>(null);
  const [selected, setSelected] = useState<PlaceWithStats | null>(null);
  const [name, setName] = useState("");
  const [radius, setRadius] = useState(100);
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState<LeaderRow[] | null>(null);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const [placesRes, staysRes] = await Promise.all([
      supabase.from("places").select("*"),
      supabase
        .from("stays")
        .select("place_id, duration_s")
        .not("left_at", "is", null),
    ]);

    const totals = new Map<string, { totalS: number; visits: number }>();
    for (const s of (staysRes.data ?? []) as {
      place_id: string | null;
      duration_s: number | null;
    }[]) {
      if (!s.place_id) continue;
      const t = totals.get(s.place_id) ?? { totalS: 0, visits: 0 };
      t.totalS += s.duration_s ?? 0;
      t.visits += 1;
      totals.set(s.place_id, t);
    }

    setPlaces(
      ((placesRes.data ?? []) as Place[]).map((p) => ({
        ...p,
        totalS: totals.get(p.id)?.totalS ?? 0,
        visits: totals.get(p.id)?.visits ?? 0,
      })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Create the Mapbox map once, when the container is mounted.
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapEl.current,
      style: "mapbox://styles/mapbox/standard",
      center: [-9.1393, 38.7223], // Lisbon, until places load
      zoom: 12,
      pitch: 0,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    map.addControl(
      new mapboxgl.AttributionControl({ compact: true }),
      "bottom-left",
    );

    map.on("load", () => {
      map.addSource("rings", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "rings-fill",
        type: "fill",
        source: "rings",
        paint: { "fill-color": ACCENT, "fill-opacity": 0.1 },
      });
      map.addLayer({
        id: "rings-line",
        type: "line",
        source: "rings",
        paint: { "line-color": ACCENT, "line-width": 1.5, "line-opacity": 0.5 },
      });
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Draw markers + rings whenever the places (or map readiness) change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !places) return;

    // Refresh ring polygons.
    const src = map.getSource("rings") as mapboxgl.GeoJSONSource | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: places.map((p) => ({
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [circleRing(p.lat, p.lng, p.radius_m)],
        },
      })),
    });

    // Replace markers.
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    for (const p of places) {
      const el = document.createElement("div");
      el.className = "mb-marker";
      el.innerHTML =
        '<span class="map-pin-dot"></span>' +
        `<span class="mb-label">${(p.label ?? "Unnamed spot").replace(/</g, "&lt;")}</span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelected(p);
        setName(p.label ?? "");
        setRadius(Math.round(p.radius_m));
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }

    // Frame the places.
    if (places.length === 1) {
      map.easeTo({ center: [places[0].lng, places[0].lat], zoom: 15.5 });
    } else if (places.length > 1) {
      const b = new mapboxgl.LngLatBounds();
      for (const p of places) b.extend([p.lng, p.lat]);
      map.fitBounds(b, { padding: 64, maxZoom: 16, duration: 600 });
    }
  }, [places, ready]);

  // Load the friends-only leaderboard for the selected place.
  useEffect(() => {
    if (!selected) {
      setBoard(null);
      return;
    }
    let cancelled = false;
    setBoard(null);
    supabase
      .rpc("place_leaderboard", {
        p_lat: selected.lat,
        p_lng: selected.lng,
        p_radius_m: selected.radius_m,
      })
      .then(({ data }) => {
        if (cancelled) return;
        setBoard(
          ((data as LeaderRow[]) ?? []).map((r) => ({
            ...r,
            total_s: Number(r.total_s),
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const close = () => setSelected(null);

  async function save() {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase
      .from("places")
      .update({ label: name.trim() || "Unnamed spot", radius_m: radius })
      .eq("id", selected.id);
    setBusy(false);
    if (error) return;
    close();
    await load();
  }

  async function remove() {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.from("places").delete().eq("id", selected.id);
    setBusy(false);
    if (error) return;
    close();
    await load();
  }

  return (
    <div className="map-screen">
      <div className="map-head">
        <h2 className="log-title map-title">Your places</h2>
        <p className="meta map-sub">
          {places === null
            ? "Loading…"
            : places.length === 0
              ? "Check in somewhere and it'll show up here."
              : `${places.length} place${places.length === 1 ? "" : "s"} · tap a marker to edit`}
        </p>
      </div>
      <div className="map-canvas" ref={mapEl} />

      {selected && (
        <div className="sheet-backdrop" onClick={close}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">
              {selected.totalS > 0
                ? `${formatDuration(selected.totalS)} · ${selected.visits} visit${selected.visits === 1 ? "" : "s"}`
                : "No time logged yet"}
            </p>

            <input
              className="place-input sheet-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name this place"
              maxLength={60}
            />

            <div className="board">
              <p className="eyebrow board-title">Who's been here</p>
              {board === null ? (
                <p className="muted board-msg">…</p>
              ) : board.length === 0 ? (
                <p className="muted board-msg">No time logged here yet.</p>
              ) : (
                <ul className="rank">
                  {board.map((r) => {
                    const c = colorForName(r.is_me ? "you" : r.name);
                    return (
                      <li key={r.user_id} className="rank-row board-row">
                        <span className="board-person">
                          <span
                            className="avatar avatar-sm"
                            style={{ borderColor: c, borderWidth: 2 }}
                          >
                            {r.avatar_url ? (
                              <img src={r.avatar_url} alt="" />
                            ) : (
                              <span className="avatar-initial" style={{ color: c }}>
                                {(r.is_me ? "Y" : r.name).charAt(0).toUpperCase()}
                              </span>
                            )}
                          </span>
                          <span className="rank-label">
                            {r.is_me ? "You" : `@${r.name}`}
                          </span>
                        </span>
                        <span className="rank-time">
                          {formatDuration(r.total_s)}
                        </span>
                        <span className="rank-bar">
                          <span
                            className="rank-bar-fill"
                            style={{
                              width: `${
                                board[0].total_s
                                  ? Math.max(4, (r.total_s / board[0].total_s) * 100)
                                  : 0
                              }%`,
                              background: c,
                            }}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <label className="sheet-radius">
              <span className="sheet-radius-label">
                Radius <strong>{radius} m</strong>
              </span>
              <input
                type="range"
                min={30}
                max={500}
                step={10}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
              />
            </label>

            <div className="sheet-actions">
              <button className="btn btn-primary" disabled={busy} onClick={save}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button className="btn-text" disabled={busy} onClick={close}>
                Cancel
              </button>
            </div>

            <button className="sheet-delete" disabled={busy} onClick={remove}>
              Delete place
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
