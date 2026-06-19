import { useEffect, useState } from "react";
import { colorForName } from "../lib/avatarColor";

/**
 * A round avatar that shows the photo, or a colour-ringed initial as a
 * fallback — including when the image fails to load (e.g. a stale URL, or a
 * format the device can't render). The ring colour is stable per name.
 */
export default function Avatar({
  name,
  url,
  size = 44,
  ring = true,
}: {
  name: string | null | undefined;
  url: string | null | undefined;
  size?: number;
  ring?: boolean;
}) {
  const color = colorForName(name);
  const initial = (name ?? "?").charAt(0).toUpperCase();
  const [failed, setFailed] = useState(false);

  // Reset the error state if the URL changes (e.g. after a re-upload).
  useEffect(() => setFailed(false), [url]);

  const showImg = url && !failed;

  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        borderColor: ring ? color : "transparent",
        borderWidth: ring ? 2 : 1,
      }}
    >
      {showImg ? (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="avatar-initial"
          style={{ color, fontSize: Math.round(size * 0.4) }}
        >
          {initial}
        </span>
      )}
    </span>
  );
}
