import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

interface Person {
  id: string;
  username: string | null;
  avatar_url: string | null;
}
interface Request {
  from_user: string;
  username: string | null;
  avatar_url: string | null;
}

function Avatar({
  name,
  url,
  size = 44,
}: {
  name: string | null;
  url: string | null;
  size?: number;
}) {
  const initial = (name ?? "?").charAt(0).toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" />
      ) : (
        <span className="avatar-initial">{initial}</span>
      )}
    </span>
  );
}

export default function Friends() {
  const [uid, setUid] = useState<string | null>(null);
  const [me, setMe] = useState<Person | null>(null);
  const [friends, setFriends] = useState<Person[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  const [handleInput, setHandleInput] = useState("");
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleBusy, setHandleBusy] = useState(false);
  const [handleErr, setHandleErr] = useState<string | null>(null);

  const [addInput, setAddInput] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    const id = userData.user?.id ?? null;
    setUid(id);
    const [profileRes, friendsRes, reqRes] = await Promise.all([
      id
        ? supabase
            .from("profiles")
            .select("id, username, avatar_url")
            .eq("id", id)
            .single()
        : Promise.resolve({ data: null }),
      supabase.rpc("my_friends"),
      supabase.rpc("incoming_requests"),
    ]);
    setMe((profileRes.data as Person) ?? null);
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

  async function saveHandle() {
    setHandleBusy(true);
    setHandleErr(null);
    const { error } = await supabase.rpc("set_username", { p_username: handleInput });
    setHandleBusy(false);
    if (error) {
      setHandleErr(
        /duplicate|unique/i.test(error.message)
          ? "That handle is taken."
          : error.message,
      );
      return;
    }
    setEditingHandle(false);
    await load();
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${uid}/avatar.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) return;
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", uid);
    await load();
  }

  async function addFriend() {
    if (!addInput.trim()) return;
    setAddBusy(true);
    setAddMsg(null);
    const { data, error } = await supabase.rpc("send_friend_request", {
      p_username: addInput.trim(),
    });
    setAddBusy(false);
    if (error) {
      setAddMsg(error.message);
      return;
    }
    setAddMsg(data === "friend" ? "You're now friends!" : "Request sent.");
    setAddInput("");
    await load();
  }

  async function accept(from: string) {
    await supabase.rpc("accept_friend_request", { p_from: from });
    await load();
  }
  async function decline(from: string) {
    await supabase.rpc("decline_friend_request", { p_from: from });
    await load();
  }
  async function removeFriend(id: string) {
    await supabase.rpc("remove_friend", { p_friend: id });
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
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onPickPhoto}
        />
        <div className="me-handle">
          {hasHandle && !editingHandle ? (
            <>
              <p className="handle">@{me!.username}</p>
              <button
                className="linkish"
                onClick={() => {
                  setEditingHandle(true);
                  setHandleInput(me!.username ?? "");
                }}
              >
                Change handle
              </button>
            </>
          ) : (
            <>
              <div className="inline-form">
                <input
                  className="input-line"
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                  placeholder="pick a handle"
                  autoCapitalize="none"
                  autoCorrect="off"
                  maxLength={20}
                />
                <button
                  className="btn btn-primary btn-sm"
                  disabled={handleBusy}
                  onClick={saveHandle}
                >
                  {handleBusy ? "…" : "Save"}
                </button>
              </div>
              <p className="meta">Unique · 3–20 chars · a–z 0–9 _</p>
              {handleErr && <p className="notice notice--error">{handleErr}</p>}
            </>
          )}
        </div>
      </section>

      {/* Requests */}
      {requests.length > 0 && (
        <section className="block">
          <p className="eyebrow">Requests</p>
          <ul className="friend-list">
            {requests.map((r) => (
              <li key={r.from_user} className="friend-row req-row">
                <Avatar name={r.username} url={r.avatar_url} />
                <span className="friend-name">@{r.username ?? "someone"}</span>
                <span className="req-actions">
                  <button className="btn btn-primary btn-xs" onClick={() => accept(r.from_user)}>
                    Accept
                  </button>
                  <button className="btn-text btn-xs" onClick={() => decline(r.from_user)}>
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Add */}
      <section className="block">
        <p className="eyebrow">Add a friend</p>
        <div className="inline-form">
          <input
            className="input-line"
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            placeholder="their handle"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={20}
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={addBusy || !hasHandle}
            onClick={addFriend}
          >
            {addBusy ? "…" : "Send"}
          </button>
        </div>
        {!hasHandle && <p className="meta">Pick your own handle first.</p>}
        {addMsg && <p className="notice">{addMsg}</p>}
      </section>

      {/* Friends */}
      <section className="block">
        <p className="eyebrow">Your friends</p>
        {friends.length === 0 ? (
          <p className="muted">No friends yet.</p>
        ) : (
          <ul className="friend-list">
            {friends.map((f) => (
              <li key={f.id} className="friend-row">
                <Avatar name={f.username} url={f.avatar_url} />
                <span className="friend-name">@{f.username ?? "friend"}</span>
                <button className="linkish remove" onClick={() => removeFriend(f.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
