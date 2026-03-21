import { Router } from "express";
import { supabaseAdmin } from "../supabase.js";
import { detectStays } from "../services/stay-detection.js";

const router = Router();

/** POST /detect — run stay detection on a date range */
router.post("/", async (req, res) => {
  const { from, to } = req.body as { from?: string; to?: string };

  let query = supabaseAdmin
    .from("location_points")
    .select("*")
    .eq("user_id", req.userId)
    .order("recorded_at", { ascending: true });

  if (from) query = query.gte("recorded_at", from);
  if (to) query = query.lte("recorded_at", to);

  const { data: points, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!points?.length) {
    res.json({ stays: [], created: 0 });
    return;
  }

  const candidates = detectStays(points as any);

  if (!candidates.length) {
    res.json({ stays: [], created: 0 });
    return;
  }

  // Match candidates to existing places
  const { data: places } = await supabaseAdmin
    .from("places")
    .select("*")
    .eq("user_id", req.userId);

  const rows = candidates.map((s) => {
    let placeId: string | null = null;
    if (places) {
      for (const p of places) {
        const dist = haversineM(s.lat, s.lng, p.lat, p.lng);
        if (dist <= p.radius_m) {
          placeId = p.id;
          break;
        }
      }
    }
    return {
      user_id: req.userId,
      place_id: placeId,
      lat: s.lat,
      lng: s.lng,
      arrived_at: s.arrived_at,
      left_at: s.left_at,
      duration_s: s.duration_s,
    };
  });

  const { error: insertErr, count } = await supabaseAdmin
    .from("stays")
    .insert(rows, { count: "exact" });

  if (insertErr) {
    res.status(500).json({ error: insertErr.message });
    return;
  }

  res.json({ stays: candidates, created: count });
});

export default router;

// Inline haversine to avoid circular dep
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
