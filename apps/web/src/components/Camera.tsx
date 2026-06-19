import { useEffect, useRef, useState } from "react";

/**
 * In-app camera (BeReal-style) — uses getUserMedia and captures a frame to a
 * canvas, so there's no native iOS picker UI. Falls back to a file picker only
 * if the camera can't be opened (no permission / no device).
 */
export default function Camera({
  onCapture,
  onClose,
  busy,
}: {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setDenied(true);
      }
    })();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    // Square crop, centred — the BeReal look.
    const side = Math.min(v.videoWidth, v.videoHeight);
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      v,
      (v.videoWidth - side) / 2,
      (v.videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      side,
      side,
    );
    canvas.toBlob((b) => b && onCapture(b), "image/jpeg", 0.85);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onCapture(f);
  }

  return (
    <div className="camera">
      <button className="camera-x" onClick={onClose} aria-label="Close">
        ✕
      </button>

      {denied ? (
        <div className="camera-fallback">
          <p className="camera-msg">
            Camera unavailable. You can still choose a photo.
          </p>
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            Choose a photo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={onFile}
          />
        </div>
      ) : (
        <>
          <div className="camera-stage">
            <video
              ref={videoRef}
              playsInline
              muted
              className={facing === "user" ? "camera-video mirror" : "camera-video"}
            />
            {busy && <div className="camera-busy">Saving…</div>}
          </div>
          <div className="camera-controls">
            <span className="camera-spacer" />
            <button
              className="camera-shutter"
              onClick={snap}
              disabled={busy}
              aria-label="Take photo"
            />
            <button
              className="camera-flip"
              onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
              aria-label="Flip camera"
            >
              ⟲
            </button>
          </div>
        </>
      )}
    </div>
  );
}
