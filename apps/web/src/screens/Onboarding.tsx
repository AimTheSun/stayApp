import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { INTERESTS } from "../lib/interests";
import { geocodeAddress } from "../lib/geocode";

type StepKey = "handle" | "region" | "interests" | "home" | "done";

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [uid, setUid] = useState<string | null>(null);
  const [hasHandle, setHasHandle] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [handle, setHandle] = useState("");
  const [region, setRegion] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [home, setHome] = useState("");

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const id = u.user?.id ?? null;
      setUid(id);
      if (id) {
        const { data } = await supabase
          .from("profiles")
          .select("username, region, interests")
          .eq("id", id)
          .single();
        if (data?.username) {
          setHasHandle(true);
          setHandle(data.username);
        }
        if (data?.region) setRegion(data.region);
        if (data?.interests) setInterests(data.interests as string[]);
      }
      setLoaded(true);
    })();
  }, []);

  const steps = useMemo<StepKey[]>(
    () => [
      ...(hasHandle ? [] : (["handle"] as StepKey[])),
      "region",
      "interests",
      "home",
      "done",
    ],
    [hasHandle],
  );
  const key = steps[step];

  function toggleInterest(i: string) {
    setInterests((cur) =>
      cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i],
    );
  }

  async function next() {
    setError(null);

    if (key === "handle") {
      setBusy(true);
      const { error: e } = await supabase.rpc("set_username", {
        p_username: handle,
      });
      setBusy(false);
      if (e) {
        setError(
          /duplicate|unique/i.test(e.message)
            ? "That handle is taken."
            : e.message,
        );
        return;
      }
    }

    if (key === "done") {
      await finish();
      return;
    }

    setStep((s) => s + 1);
  }

  async function finish() {
    setBusy(true);
    // Save the profile (also flips the onboarded flag).
    await supabase.rpc("save_profile", {
      p_region: region,
      p_interests: interests,
      p_bio: null,
    });

    // Optional: turn a home address into a private "Home" place.
    if (home.trim() && uid) {
      const geo = await geocodeAddress(home);
      if (geo) {
        await supabase
          .from("places")
          .insert({
            user_id: uid,
            label: "Home",
            lat: geo.lat,
            lng: geo.lng,
            radius_m: 120,
            hidden_from_friends: true,
            category: "Home",
          })
          // best-effort: ignore if optional columns aren't migrated
          .then(({ error }) => {
            if (error && /column/i.test(error.message)) {
              return supabase.from("places").insert({
                user_id: uid,
                label: "Home",
                lat: geo.lat,
                lng: geo.lng,
                radius_m: 120,
              });
            }
          });
        if (!region.trim() && geo.region) {
          await supabase.rpc("save_profile", {
            p_region: geo.region,
            p_interests: interests,
            p_bio: null,
          });
        }
      }
    }
    setBusy(false);
    onDone();
  }

  if (!loaded) return <div className="center muted">…</div>;

  const total = steps.length;
  const canNext =
    key === "handle"
      ? handle.trim().length >= 3
      : key === "region"
        ? true
        : key === "interests"
          ? interests.length > 0
          : true;

  return (
    <div className="onboard">
      <div className="onboard-card">
        <div className="onboard-progress">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`onboard-dot${i <= step ? " onboard-dot--on" : ""}`}
            />
          ))}
        </div>

        {key === "handle" && (
          <>
            <h2 className="onboard-q">Pick your handle</h2>
            <p className="onboard-sub">
              This is how friends find you. Letters, numbers, underscore.
            </p>
            <input
              className="onboard-input"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="yourname"
              autoCapitalize="none"
              autoCorrect="off"
              maxLength={20}
              autoFocus
            />
            <p className="onboard-prefix">@{handle || "yourname"}</p>
          </>
        )}

        {key === "region" && (
          <>
            <h2 className="onboard-q">Where are you based?</h2>
            <p className="onboard-sub">Your city or area — shown on your profile.</p>
            <input
              className="onboard-input"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="e.g. Lisbon, Portugal"
              maxLength={60}
              autoFocus
            />
          </>
        )}

        {key === "interests" && (
          <>
            <h2 className="onboard-q">What do you love doing?</h2>
            <p className="onboard-sub">Pick a few — they'll show on your profile.</p>
            <div className="onboard-chips">
              {INTERESTS.map((i) => (
                <button
                  key={i}
                  type="button"
                  className={`chip${interests.includes(i) ? " chip--on" : ""}`}
                  onClick={() => toggleInterest(i)}
                >
                  {i}
                </button>
              ))}
            </div>
          </>
        )}

        {key === "home" && (
          <>
            <h2 className="onboard-q">Where's home?</h2>
            <p className="onboard-sub">
              Optional &amp; private — saved as a hidden “Home” spot, never shown
              to friends. Skip if you'd rather not.
            </p>
            <input
              className="onboard-input"
              value={home}
              onChange={(e) => setHome(e.target.value)}
              placeholder="Street, city"
              maxLength={120}
            />
          </>
        )}

        {key === "done" && (
          <>
            <h2 className="onboard-q">You're all set.</h2>
            <p className="onboard-sub">
              Welcome to Stay{handle ? `, @${handle}` : ""}. Check in somewhere and
              your record begins.
            </p>
          </>
        )}

        {error && <p className="notice notice--error">{error}</p>}

        <div className="onboard-actions">
          {step > 0 && key !== "done" && (
            <button
              className="btn-text"
              disabled={busy}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </button>
          )}
          <button
            className="btn btn-primary onboard-next"
            disabled={busy || !canNext}
            onClick={next}
          >
            {busy
              ? "…"
              : key === "done"
                ? "Start"
                : key === "home"
                  ? home.trim()
                    ? "Save home"
                    : "Skip"
                  : `Continue · ${step + 1}/${total}`}
          </button>
        </div>
      </div>
    </div>
  );
}
