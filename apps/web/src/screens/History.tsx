import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatDuration, formatTime } from "../lib/format";
import type { StayRow } from "../types";

const RANGES = [
  { key: "week", label: "Week", eyebrow: "This week" },
  { key: "month", label: "Month", eyebrow: "This month" },
  { key: "all", label: "All", eyebrow: "All time" },
] as const;
type Range = (typeof RANGES)[number]["key"];

interface DayGroup {
  key: string;
  label: string;
  totalS: number;
  stays: StayRow[];
}

export default function History() {
  const [stays, setStays] = useState<StayRow[] | null>(null);
  const [range, setRange] = useState<Range>("week");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("stays")
        .select("*, places(label)")
        .not("left_at", "is", null)
        .order("arrived_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      setStays((data ?? []) as StayRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (stays === null) return <div className="center muted">…</div>;

  if (stays.length === 0) {
    return (
      <div className="center">
        <p className="empty-title">Nothing yet.</p>
        <p className="muted">Your first stay will live here.</p>
      </div>
    );
  }

  const start =
    range === "week" ? startOfWeek() : range === "month" ? startOfMonth() : 0;
  const inRange = stays.filter(
    (s) => new Date(s.arrived_at).getTime() >= start,
  );
  const total = inRange.reduce((sum, s) => sum + (s.duration_s ?? 0), 0);
  const top = topPlaces(inRange);
  const max = top[0]?.totalS ?? 0;
  const groups = groupByDay(inRange);
  const eyebrow = RANGES.find((r) => r.key === range)!.eyebrow;

  return (
    <div className="log">
      <div className="range-tabs">
        {RANGES.map((r) => (
          <button
            key={r.key}
            className={`range-tab${range === r.key ? " range-tab--on" : ""}`}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <section className="summary">
        <p className="eyebrow">{eyebrow}</p>
        <p className="summary-total">{total > 0 ? formatDuration(total) : "—"}</p>

        {top.length > 0 ? (
          <ul className="rank">
            {top.map((p) => (
              <li key={p.label} className="rank-row">
                <span className="rank-label">{p.label}</span>
                <span className="rank-time">{formatDuration(p.totalS)}</span>
                <span className="rank-bar">
                  <span
                    className="rank-bar-fill"
                    style={{ width: `${max ? Math.max(4, (p.totalS / max) * 100) : 0}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted summary-empty">No stays in this period yet.</p>
        )}
      </section>

      {groups.length > 0 && (
        <>
          <h2 className="log-title">The record</h2>
          {groups.map((g) => (
            <section key={g.key} className="day">
              <header className="day-header">
                <span>{g.label}</span>
                <span className="day-total">{formatDuration(g.totalS)}</span>
              </header>
              <ul className="day-list">
                {g.stays.map((s) => (
                  <li key={s.id} className="stay-row">
                    <div className="stay-main">
                      <span className="stay-place">
                        {s.places?.label ?? "Unmarked spot"}
                      </span>
                      <span className="stay-times">
                        {formatTime(s.arrived_at)} –{" "}
                        {s.left_at ? formatTime(s.left_at) : "…"}
                      </span>
                    </div>
                    <span className="stay-duration">
                      {formatDuration(s.duration_s ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function startOfWeek(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

function startOfMonth(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

function topPlaces(stays: StayRow[], limit = 5) {
  const totals = new Map<string, number>();
  for (const s of stays) {
    const label = s.places?.label ?? "Unmarked spot";
    totals.set(label, (totals.get(label) ?? 0) + (s.duration_s ?? 0));
  }
  return [...totals.entries()]
    .map(([label, totalS]) => ({ label, totalS }))
    .filter((p) => p.totalS > 0)
    .sort((a, b) => b.totalS - a.totalS)
    .slice(0, limit);
}

function groupByDay(stays: StayRow[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();

  for (const s of stays) {
    const d = new Date(s.arrived_at);
    const key = d.toDateString();
    let g = map.get(key);
    if (!g) {
      const label =
        key === today
          ? "Today"
          : key === yesterday
            ? "Yesterday"
            : d.toLocaleDateString([], {
                weekday: "short",
                month: "long",
                day: "numeric",
              });
      g = { key, label, totalS: 0, stays: [] };
      map.set(key, g);
    }
    g.stays.push(s);
    g.totalS += s.duration_s ?? 0;
  }
  return [...map.values()];
}
