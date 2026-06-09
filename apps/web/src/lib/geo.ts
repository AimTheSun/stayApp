/** Default radius in meters for a new place preset. */
export const DEFAULT_PLACE_RADIUS_M = 100;

/** Haversine distance in meters between two lat/lng points. */
export function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number | null;
}

function getPosition(options: PositionOptions): Promise<Fix> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        }),
      reject,
      options,
    );
  });
}

/**
 * Get a location fix: try high accuracy first, then fall back to a
 * low-accuracy attempt (desktop browsers without GPS often fail the first).
 */
export async function locate(): Promise<Fix> {
  if (!("geolocation" in navigator)) {
    throw new Error("This device doesn't expose location to the browser.");
  }
  try {
    return await getPosition({
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 60_000,
    });
  } catch (err) {
    const geoErr = err as GeolocationPositionError;
    if (geoErr.code === geoErr.PERMISSION_DENIED) {
      throw new Error("Location is blocked. Allow it in your browser settings and try again.");
    }
    try {
      return await getPosition({
        enableHighAccuracy: false,
        timeout: 20_000,
        maximumAge: 10 * 60_000,
      });
    } catch {
      throw new Error(
        "Couldn't get a location fix. Desktop browsers without GPS often can't — try Chrome/Edge, or test on your phone.",
      );
    }
  }
}
