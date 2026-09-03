import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { db, activeTrip, lastPoint, deleteTrip } from './db';
import { haversine } from './geo';

export const LOCATION_TASK = 'mileage-background-location';

// --- Tuning knobs -----------------------------------------------------------
// Everything about trip detection lives here. If you get phantom trips or
// missed starts, this is the only block you need to touch.

/** Fixes worse than this (metres of horizontal error) are thrown away. */
const MAX_ACCURACY_M = 60;
/** Below this gap between fixes, treat the movement as GPS jitter, not distance. */
const MIN_POINT_M = 15;
/** ~11 mph. A new trip opens once you're moving at least this fast. */
const START_SPEED_MPS = 5.0;
/** ~3.4 mph. Anything slower counts as stopped for the idle timer. */
const STILL_SPEED_MPS = 1.5;
/** Sitting below STILL_SPEED this long ends the trip. */
const STOP_TIMEOUT_MS = 4 * 60 * 1000;
/** ~0.3 mi. Shorter trips are discarded as noise rather than saved. */
const MIN_TRIP_M = 480;

const LOCATION_OPTIONS = {
  accuracy: Location.Accuracy.High,
  // iOS drives background delivery off distance, not time.
  distanceInterval: 30,
  // Let iOS batch fixes and hand them over in groups — much easier on the battery
  // than waking the JS runtime for every single update.
  deferredUpdatesInterval: 15000,
  deferredUpdatesDistance: 100,
  activityType: Location.ActivityType.AutomotiveNavigation,
  // iOS will happily pause updates on your behalf and then never resume them.
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
};

// --- Trip state machine -----------------------------------------------------

function speedOf(loc, previous, ts) {
  const reported = loc.coords.speed;
  if (reported != null && reported >= 0) return reported;

  // iOS sometimes reports -1 for speed. Fall back to distance over time.
  if (previous) {
    const seconds = (ts - previous.ts) / 1000;
    if (seconds > 0.5) {
      const d = haversine(
        { lat: previous.lat, lon: previous.lon },
        { lat: loc.coords.latitude, lon: loc.coords.longitude }
      );
      return d / seconds;
    }
  }
  return 0;
}

async function openTrip(ts, lat, lon) {
  const res = await db.runAsync(
    `INSERT INTO trips (started_at, ended_at, last_moving_at, status, distance_meters,
                        start_lat, start_lon, end_lat, end_lon)
     VALUES (?, ?, ?, 'active', 0, ?, ?, ?, ?)`,
    ts, ts, ts, lat, lon, lat, lon
  );
  await db.runAsync(
    `INSERT INTO points (trip_id, ts, lat, lon, speed, accuracy) VALUES (?, ?, ?, ?, ?, ?)`,
    res.lastInsertRowId, ts, lat, lon, 0, null
  );
  return res.lastInsertRowId;
}

/** Finalise a trip, or bin it if it never went anywhere. */
async function closeTrip(tripId, endedAt) {
  const trip = await db.getFirstAsync(`SELECT * FROM trips WHERE id = ?`, tripId);
  if (!trip || trip.status !== 'active') return;

  if (trip.distance_meters < MIN_TRIP_M) {
    await deleteTrip(tripId);
    return;
  }
  await db.runAsync(
    `UPDATE trips SET status = 'complete', ended_at = ? WHERE id = ?`,
    Math.max(endedAt, trip.started_at + 1),
    tripId
  );
}

async function ingest(loc) {
  const ts = Math.round(loc.timestamp);
  const { latitude: lat, longitude: lon, accuracy } = loc.coords;

  if (accuracy != null && accuracy >= 0 && accuracy > MAX_ACCURACY_M) return;

  let trip = await activeTrip();

  if (trip) {
    // The car has been parked past the idle window, so this fix is the start of
    // something new. Close the old trip, backdated to when it actually stopped.
    if (ts - trip.last_moving_at > STOP_TIMEOUT_MS) {
      await closeTrip(trip.id, trip.last_moving_at);
      trip = null;
    }
  }

  if (trip) {
    const previous = await lastPoint(trip.id);
    const mps = speedOf(loc, previous, ts);
    const moved = previous
      ? haversine({ lat: previous.lat, lon: previous.lon }, { lat, lon })
      : 0;

    // Only real movement adds mileage; jitter while parked would otherwise
    // quietly inflate the total by a mile a day.
    const gained = moved >= MIN_POINT_M ? moved : 0;
    const lastMovingAt = mps >= STILL_SPEED_MPS ? ts : trip.last_moving_at;

    await db.runAsync(
      `INSERT INTO points (trip_id, ts, lat, lon, speed, accuracy) VALUES (?, ?, ?, ?, ?, ?)`,
      trip.id, ts, lat, lon, mps, accuracy ?? null
    );
    await db.runAsync(
      `UPDATE trips
          SET distance_meters = distance_meters + ?,
              ended_at = ?, end_lat = ?, end_lon = ?, last_moving_at = ?
        WHERE id = ?`,
      gained, ts, lat, lon, lastMovingAt, trip.id
    );
    return;
  }

  // No trip open. Only start one once we're clearly driving, so walking to the
  // mailbox doesn't turn into a logged trip.
  if (speedOf(loc, null, ts) >= START_SPEED_MPS) {
    await openTrip(ts, lat, lon);
  }
}

// Must be defined at module scope: when iOS wakes the app in the background it
// re-runs the bundle and looks for this registration before any UI exists.
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[mileage] location task error:', error.message);
    return;
  }
  const locations = data?.locations ?? [];
  for (const loc of locations) {
    try {
      await ingest(loc);
    } catch (e) {
      console.warn('[mileage] failed to record a fix:', e?.message);
    }
  }
});

// --- Public API -------------------------------------------------------------

export async function requestPermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return { ok: false, reason: 'Location access is off. Turn it on in Settings to track trips.' };
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    return {
      ok: false,
      reason:
        'Trips can only be detected automatically with "Always" location access. ' +
        'Open Settings › Privacy › Location Services and change it to Always.',
    };
  }
  return { ok: true };
}

export const isTracking = () => Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);

export async function startTracking() {
  const perms = await requestPermissions();
  if (!perms.ok) return perms;

  if (!(await isTracking())) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, LOCATION_OPTIONS);
  }
  return { ok: true };
}

export async function stopTracking() {
  if (await isTracking()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  const trip = await activeTrip();
  if (trip) await closeTrip(trip.id, trip.ended_at ?? Date.now());
}

/** Manually wrap up the trip in progress. */
export async function endCurrentTrip() {
  const trip = await activeTrip();
  if (trip) await closeTrip(trip.id, trip.ended_at ?? Date.now());
}

/**
 * While the car sits parked, iOS stops delivering fixes — so nothing arrives to
 * trigger the idle timeout and the trip stays open. Call this whenever the app
 * comes to the foreground to close out anything that has gone stale.
 */
export async function reconcile() {
  const trip = await activeTrip();
  if (!trip) return;
  if (Date.now() - trip.last_moving_at > STOP_TIMEOUT_MS) {
    await closeTrip(trip.id, trip.ended_at ?? trip.last_moving_at);
  }
}
