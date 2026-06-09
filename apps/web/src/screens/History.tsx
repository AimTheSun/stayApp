import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatDuration, formatTime } from "../lib/format";
import type { StayRow } from "../types";

interface DayGroup {
  key: string;
  label: string;
  totalS: number;
  stays: StayRow[];
}

export default function History() {
  const [groups, setGroups] = useState<DayGroup[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("stays")
        .select("*, places(label)")
        .not("left_at", "is", null)
        .order("arrived_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      setGroups(groupByDay((data ?? []) as StayRow[]));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (groups === null) return <div className="center muted">…</div>;

  if (groups.length === 0) {
    return (
      <div className="center">
        <p className="empty-title">Nothing yet.</p>
        <p className="muted">Your first stay will live here.</p>
      </div>
    );
  }

  return (
    <div className="log">
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
                  <span className="stay-place">{s.places?.label ?? "Unmarked spot"}</span>
                  <span className="stay-times">
                    {formatTime(s.arrived_at)} – {s.left_at ? formatTime(s.left_at) : "…"}
                  </span>
                </div>
                <span className="stay-duration">{formatDuration(s.duration_s ?? 0)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
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
            : d.toLocaleDateString([], { weekday: "short", month: "long", day: "numeric" });
      g = { key, label, totalS: 0, stays: [] };
      map.set(key, g);
    }
    g.stays.push(s);
    g.totalS += s.duration_s ?? 0;
  }
  return [...map.values()];
}
