import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { INTERESTS } from "../lib/interests";
import Avatar from "../components/Avatar";
import ProfileView from "../components/ProfileView";

interface Me {
  id: string;
  username: string | null;
  avatar_url: string | null;
  region: string | null;
  interests: string[] | null;
  bio: string | null;
}
interface Person {
  id: string;
  username: string | null;
  avatar_url: string | null;
  region?: string | null;
}
interface Request {
  from_user: string;
  username: string | null;
  avatar_url: string | null;
}

export default function Friends() {
  const [uid, setUid] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [friends, setFriends] = useState<Person[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [eRegion, setERegion] = useState("");
  const [eInterests, setEInterests] = useState<string[]>([]);
  const [eBio, setEBio] = useState("");
  const [saving, setSaving] = useState(false);

  const [wipeConfirm, setWipeConfirm] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  async function loadProfile(id: string) {
    // Try the full profile; fall back to base columns if 007 isn't applied yet.
    const full = await supabase
      .from("profiles")
      .select("id, username, avatar_url, region, interests, bio")
      .eq("id", id)
      .single();
    if (!full.error) return full.data as Me;
    const base = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .eq("id", id)
      .single();
    return base.data
      ? ({ ...(base.data as Person), region: null, interests: null, bio: null } as Me)
      : null;
  }

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    const id = userData.user?.id ?? null;
    setUid(id);
    const [mine, friendsRes, reqRes] = await Promise.all([
      id ? loadProfile(id) : Promise.resolve(null),
      supabase.rpc("my_friends"),
      supabase.rpc("incoming_requests"),
    ]);
    setMe(mine);
    if (mine) {
      setERegion(mine.region ?? "");
      setEInterests(mine.interests ?? []);
      setEBio(mine.bio ?? "");
    }
    setFriends(
      ((friendsRes.data as { friend_id: string; username: string | null; avatar_url: string | null }[]) ?? []).map(
        (f) => ({ id: f.friend_id, username: f.username, avatar_url: f.avatar_url }),
      ),
    );
    setRequests((reqRes.data as Request[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  // Debounced people search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_profiles", { p_q: q });
      setResults((data as Person[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${uid}/avatar.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setToast("Couldn't upload that photo.");
      return;
    }
    // Store the canonical Supabase public URL (origin-independent) so the photo
    // loads on every device — NOT the per-origin /sb proxy URL.
    const base = import.meta.env.VITE_SUPABASE_URL as string;
    const url = `${base}/storage/v1/object/public/avatars/${path}?v=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", uid);
    await load();
  }

  function toggleInterest(i: string) {
    setEInterests((cur) =>
      cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i],
    );
  }

  async function saveProfile() {
    setSaving(true);
    await supabase.rpc("save_profile", {
      p_region: eRegion,
      p_interests: eInterests,
      p_bio: eBio,
    });
    setSaving(false);
    setEditing(false);
    await load();
  }

  async function wipeData() {
    setWiping(true);
    await supabase.rpc("delete_my_data");
    setWiping(false);
    setWipeConfirm(false);
    setToast("Your places and stays were deleted.");
    await load();
  }

  if (loading) return <div className="center muted">…</div>;

  const hasHandle = !!me?.username;

  return (
    <div className="friends">
      <h2 className="log-title">Friends</h2>

      {/* You */}
      <section className="me-card">
        <button
          className="avatar-btn"
          onClick={() => fileRef.current?.click()}
          aria-label="Change photo"
        >
          <Avatar name={me?.username ?? null} url={me?.avatar_url ?? null} size={64} />
          <span className="avatar-edit">＋</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
        <div className="me-handle">
          <p className="handle">{hasHandle ? `@${me!.username}` : "Set up your profile"}</p>
          {me?.region && <p className="meta me-region">📍 {me.region}</p>}
          <button className="linkish" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit profile"}
          </button>
        </div>
      </section>

      {/* Edit profile */}
      {editing && (
        <section className="block edit-profile">
          <label className="field">
            <span className="field-label">Region</span>
            <input
              className="input-line"
              value={eRegion}
              onChange={(e) => setERegion(e.target.value)}
              placeholder="e.g. Lisbon, Portugal"
              maxLength={60}
            />
          </label>
          <p className="field-label edit-label">Interests</p>
          <div className="onboard-chips">
            {INTERESTS.map((i) => (
              <button
                key={i}
                type="button"
                className={`chip${eInterests.includes(i) ? " chip--on" : ""}`}
                onClick={() => toggleInterest(i)}
              >
                {i}
              </button>
            ))}
          </div>
          <label className="field edit-bio">
            <span className="field-label">Bio</span>
            <input
              className="input-line"
              value={eBio}
              onChange={(e) => setEBio(e.target.value)}
              placeholder="A line about you"
              maxLength={120}
            />
          </label>
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={saveProfile}>
            {saving ? "Saving…" : "Save profile"}
          </button>
        </section>
      )}

      {/* Search */}
      <section className="block">
        <p className="eyebrow">Find people</p>
        <div className="inline-form">
          <input
            className="input-line"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search a handle"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={20}
            disabled={!hasHandle}
          />
        </div>
        {!hasHandle && <p className="meta">Pick your own handle first (Edit profile).</p>}
        {results && (
          <ul className="friend-list search-results">
            {results.length === 0 ? (
              <li className="meta search-empty">No one found.</li>
            ) : (
              results.map((r) => (
                <li key={r.id} className="friend-row tappable" onClick={() => setViewing(r.id)}>
                  <Avatar name={r.username} url={r.avatar_url} />
                  <span className="friend-name">
                    @{r.username ?? "someone"}
                    {r.region && <span className="friend-sub"> · {r.region}</span>}
                  </span>
                  <span className="row-chevron">›</span>
                </li>
              ))
            )}
          </ul>
        )}
      </section>

      {/* Requests */}
      {requests.length > 0 && (
        <section className="block">
          <p className="eyebrow">Requests</p>
          <ul className="friend-list">
            {requests.map((r) => (
              <li
                key={r.from_user}
                className="friend-row tappable"
                onClick={() => setViewing(r.from_user)}
              >
                <Avatar name={r.username} url={r.avatar_url} />
                <span className="friend-name">@{r.username ?? "someone"}</span>
                <span className="friend-sub">wants to connect</span>
                <span className="row-chevron">›</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Friends */}
      <section className="block">
        <p className="eyebrow">Your friends</p>
        {friends.length === 0 ? (
          <p className="muted">No friends yet. Search a handle to get started.</p>
        ) : (
          <ul className="friend-list">
            {friends.map((f) => (
              <li
                key={f.id}
                className="friend-row tappable"
                onClick={() => setViewing(f.id)}
              >
                <Avatar name={f.username} url={f.avatar_url} />
                <span className="friend-name">@{f.username ?? "friend"}</span>
                <span className="row-chevron">›</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Privacy */}
      <section className="block privacy">
        <p className="eyebrow">Privacy &amp; data</p>
        <p className="meta privacy-note">
          Only your friends can see your places — and any place marked “Hidden from
          friends” stays private. You can erase your record at any time.
        </p>
        {wipeConfirm ? (
          <div className="confirm-row">
            <span className="meta">Delete all your places &amp; stays? This can't be undone.</span>
            <div className="req-actions">
              <button className="btn-text remove" disabled={wiping} onClick={wipeData}>
                {wiping ? "Deleting…" : "Delete everything"}
              </button>
              <button className="btn-text" disabled={wiping} onClick={() => setWipeConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="linkish danger-link" onClick={() => setWipeConfirm(true)}>
            Delete all my data
          </button>
        )}
      </section>

      {toast && <p className="toast">{toast}</p>}

      {viewing && (
        <ProfileView
          userId={viewing}
          onClose={() => setViewing(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
