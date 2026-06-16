import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useTracking } from "../lib/tracking";
import { detectStays } from "../lib/api";

function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const {
    isTracking,
    permission,
    capturedCount,
    sentCount,
    pendingCount,
    lastFix,
    error,
    start,
    stop,
  } = useTracking();

  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);

  const onDetect = async () => {
    setDetecting(true);
    setDetectMsg(null);
    try {
      const { created } = await detectStays();
      setDetectMsg(
        created > 0
          ? `${created} new visit${created === 1 ? "" : "s"} detected.`
          : "No new visits yet — keep tracking a little longer.",
      );
    } catch (e) {
      setDetectMsg(e instanceof Error ? e.message : "Couldn't process visits.");
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" style={{ fontSize: 22 }}>
            TimeSpent
          </span>
          <span className="brand__dot" />
        </div>
        <div className="topbar__right">
          <span className="user-chip">
            Signed in as <strong>{user?.email}</strong>
          </span>
          <button className="btn btn--ghost" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main>
        <p className="eyebrow">Dashboard</p>
        <h1 className="page-title">Your time, as it happens.</h1>

        <section className={`track-card${isTracking ? " is-active" : ""}`}>
          <div className="track-card__head">
            <span className="track-status">
              <span className={`status-dot${isTracking ? " is-on" : ""}`} />
              {isTracking ? "Tracking active" : "Not tracking"}
            </span>
            {pendingCount > 0 && (
              <span className="track-pending">{pendingCount} queued</span>
            )}
          </div>

          {!isTracking && permission !== "denied" && (
            <p className="permission-note">
              Allow location so we can calculate time spent in places while this
              app is open. You can pause tracking anytime, hide places like Home,
              and delete your data.
            </p>
          )}

          {permission === "denied" && (
            <p className="permission-note permission-note--warn">
              Location is blocked for this site. Enable it in your browser
              settings, then try again.
            </p>
          )}

          {error && <p className="track-error">{error}</p>}

          <div className="track-actions">
            {isTracking ? (
              <button className="btn btn--danger btn--lg" onClick={stop}>
                Stop tracking
              </button>
            ) : (
              <button className="btn btn--primary btn--lg" onClick={start}>
                Start tracking
              </button>
            )}
          </div>

          <div className="stat-grid">
            <div className="stat">
              <span className="stat__num">{capturedCount}</span>
              <span className="stat__label">Points captured</span>
            </div>
            <div className="stat">
              <span className="stat__num">{sentCount}</span>
              <span className="stat__label">Synced</span>
            </div>
            <div className="stat">
              <span className="stat__num">{pendingCount}</span>
              <span className="stat__label">Queued</span>
            </div>
          </div>

          {lastFix && (
            <div className="fix-readout">
              <span>Last fix {timeAgo(lastFix.at)}</span>
              <span className="fix-coords">
                {lastFix.lat.toFixed(5)}, {lastFix.lng.toFixed(5)}
                {lastFix.accuracy != null
                  ? ` · ±${Math.round(lastFix.accuracy)}m`
                  : ""}
              </span>
            </div>
          )}
        </section>

        <section className="process-row">
          <div>
            <h2 className="section-title">Turn points into places</h2>
            <p className="section-sub">
              Process the locations you've captured into visits and places.
            </p>
          </div>
          <button
            className="btn btn--ghost"
            onClick={onDetect}
            disabled={detecting}
          >
            {detecting ? "Processing…" : "Detect visits"}
          </button>
        </section>
        {detectMsg && <p className="detect-msg">{detectMsg}</p>}
      </main>
    </div>
  );
}
