import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import { supabase } from "../lib/supabase";
import { formatDuration } from "../lib/format";
import type { Place } from "../types";

interface PlaceWithStats extends Place {
  totalS: number;
  visits: number;
}

interface LeaderRow {
  user_id: string;
  name: string;
  total_s: number;
  is_me: boolean;
}

const ACCENT = "#e8b14e";

export default function MapScreen() {
  const [places, setPlaces] = useState<PlaceWithStats[] | null>(null);
  const [selected, setSelected] = useState<PlaceWithStats | null>(null);
  const [name, setName] = useState("");
  const [radius, setRadius] = useState(100);
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState<LeaderRow[] | null>(null);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

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

  // Build the Leaflet map whenever the places change.
  useEffect(() => {
    if (!mapEl.current || !places || places.length === 0) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(mapEl.current, { zoomControl: false });
    mapRef.current = map;

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "&copy; OpenStreetMap &copy; CARTO", maxZoom: 19 },
    ).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const icon = L.divIcon({
      className: "map-pin",
      html: '<span class="map-pin-dot"></span>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    const points: [number, number][] = [];
    for (const p of places) {
      points.push([p.lat, p.lng]);
      L.circle([p.lat, p.lng], {
        radius: p.radius_m,
        color: ACCENT,
        weight: 1,
        opacity: 0.4,
        fillColor: ACCENT,
        fillOpacity: 0.08,
      }).addTo(map);

      L.marker([p.lat, p.lng], { icon })
        .addTo(map)
        .on("click", () => {
          setSelected(p);
          setName(p.label ?? "");
          setRadius(Math.round(p.radius_m));
        });
    }

    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 });
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [places]);

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

  if (places === null) return <div className="center muted">…</div>;

  if (places.length === 0) {
    return (
      <div className="center">
        <p className="empty-title">No places yet.</p>
        <p className="muted">Check in somewhere and it'll show up on the map.</p>
      </div>
    );
  }

  return (
    <div className="map-screen">
      <div className="map-head">
        <h2 className="log-title map-title">Your places</h2>
        <p className="meta map-sub">
          {places.length} place{places.length === 1 ? "" : "s"} · tap a marker to
          edit
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
                  {board.map((r) => (
                    <li key={r.user_id} className="rank-row">
                      <span className="rank-label">
                        {r.is_me ? "You" : `@${r.name}`}
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
                          }}
                        />
                      </span>
                    </li>
                  ))}
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
