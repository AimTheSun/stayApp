import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Friend {
  friend_id: string;
  username: string | null;
}

export default function Friends() {
  const [username, setUsername] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  const [handleInput, setHandleInput] = useState("");
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleBusy, setHandleBusy] = useState(false);
  const [handleErr, setHandleErr] = useState<string | null>(null);

  const [addInput, setAddInput] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    const [profileRes, friendsRes] = await Promise.all([
      uid
        ? supabase.from("profiles").select("username").eq("id", uid).single()
        : Promise.resolve({ data: null }),
      supabase.rpc("my_friends"),
    ]);
    setUsername((profileRes.data as { username?: string } | null)?.username ?? null);
    setFriends((friendsRes.data as Friend[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveHandle() {
    setHandleBusy(true);
    setHandleErr(null);
    const { error } = await supabase.rpc("set_username", {
      p_username: handleInput,
    });
    setHandleBusy(false);
    if (error) {
      setHandleErr(error.message);
      return;
    }
    setEditingHandle(false);
    setHandleInput("");
    await load();
  }

  async function addFriend() {
    if (!addInput.trim()) return;
    setAddBusy(true);
    setAddMsg(null);
    const { data, error } = await supabase.rpc("add_friend", {
      p_username: addInput.trim(),
    });
    setAddBusy(false);
    if (error) {
      setAddMsg(error.message);
      return;
    }
    const added = (data as Friend[])?.[0];
    setAddMsg(added ? `Added @${added.username}.` : "Added.");
    setAddInput("");
    await load();
  }

  if (loading) return <div className="center muted">…</div>;

  return (
    <div className="friends">
      <h2 className="log-title">Friends</h2>

      <section className="block">
        <p className="eyebrow">Your handle</p>
        {username && !editingHandle ? (
          <>
            <p className="handle">@{username}</p>
            <p className="meta">
              Share this so friends can add you.{" "}
              <button
                className="linkish"
                onClick={() => {
                  setEditingHandle(true);
                  setHandleInput(username);
                }}
              >
                Change
              </button>
            </p>
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
            <p className="meta">3–20 chars · letters, numbers, underscore.</p>
            {handleErr && <p className="notice notice--error">{handleErr}</p>}
          </>
        )}
      </section>

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
            disabled={addBusy || !username}
            onClick={addFriend}
          >
            {addBusy ? "…" : "Add"}
          </button>
        </div>
        {!username && (
          <p className="meta">Pick your own handle first.</p>
        )}
        {addMsg && <p className="notice">{addMsg}</p>}
      </section>

      <section className="block">
        <p className="eyebrow">Your friends</p>
        {friends.length === 0 ? (
          <p className="muted">No friends yet.</p>
        ) : (
          <ul className="friend-list">
            {friends.map((f) => (
              <li key={f.friend_id} className="friend-row">
                @{f.username ?? "friend"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
