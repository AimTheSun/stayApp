import { z } from "zod";

// ── Profiles ──
export const ProfileSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  created_at: z.string().datetime(),
});

// ── Location Points ──
export const LocationPointSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nullable(),
  recorded_at: z.string().datetime(),
  created_at: z.string().datetime(),
});

export const LocationPointInsertSchema = LocationPointSchema.pick({
  lat: true,
  lng: true,
  accuracy: true,
  recorded_at: true,
});

// ── Places ──
export const PlaceSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  label: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  radius_m: z.number(),
  created_at: z.string().datetime(),
});

// ── Stays ──
export const StaySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  place_id: z.string().uuid().nullable(),
  lat: z.number(),
  lng: z.number(),
  arrived_at: z.string().datetime(),
  left_at: z.string().datetime(),
  duration_s: z.number().int(),
  created_at: z.string().datetime(),
});

// ── Place Stats Daily ──
export const PlaceStatsDailySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  place_id: z.string().uuid(),
  date: z.string(), // YYYY-MM-DD
  total_duration_s: z.number().int(),
  visit_count: z.number().int(),
});

// ── API request/response schemas ──
export const IngestBodySchema = z.object({
  points: z.array(LocationPointInsertSchema).min(1).max(1000),
});
