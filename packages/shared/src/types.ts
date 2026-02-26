import { z } from "zod";
import {
  ProfileSchema,
  LocationPointSchema,
  LocationPointInsertSchema,
  PlaceSchema,
  StaySchema,
  PlaceStatsDailySchema,
  IngestBodySchema,
} from "./schemas.js";

export type Profile = z.infer<typeof ProfileSchema>;
export type LocationPoint = z.infer<typeof LocationPointSchema>;
export type LocationPointInsert = z.infer<typeof LocationPointInsertSchema>;
export type Place = z.infer<typeof PlaceSchema>;
export type Stay = z.infer<typeof StaySchema>;
export type PlaceStatsDaily = z.infer<typeof PlaceStatsDailySchema>;
export type IngestBody = z.infer<typeof IngestBodySchema>;
