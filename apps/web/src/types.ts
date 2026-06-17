export interface Place {
  id: string;
  user_id: string;
  label: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  category?: string | null;
}

export interface StayRow {
  id: string;
  user_id: string;
  place_id: string | null;
  lat: number;
  lng: number;
  arrived_at: string;
  left_at: string | null;
  duration_s: number | null;
  places: { label: string | null } | null;
}
