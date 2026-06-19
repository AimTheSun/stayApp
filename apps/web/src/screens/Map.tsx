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

interface FriendPlace {
  place_id: string;
  owner_id: string;
  username: string | null;
  avatar_url: string | null;
  label: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  total_s: number;
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

const esc = (s: string) =>
  s.replace(/[<>&"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;",
  );

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
  const [friendPlaces, setFriendPlaces] = useState<FriendPlace[]>([]);
  const [showFriends, setShowFriends] = useState(true);

  const [selected, setSelected] = useState<PlaceWithStats | null>(null);
  const [selFriend, setSelFriend] = useState<FriendPlace | null>(null);
  const [name, setName] = useState("");
  const [radius, setRadius] = useState(100);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState<LeaderRow[] | null>(null);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const [placesRes, staysRes, friendsRes] = await Promise.all([
      supabase.from("places").select("*"),
      supabase
        .from("stays")
        .select("place_id, duration_s")
        .not("left_at", "is", null),
      supabase.rpc("friends_places"),
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

    setFriendPlaces(
      ((friendsRes.data as FriendPlace[]) ?? []).map((f) => ({
        ...f,
        total_s: Number(f.total_s),
        visits: Number(f.visits),
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

  // Draw markers + rings whenever the data (or toggle / readiness) changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !places) return;
    const friends = showFriends ? friendPlaces : [];

    // Rings only for your own places (radius is yours to edit).
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

    // Your places — gold dots.
    for (const p of places) {
      const el = document.createElement("div");
      el.className = "mb-marker";
      el.innerHTML =
        '<span class="map-pin-dot"></span>' +
        `<span class="mb-label">${esc(p.label ?? "Unnamed spot")}</span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelFriend(null);
        setSelected(p);
        setName(p.label ?? "");
        setRadius(Math.round(p.radius_m));
        setHidden(!!p.hidden_from_friends);
      });
      markersRef.current.push(
        new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([p.lng, p.lat])
          .addTo(map),
      );
    }

    // Friends' places — their avatar, ringed in their colour.
    for (const fp of friends) {
      const color = colorForName(fp.username);
      const initial = (fp.username ?? "?").charAt(0).toUpperCase();
      const inner = fp.avatar_url
        ? `<img src="${esc(fp.avatar_url)}" alt="" />`
        : `<span class="mb-avatar-initial" style="color:${color}">${esc(initial)}</span>`;
      const el = document.createElement("div");
      el.className = "mb-marker mb-marker--friend";
      el.innerHTML =
        `<span class="mb-avatar" style="border-color:${color}">${inner}</span>` +
        `<span class="mb-label">${esc(fp.label ?? "Unnamed spot")} · @${esc(fp.username ?? "friend")}</span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelected(null);
        setSelFriend(fp);
      });
      markersRef.current.push(
        new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([fp.lng, fp.lat])
          .addTo(map),
      );
    }

    // Frame everything currently shown.
    const pts: [number, number][] = [
      ...places.map((p) => [p.lng, p.lat] as [number, number]),
      ...friends.map((f) => [f.lng, f.lat] as [number, number]),
    ];
    if (pts.length === 1) {
      map.easeTo({ center: pts[0], zoom: 15.5 });
    } else if (pts.length > 1) {
      const b = new mapboxgl.LngLatBounds();
      for (const p of pts) b.extend(p);
      map.fitBounds(b, { padding: 64, maxZoom: 16, duration: 600 });
    }
  }, [places, friendPlaces, showFriends, ready]);

  // Load the friends-only leaderboard for whichever place is open.
  const target = selected
    ? { lat: selected.lat, lng: selected.lng, radius_m: selected.radius_m }
    : selFriend
      ? { lat: selFriend.lat, lng: selFriend.lng, radius_m: selFriend.radius_m }
      : null;

  useEffect(() => {
    if (!target) {
      setBoard(null);
      return;
    }
    let cancelled = false;
    setBoard(null);
    supabase
      .rpc("place_leaderboard", {
        p_lat: target.lat,
        p_lng: target.lng,
        p_radius_m: target.radius_m,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.lat, target?.lng, target?.radius_m]);

  const close = () => {
    setSelected(null);
    setSelFriend(null);
  };

  async function save() {
    if (!selected) return;
    setBusy(true);
    const patch = {
      label: name.trim() || "Unnamed spot",
      radius_m: radius,
      hidden_from_friends: hidden,
    };
    let res = await supabase.from("places").update(patch).eq("id", selected.id);
    if (res.error && /hidden_from_friends/i.test(res.error.message)) {
      const { hidden_from_friends: _omit, ...rest } = patch;
      res = await supabase.from("places").update(rest).eq("id", selected.id);
    }
    setBusy(false);
    if (res.error) return;
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

  const mineN = places?.length ?? 0;
  const frN = friendPlaces.length;

  return (
    <div className="map-screen">
      <div className="map-head">
        <h2 className="log-title map-title">Places</h2>
        <p className="meta map-sub">
          {places === null
            ? "Loading…"
            : mineN === 0 && frN === 0
              ? "Check in somewhere and it'll show up here."
              : `${mineN} of yours${frN ? ` · ${frN} from friends` : ""} · tap a marker`}
        </p>
        {frN > 0 && (
          <div className="range-tabs map-toggle">
            <button
              className={`range-tab${showFriends ? " range-tab--on" : ""}`}
              onClick={() => setShowFriends(true)}
            >
              Everyone
            </button>
            <button
              className={`range-tab${!showFriends ? " range-tab--on" : ""}`}
              onClick={() => setShowFriends(false)}
            >
              Just me
            </button>
          </div>
        )}
      </div>
      <div className="map-canvas" ref={mapEl} />

      {/* Friend's place — read-only */}
      {selFriend && (
        <div className="sheet-backdrop" onClick={close}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="friend-place-head">
              <span
                className="avatar"
                style={{ borderColor: colorForName(selFriend.username), borderWidth: 2 }}
              >
                {selFriend.avatar_url ? (
                  <img src={selFriend.avatar_url} alt="" />
                ) : (
                  <span
                    className="avatar-initial"
                    style={{ color: colorForName(selFriend.username) }}
                  >
                    {(selFriend.username ?? "?").charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              <div className="friend-place-meta">
                <p className="sheet-place-name">{selFriend.label ?? "Unnamed spot"}</p>
                <p className="meta">@{selFriend.username ?? "friend"}</p>
              </div>
            </div>
            <p className="eyebrow friend-place-time">
              {selFriend.total_s > 0
                ? `${formatDuration(selFriend.total_s)} here · ${selFriend.visits} visit${selFriend.visits === 1 ? "" : "s"}`
                : "No time logged here yet"}
            </p>

            <Board board={board} />

            <div className="sheet-actions">
              <button className="btn btn-primary" onClick={close}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Your place — editable */}
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

            <Board board={board} />

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

            <label className="sheet-toggle">
              <span>
                <strong>Hidden from friends</strong>
                <span className="sheet-toggle-hint">
                  Keep this spot (like home) off your friends' map.
                </span>
              </span>
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
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

function Board({ board }: { board: LeaderRow[] | null }) {
  return (
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
                  <span className="rank-label">{r.is_me ? "You" : `@${r.name}`}</span>
                </span>
                <span className="rank-time">{formatDuration(r.total_s)}</span>
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
  );
}
