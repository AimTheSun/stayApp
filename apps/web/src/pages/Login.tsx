import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

type Mode = "signin" | "signup";

export default function Login() {
  const { session, loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in → straight to the app.
  if (!loading && session) return <Navigate to="/app/dashboard" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const fn = mode === "signin" ? signIn : signUp;
    const { error } = await fn(email.trim(), password);
    setSubmitting(false);
    if (error) setError(error);
    // On success the auth listener flips `session`, redirecting above.
  };

  const isSignup = mode === "signup";

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="brand">
          <span className="brand__mark">TimeSpent</span>
          <span className="brand__dot" />
        </div>

        <h1 className="auth__title">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="auth__subtitle">
          {isSignup
            ? "Track the time you spend in the places that matter — privately."
            : "Sign in to pick up where your time left off."}
        </p>

        <form className="card form" onSubmit={onSubmit}>
          {error && <div className="form__error">{error}</div>}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>

          <button className="btn btn--primary" type="submit" disabled={submitting}>
            {submitting
              ? "One moment…"
              : isSignup
                ? "Create account"
                : "Sign in"}
          </button>

          <p className="form__switch">
            {isSignup ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              className="linkbtn"
              onClick={() => {
                setMode(isSignup ? "signin" : "signup");
                setError(null);
              }}
            >
              {isSignup ? "Sign in" : "Create one"}
            </button>
          </p>
        </form>

        <p className="auth__note">
          Your location stays yours. Pause tracking anytime and delete your data.
        </p>
      </div>
    </div>
  );
}
