import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { uploadPlacePhoto } from "../lib/photos";
import Camera from "./Camera";

interface Photo {
  id: string;
  user_id: string;
  image_url: string;
  created_at: string;
}

export default function PlaceAlbum({
  placeId,
  canAdd,
  uid,
}: {
  placeId: string;
  canAdd: boolean;
  uid: string | null;
}) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchAlbum = useCallback(async () => {
    const { data } = await supabase.rpc("place_album", { p_place_id: placeId });
    setPhotos((data as Photo[]) ?? []);
  }, [placeId]);

  useEffect(() => {
    void fetchAlbum();
  }, [fetchAlbum]);

  async function onCapture(blob: Blob) {
    if (!uid) return;
    setUploading(true);
    try {
      await uploadPlacePhoto(blob, uid, placeId);
      await fetchAlbum();
      setCameraOpen(false);
    } catch {
      // keep camera open on failure
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="album">
      <p className="eyebrow board-title">
        Album{photos && photos.length > 0 ? ` · ${photos.length}` : ""}
      </p>

      {photos === null ? (
        <p className="muted board-msg">…</p>
      ) : (
        <div className="album-grid">
          {canAdd && (
            <button
              className="album-add"
              onClick={() => setCameraOpen(true)}
              aria-label="Add a photo"
            >
              <span className="album-add-plus">＋</span>
              <span className="album-add-label">Add</span>
            </button>
          )}
          {photos.map((p, i) => (
            <button
              key={p.id}
              className="album-thumb"
              onClick={() => setViewer(i)}
            >
              <img src={p.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
            </button>
          ))}
          {photos.length === 0 && !canAdd && (
            <p className="muted board-msg">No photos here yet.</p>
          )}
        </div>
      )}

      {cameraOpen && (
        <Camera
          busy={uploading}
          onCapture={onCapture}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {viewer !== null && photos && photos[viewer] && (
        <div className="photo-viewer" onClick={() => setViewer(null)}>
          <button className="camera-x" aria-label="Close">
            ✕
          </button>
          <img
            className="photo-viewer-img"
            src={photos[viewer].image_url}
            alt=""
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
          />
          {viewer > 0 && (
            <button
              className="photo-nav photo-prev"
              onClick={(e) => {
                e.stopPropagation();
                setViewer(viewer - 1);
              }}
              aria-label="Previous"
            >
              ‹
            </button>
          )}
          {viewer < photos.length - 1 && (
            <button
              className="photo-nav photo-next"
              onClick={(e) => {
                e.stopPropagation();
                setViewer(viewer + 1);
              }}
              aria-label="Next"
            >
              ›
            </button>
          )}
        </div>
      )}
    </div>
  );
}
