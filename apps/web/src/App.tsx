import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "./lib/supabase";
import Auth from "./screens/Auth";
import Home from "./screens/Home";
import History from "./screens/History";
import Friends from "./screens/Friends";
import Splash from "./screens/Splash";

// Mapbox GL is ~2.3 MB — only pull it in when the Map tab is opened.
const MapScreen = lazy(() => import("./screens/Map"));

type Tab = "now" | "map" | "log" | "friends";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("now");
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!configured) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const splash = showSplash ? <Splash /> : null;

  if (!configured) {
    return (
      <div className="center setup">
        <h1 className="brand">
          Stay<span className="brand-dot">.</span>
        </h1>
        <p className="muted">
          Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{" "}
          <code>apps/web/.env</code>, then restart the dev server.
        </p>
      </div>
    );
  }

  if (!ready) return <>{splash}<div className="center muted">…</div></>;
  if (!session) return <>{splash}<Auth /></>;

  return (
    <>
      {splash}
      <div className="shell">
      <header className="topbar">
        <span className="wordmark">
          Stay<span className="brand-dot">.</span>
        </span>
        <button className="btn-text" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>

      <main className="screen">
        {tab === "now" ? (
          <Home />
        ) : tab === "map" ? (
          <Suspense fallback={<div className="center muted">…</div>}>
            <MapScreen />
          </Suspense>
        ) : tab === "log" ? (
          <History />
        ) : (
          <Friends />
        )}
      </main>

      <nav className="tabbar">
        <button
          className={`tab${tab === "now" ? " tab--on" : ""}`}
          onClick={() => setTab("now")}
        >
          Now
        </button>
        <button
          className={`tab${tab === "map" ? " tab--on" : ""}`}
          onClick={() => setTab("map")}
        >
          Map
        </button>
        <button
          className={`tab${tab === "log" ? " tab--on" : ""}`}
          onClick={() => setTab("log")}
        >
          Log
        </button>
        <button
          className={`tab${tab === "friends" ? " tab--on" : ""}`}
          onClick={() => setTab("friends")}
        >
          Friends
        </button>
      </nav>
      </div>
    </>
  );
}
