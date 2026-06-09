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

/** Wrap the geolocation API in a promise with sane mobile defaults. */
export function locate(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This device doesn't expose location to the browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        }),
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Location is blocked. Allow it in your browser settings and try again."
            : "Couldn't get a location fix. Try again near a window or outside.";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  });
}
