import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ingestPoints, type IngestPoint } from "./api";

/** Flush the buffer once it reaches this many points. */
const BATCH_SIZE = 6;
/** Also flush on this cadence so partial buffers don't sit too long. */
const FLUSH_INTERVAL_MS = 30_000;
/** Store at most one point per this interval (≈ sampling rate). */
const MIN_SAMPLE_INTERVAL_MS = 15_000;
/** Ignore fixes less precise than this (meters). */
const MAX_ACCURACY_M = 100;

type PermissionState = "unknown" | "prompt" | "granted" | "denied";

export interface LastFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: string;
}

interface TrackingContextValue {
  isTracking: boolean;
  permission: PermissionState;
  capturedCount: number;
  sentCount: number;
  pendingCount: number;
  lastFix: LastFix | null;
  error: string | null;
  start: () => void;
  stop: () => void;
}

const TrackingContext = createContext<TrackingContextValue | undefined>(undefined);

export function TrackingProvider({ children }: { children: ReactNode }) {
  const [isTracking, setIsTracking] = useState(false);
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [capturedCount, setCapturedCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastFix, setLastFix] = useState<LastFix | null>(null);
  const [error, setError] = useState<string | null>(null);

  const watchId = useRef<number | null>(null);
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const buffer = useRef<IngestPoint[]>([]);
  const lastSampleAt = useRef(0);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current || buffer.current.length === 0) return;
    flushing.current = true;
    const batch = buffer.current;
    buffer.current = [];
    setPendingCount(0);
    try {
      const { inserted } = await ingestPoints(batch);
      setSentCount((n) => n + inserted);
      setError(null);
    } catch (e) {
      // Re-queue the failed batch so points aren't lost.
      buffer.current = [...batch, ...buffer.current];
      setPendingCount(buffer.current.length);
      setError(e instanceof Error ? e.message : "Failed to sync points");
    } finally {
      flushing.current = false;
    }
  }, []);

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (flushTimer.current) {
      clearInterval(flushTimer.current);
      flushTimer.current = null;
    }
    setIsTracking(false);
    void flush(); // send whatever's left
  }, [flush]);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("This browser doesn't support location.");
      return;
    }
    setError(null);
    setIsTracking(true);

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPermission("granted");
        const { latitude, longitude, accuracy } = pos.coords;
        const at = new Date(pos.timestamp).toISOString();

        // Always update the live readout.
        setLastFix({ lat: latitude, lng: longitude, accuracy, at });

        // Drop very imprecise fixes.
        if (accuracy != null && accuracy > MAX_ACCURACY_M) return;

        // Throttle stored points to roughly the sample interval.
        const now = Date.now();
        if (now - lastSampleAt.current < MIN_SAMPLE_INTERVAL_MS) return;
        lastSampleAt.current = now;

        buffer.current.push({
          lat: latitude,
          lng: longitude,
          accuracy: accuracy ?? null,
          recorded_at: at,
        });
        setCapturedCount((n) => n + 1);
        setPendingCount(buffer.current.length);

        if (buffer.current.length >= BATCH_SIZE) void flush();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermission("denied");
          setError("Location permission denied. Enable it to start tracking.");
          stop();
        } else {
          setError(err.message || "Couldn't get your location.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 27_000 },
    );

    flushTimer.current = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  }, [flush, stop]);

  // Read current permission state (best-effort; not supported everywhere).
  useEffect(() => {
    if (!navigator.permissions?.query) return;
    let active = true;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (!active) return;
        setPermission(status.state as PermissionState);
        status.onchange = () => setPermission(status.state as PermissionState);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Stop tracking if the provider unmounts.
  useEffect(() => () => stop(), [stop]);

  return (
    <TrackingContext.Provider
      value={{
        isTracking,
        permission,
        capturedCount,
        sentCount,
        pendingCount,
        lastFix,
        error,
        start,
        stop,
      }}
    >
      {children}
    </TrackingContext.Provider>
  );
}

export function useTracking() {
  const ctx = useContext(TrackingContext);
  if (!ctx) throw new Error("useTracking must be used within a TrackingProvider");
  return ctx;
}
