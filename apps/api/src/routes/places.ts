import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabase.js";

const router = Router();

const CreatePlaceBody = z.object({
  label: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_m: z.number().positive().optional().default(100),
});

const UpdatePlaceBody = z.object({
  label: z.string().min(1).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radius_m: z.number().positive().optional(),
});

/** GET /places */
router.get("/", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("places")
    .select("*")
    .eq("user_id", req.userId)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

/** POST /places */
router.post("/", async (req, res) => {
  const parsed = CreatePlaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("places")
    .insert({ user_id: req.userId, ...parsed.data })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
});

/** PATCH /places/:id */
router.patch("/:id", async (req, res) => {
  const parsed = UpdatePlaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("places")
    .update(parsed.data)
    .eq("id", req.params.id)
    .eq("user_id", req.userId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

export default router;
