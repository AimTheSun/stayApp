import { Router } from "express";
import { supabaseAdmin } from "../supabase.js";

const router = Router();

/** GET /stays?date=YYYY-MM-DD */
router.get("/", async (req, res) => {
  const { date } = req.query as { date?: string };

  let query = supabaseAdmin
    .from("stays")
    .select("*")
    .eq("user_id", req.userId)
    .order("arrived_at", { ascending: false });

  if (date) {
    query = query
      .gte("arrived_at", `${date}T00:00:00Z`)
      .lt("arrived_at", `${date}T23:59:59.999Z`);
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

export default router;
