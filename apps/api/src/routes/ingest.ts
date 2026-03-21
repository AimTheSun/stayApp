import { Router } from "express";
import { IngestBodySchema } from "@timespent/shared";
import { supabaseAdmin } from "../supabase.js";

const router = Router();

router.post("/", async (req, res) => {
  const parsed = IngestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const rows = parsed.data.points.map((p) => ({
    user_id: req.userId,
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    recorded_at: p.recorded_at,
  }));

  const { error, count } = await supabaseAdmin
    .from("location_points")
    .insert(rows, { count: "exact" });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ inserted: count });
});

export default router;
