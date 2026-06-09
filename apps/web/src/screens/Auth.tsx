import { useState } from "react";
import { supabase } from "../lib/supabase";

type Mode = "signin" | "signup";

export default function Auth() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setNotice("Almost in — confirm the link we sent to your inbox.");
        }
      }
    } catch (err) {
      console.error("auth error", err);
      setNotice(
        err instanceof Error
          ? `${err.name}: ${err.message}`
          : `Something went wrong: ${String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <h1 className="brand">
          Stay<span className="brand-dot">.</span>
        </h1>
        <p className="auth-tagline">A quiet record of where your time goes.</p>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@somewhere.com"
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="••••••••"
            minLength={6}
            required
          />
        </label>

        {notice && <p className="notice">{notice}</p>}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "One moment…" : mode === "signin" ? "Enter" : "Create account"}
        </button>

        <button
          type="button"
          className="btn-text"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setNotice(null);
          }}
        >
          {mode === "signin" ? "First time here? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
