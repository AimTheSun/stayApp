import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Avatar from "./Avatar";

interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  region: string | null;
  interests: string[] | null;
  bio: string | null;
  created_at: string;
  is_me: boolean;
  is_friend: boolean;
  req_outgoing: boolean;
  req_incoming: boolean;
}

function joined(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export default function ProfileView({
  userId,
  onClose,
  onChanged,
}: {
  userId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    const { data } = await supabase.rpc("get_profile", { p_id: userId });
    setP(((data as Profile[]) ?? [])[0] ?? null);
  }, [userId]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  async function act(
    rpc: string,
    args: Record<string, unknown>,
    note?: string,
  ) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc(rpc, args);
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    if (note) setMsg(note);
    await fetchProfile();
    onChanged?.();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet profile-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        {p === null ? (
          <p className="center muted">…</p>
        ) : (
          <>
            <div className="profile-head">
              <Avatar name={p.username} url={p.avatar_url} size={84} />
              <h2 className="profile-handle">@{p.username ?? "someone"}</h2>
              <div className="profile-facts">
                {p.region && <span className="profile-fact">📍 {p.region}</span>}
                <span className="profile-fact">Joined {joined(p.created_at)}</span>
              </div>
            </div>

            {p.bio && <p className="profile-bio">{p.bio}</p>}

            {p.interests && p.interests.length > 0 && (
              <div className="profile-interests">
                {p.interests.map((i) => (
                  <span key={i} className="chip chip--static">
                    {i}
                  </span>
                ))}
              </div>
            )}

            {msg && <p className="notice">{msg}</p>}

            <div className="profile-actions">
              {p.is_me ? (
                <p className="meta">This is you.</p>
              ) : p.is_friend ? (
                <>
                  <span className="profile-status">✓ Friends</span>
                  <button
                    className="btn-text remove"
                    disabled={busy}
                    onClick={() => act("remove_friend", { p_friend: p.id })}
                  >
                    Remove
                  </button>
                </>
              ) : p.req_incoming ? (
                <>
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => act("accept_friend_request", { p_from: p.id })}
                  >
                    Accept request
                  </button>
                  <button
                    className="btn-text"
                    disabled={busy}
                    onClick={() => act("decline_friend_request", { p_from: p.id })}
                  >
                    Decline
                  </button>
                </>
              ) : p.req_outgoing ? (
                <span className="profile-status">Request sent</span>
              ) : (
                <button
                  className="btn btn-primary profile-add"
                  disabled={busy}
                  onClick={() =>
                    act(
                      "send_friend_request",
                      { p_username: p.username },
                      "Request sent.",
                    )
                  }
                >
                  Add friend
                </button>
              )}
            </div>

            <button className="btn-text profile-close" onClick={onClose}>
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
