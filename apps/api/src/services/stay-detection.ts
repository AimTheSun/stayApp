import {
  STAY_RADIUS_M,
  MIN_STAY_DURATION_S,
  MAX_POINT_GAP_S,
  type LocationPoint,
} from "@timespent/shared";

interface StayCandidate {
  lat: number;
  lng: number;
  arrived_at: string;
  left_at: string;
  duration_s: number;
}

/** Haversine distance in meters between two lat/lng points. */
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

/**
 * Detect stays from a chronologically-sorted list of location points.
 *
 * Algorithm:
 * 1. Walk through points, accumulating a cluster around a centroid.
 * 2. If a point is within STAY_RADIUS_M of the centroid, add it to the cluster.
 * 3. If the gap between consecutive points exceeds MAX_POINT_GAP_S, close the cluster.
 * 4. If a point is outside the radius, close the current cluster and start a new one.
 * 5. Keep clusters whose duration >= MIN_STAY_DURATION_S.
 */
export function detectStays(points: LocationPoint[]): StayCandidate[] {
  if (points.length < 2) return [];

  const sorted = [...points].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  const stays: StayCandidate[] = [];
  let clusterLat = sorted[0].lat;
  let clusterLng = sorted[0].lng;
  let clusterCount = 1;
  let clusterStart = new Date(sorted[0].recorded_at).getTime();
  let clusterEnd = clusterStart;

  function closeCluster() {
    const duration = (clusterEnd - clusterStart) / 1000;
    if (duration >= MIN_STAY_DURATION_S) {
      stays.push({
        lat: clusterLat,
        lng: clusterLng,
        arrived_at: new Date(clusterStart).toISOString(),
        left_at: new Date(clusterEnd).toISOString(),
        duration_s: Math.round(duration),
      });
    }
  }

  for (let i = 1; i < sorted.length; i++) {
    const pt = sorted[i];
    const ptTime = new Date(pt.recorded_at).getTime();
    const gap = (ptTime - clusterEnd) / 1000;
    const dist = haversineM(clusterLat, clusterLng, pt.lat, pt.lng);

    if (gap > MAX_POINT_GAP_S || dist > STAY_RADIUS_M) {
      closeCluster();
      clusterLat = pt.lat;
      clusterLng = pt.lng;
      clusterCount = 1;
      clusterStart = ptTime;
      clusterEnd = ptTime;
    } else {
      // Update running centroid
      clusterLat = (clusterLat * clusterCount + pt.lat) / (clusterCount + 1);
      clusterLng = (clusterLng * clusterCount + pt.lng) / (clusterCount + 1);
      clusterCount++;
      clusterEnd = ptTime;
    }
  }

  closeCluster();
  return stays;
}
