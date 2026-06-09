import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { DEFAULT_PLACE_RADIUS_M, haversineM, locate, type Fix } from "../lib/geo";
import { formatClock, formatDay, formatDuration, formatTime } from "../lib/format";
import type { Place, StayRow } from "../types";

interface ActiveStay {
  id: string;
  arrived_at: string;
  label: string;
}

type Phase =
  | { k: "loading" }
  | { k: "idle"; notice?: string; error?: boolean }
  | { k: "locating" }
  | { k: "confirm"; fix: Fix; match: Place | null; saving: boolean }
  | { k: "active"; stay: ActiveStay; leaving: boolean };

export default function Home() {
  const [phase, setPhase] = useState<Phase>({ k: "loading" });
  const [name, setName] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("stays")
        .select("id, arrived_at, places(label)")
        .is("left_at", null)
        .order("arrived_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = data?.[0] as Pick<StayRow, "id" | "arrived_at" | "places"> | undefined;
      if (row) {
        setPhase({
          k: "active",
          stay: {
            id: row.id,
            arrived_at: row.arrived_at,
            label: row.places?.label ?? "Somewhere",
          },
          leaving: false,
        });
      } else {
        setPhase({ k: "idle" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function checkIn() {
    setPhase({ k: "locating" });
    try {
      const fix = await locate();
      const { data: places } = await supabase.from("places").select("*");
      let match: Place | null = null;
      let best = Infinity;
      for (const p of (places ?? []) as Place[]) {
        const d = haversineM(fix.lat, fix.lng, p.lat, p.lng);
        if (d <= p.radius_m && d < best) {
          best = d;
          match = p;
        }
      }
      setName(match?.label ?? "");
      setPhase({ k: "confirm", fix, match, saving: false });
    } catch (err) {
      setPhase({
        k: "idle",
        notice: err instanceof Error ? err.message : "Couldn't locate you.",
        error: true,
      });
    }
  }

  async function startClock(fix: Fix, match: Place | null) {
    setPhase({ k: "confirm", fix, match, saving: true });
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Session expired — sign in again.");

      const label = name.trim() || "Unnamed spot";
      let placeId: string;

      if (match) {
        placeId = match.id;
        if (label !== match.label) {
          await supabase.from("places").update({ label }).eq("id", match.id);
        }
      } else {
        const { data: created, error } = await supabase
          .from("places")
          .insert({
            user_id: userId,
            label,
            lat: fix.lat,
            lng: fix.lng,
            radius_m: DEFAULT_PLACE_RADIUS_M,
          })
          .select("id")
          .single();
        if (error) throw error;
        placeId = created.id;
      }

      const arrivedAt = new Date().toISOString();
      const { data: stay, error: stayErr } = await supabase
        .from("stays")
        .insert({
          user_id: userId,
          place_id: placeId,
          lat: fix.lat,
          lng: fix.lng,
          arrived_at: arrivedAt,
        })
        .select("id")
        .single();
      if (stayErr) throw stayErr;

      setPhase({
        k: "active",
        stay: { id: stay.id, arrived_at: arrivedAt, label },
        leaving: false,
      });
    } catch (err) {
      setPhase({
        k: "idle",
        notice: err instanceof Error ? err.message : "Couldn't start the clock.",
        error: true,
      });
    }
  }

  async function leave(stay: ActiveStay) {
    setPhase({ k: "active", stay, leaving: true });
    const leftAt = new Date();
    const durationS = Math.max(
      0,
      Math.round((leftAt.getTime() - new Date(stay.arrived_at).getTime()) / 1000),
    );
    const { error } = await supabase
      .from("stays")
      .update({ left_at: leftAt.toISOString(), duration_s: durationS })
      .eq("id", stay.id);
    if (error) {
      setPhase({ k: "active", stay, leaving: false });
      return;
    }
    setPhase({
      k: "idle",
      notice: `Saved — ${formatDuration(durationS)} at ${stay.label}.`,
    });
  }

  if (phase.k === "loading") {
    return <div className="center muted">…</div>;
  }

  if (phase.k === "active") {
    return <ActiveView stay={phase.stay} leaving={phase.leaving} onLeave={leave} />;
  }

  if (phase.k === "confirm") {
    const { fix, match, saving } = phase;
    return (
      <div className="confirm">
        <p className="eyebrow">{match ? "Welcome back to" : "Somewhere new"}</p>
        <input
          className="place-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this place"
          autoFocus={!match}
          maxLength={60}
        />
        <p className="meta">
          {fix.accuracy != null ? `Fix within ±${Math.round(fix.accuracy)} m` : "Location locked"}
          {match ? ` · saved preset, ${Math.round(match.radius_m)} m radius` : " · will be saved as a preset"}
        </p>
        <div className="confirm-actions">
          <button
            className="btn btn-primary"
            disabled={saving}
            onClick={() => startClock(fix, match)}
          >
            {saving ? "Starting…" : "Start the clock"}
          </button>
          <button
            className="btn-text"
            disabled={saving}
            onClick={() => setPhase({ k: "idle" })}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // idle / locating
  const locating = phase.k === "locating";
  return (
    <div className="idle">
      <p className="eyebrow">{formatDay(new Date().toISOString())}</p>
      <button
        className={`here-btn${locating ? " here-btn--pulse" : ""}`}
        onClick={checkIn}
        disabled={locating}
        aria-label="Check in here"
      >
        <span className="here-btn-ring" />
        <span className="here-btn-label">{locating ? "Finding you…" : "I'm here"}</span>
      </button>
      {phase.k === "idle" && phase.notice ? (
        <p className={`notice${phase.error ? " notice--error" : ""}`}>{phase.notice}</p>
      ) : (
        <p className="idle-hint">One tap when you arrive. We keep the clock.</p>
      )}
    </div>
  );
}

function ActiveView({
  stay,
  leaving,
  onLeave,
}: {
  stay: ActiveStay;
  leaving: boolean;
  onLeave: (s: ActiveStay) => void;
}) {
  const [elapsed, setElapsed] = useState(() => elapsedS(stay.arrived_at));
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => setElapsed(elapsedS(stay.arrived_at)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [stay.arrived_at]);

  return (
    <div className="active">
      <p className="eyebrow">You're at</p>
      <h2 className="active-place">{stay.label}</h2>
      <p className="active-clock">{formatClock(elapsed)}</p>
      <p className="meta">since {formatTime(stay.arrived_at)}</p>
      <button className="btn btn-leave" disabled={leaving} onClick={() => onLeave(stay)}>
        {leaving ? "Saving…" : "I'm leaving"}
      </button>
    </div>
  );
}

function elapsedS(arrivedAt: string): number {
  return (Date.now() - new Date(arrivedAt).getTime()) / 1000;
}
