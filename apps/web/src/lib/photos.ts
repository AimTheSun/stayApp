import { supabase } from "./supabase";

/**
 * Upload a captured photo to the place's album. Stored at
 * place-photos/{uid}/{placeId}/{ts}.jpg, and the canonical (origin-independent)
 * public URL is saved in place_photos so it loads on every device.
 */
export async function uploadPlacePhoto(
  blob: Blob,
  uid: string,
  placeId: string,
): Promise<void> {
  const ts = Date.now();
  const path = `${uid}/${placeId}/${ts}.jpg`;
  const { error } = await supabase.storage
    .from("place-photos")
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;

  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const image_url = `${base}/storage/v1/object/public/place-photos/${path}`;
  const { error: insErr } = await supabase
    .from("place_photos")
    .insert({ place_id: placeId, user_id: uid, image_url });
  if (insErr) throw insErr;
}
