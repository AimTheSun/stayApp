/** Radius in meters — points within this distance are considered the same stay */
export const STAY_RADIUS_M = 100;

/** Minimum duration in seconds for a cluster to qualify as a stay */
export const MIN_STAY_DURATION_S = 5 * 60; // 5 minutes

/** Maximum gap in seconds between consecutive points before splitting a stay */
export const MAX_POINT_GAP_S = 30 * 60; // 30 minutes

/** Default map zoom level */
export const DEFAULT_ZOOM = 13;
