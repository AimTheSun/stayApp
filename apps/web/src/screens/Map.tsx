import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { supabase } from "../lib/supabase";
import { formatDuration } from "../lib/format";
import { colorForName } from "../lib/avatarColor";
import Avatar from "../components/Avatar";
import PlaceAlbum from "../components/PlaceAlbum";
import type { Place } from "../types";

interface PlaceWithStats extends Place {
  totalS: number;
  visits: number;
  photoCount: number;
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
  photo_count: number;
}

interface MyProfile {
  username: string | null;
  avatar_url: string | null;
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
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [uid, setUid] = useState<string | null>(null);

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
    const { data: userData } = await supabase.auth.getUser();
    const id = userData.user?.id ?? null;
    setUid(id);

    const [placesRes, staysRes, friendsRes, photosRes, profileRes] =
      await Promise.all([
        supabase.from("places").select("*"),
        supabase
          .from("stays")
          .select("place_id, duration_s")
          .not("left_at", "is", null),
        supabase.rpc("friends_places"),
        supabase.from("place_photos").select("place_id"),
        id
          ? supabase
              .from("profiles")
              .select("username, avatar_url")
              .eq("id", id)
              .single()
          : Promise.resolve({ data: null }),
      ]);

    setMyProfile((profileRes.data as MyProfile) ?? null);

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

    const photoCounts = new Map<string, number>();
    for (const ph of (photosRes.data ?? []) as { place_id: string }[]) {
      photoCounts.set(ph.place_id, (photoCounts.get(ph.place_id) ?? 0) + 1);
    }

    setPlaces(
      ((placesRes.data ?? []) as Place[]).map((p) => ({
        ...p,
        totalS: totals.get(p.id)?.totalS ?? 0,
        visits: totals.get(p.id)?.visits ?? 0,
        photoCount: photoCounts.get(p.id) ?? 0,
      })),
    );

    setFriendPlaces(
      ((friendsRes.data as FriendPlace[]) ?? []).map((f) => ({
        ...f,
        total_s: Number(f.total_s),
        visits: Number(f.visits),
        photo_count: Number(f.photo_count ?? 0),
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

    // Show name labels only when zoomed in close (otherwise: just the faces).
    const syncLabels = () => {
      mapEl.current?.classList.toggle("labels-on", map.getZoom() >= 14.5);
    };
    map.on("zoom", syncLabels);
    map.on("load", syncLabels);

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

    // An avatar bubble marker — the only thing shown until you zoom in / tap.
    const makeMarker = (opts: {
      username: string | null;
      avatarUrl: string | null;
      label: string;
      hasPhotos: boolean;
      lng: number;
      lat: number;
      onClick: () => void;
    }) => {
      const color = colorForName(opts.username);
      const initial = (opts.username ?? "?").charAt(0).toUpperCase();
      // Always render the initial behind; overlay the photo and drop it on error.
      const inner =
        `<span class="mb-avatar-initial" style="color:${color}">${esc(initial)}</span>` +
        (opts.avatarUrl
          ? `<img src="${esc(opts.avatarUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()" />`
          : "");
      const el = document.createElement("div");
      el.className = "mb-marker mb-marker--avatar" + (opts.hasPhotos ? " mb-marker--story" : "");
      el.innerHTML =
        `<span class="mb-avatar" style="border-color:${color}">${inner}</span>` +
        `<span class="mb-label">${esc(opts.label)}</span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        opts.onClick();
      });
      markersRef.current.push(
        new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([opts.lng, opts.lat])
          .addTo(map),
      );
    };

    // Your places — your face.
    for (const p of places) {
      makeMarker({
        username: myProfile?.username ?? "you",
        avatarUrl: myProfile?.avatar_url ?? null,
        label: p.label ?? "Unnamed spot",
        hasPhotos: p.photoCount > 0,
        lng: p.lng,
        lat: p.lat,
        onClick: () => {
          setSelFriend(null);
          setSelected(p);
          setName(p.label ?? "");
          setRadius(Math.round(p.radius_m));
          setHidden(!!p.hidden_from_friends);
        },
      });
    }

    // Friends' places — their face.
    for (const fp of friends) {
      makeMarker({
        username: fp.username,
        avatarUrl: fp.avatar_url,
        label: `${fp.label ?? "Unnamed spot"} · @${fp.username ?? "friend"}`,
        hasPhotos: fp.photo_count > 0,
        lng: fp.lng,
        lat: fp.lat,
        onClick: () => {
          setSelected(null);
          setSelFriend(fp);
        },
      });
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
  }, [places, friendPlaces, showFriends, ready, myProfile]);

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
              <Avatar name={selFriend.username} url={selFriend.avatar_url} size={52} />
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

            <PlaceAlbum placeId={selFriend.place_id} canAdd={false} uid={uid} />

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

            <PlaceAlbum placeId={selected.id} canAdd={true} uid={uid} />

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
                  <Avatar
                    name={r.is_me ? "you" : r.name}
                    url={r.avatar_url}
                    size={26}
                  />
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
