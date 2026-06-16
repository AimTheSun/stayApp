import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { supabase } from "../lib/supabase";
import { formatDuration } from "../lib/format";
import type { Place } from "../types";

interface PlaceWithStats extends Place {
  totalS: number;
  visits: number;
}

const ACCENT = "#e8b14e";

export default function MapScreen() {
  const [places, setPlaces] = useState<PlaceWithStats[] | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Load places + aggregate logged time per place.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [placesRes, staysRes] = await Promise.all([
        supabase.from("places").select("*"),
        supabase
          .from("stays")
          .select("place_id, duration_s")
          .not("left_at", "is", null),
      ]);
      if (cancelled) return;

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

      const withStats = ((placesRes.data ?? []) as Place[]).map((p) => ({
        ...p,
        totalS: totals.get(p.id)?.totalS ?? 0,
        visits: totals.get(p.id)?.visits ?? 0,
      }));
      setPlaces(withStats);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the Leaflet map once places are loaded.
  useEffect(() => {
    if (!mapEl.current || !places || places.length === 0 || mapRef.current) return;

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

      const label = p.label ?? "Unnamed spot";
      const time = p.totalS > 0 ? formatDuration(p.totalS) : "No time logged yet";
      const visits = p.visits
        ? ` · ${p.visits} visit${p.visits === 1 ? "" : "s"}`
        : "";
      L.marker([p.lat, p.lng], { icon })
        .addTo(map)
        .bindPopup(
          `<div class="map-pop"><strong>${escapeHtml(label)}</strong>` +
            `<span>${time}${visits}</span></div>`,
        );
    }

    if (points.length === 1) {
      map.setView(points[0], 15);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 });
    }
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [places]);

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
          {places.length} place{places.length === 1 ? "" : "s"} · tap a marker for
          details
        </p>
      </div>
      <div className="map-canvas" ref={mapEl} />
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
