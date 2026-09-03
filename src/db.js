import * as SQLite from 'expo-sqlite';

// Opened at module scope so the background location task — which runs in its own
// JS context with no React tree mounted — can reach the same database.
export const db = SQLite.openDatabaseSync('mileage.db');

db.execSync(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS trips (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at       INTEGER NOT NULL,
    ended_at         INTEGER,
    last_moving_at   INTEGER NOT NULL,
    distance_meters  REAL    NOT NULL DEFAULT 0,
    status           TEXT    NOT NULL DEFAULT 'active',   -- active | complete
    category         TEXT,                                -- business | personal
    purpose          TEXT,
    start_lat REAL, start_lon REAL, start_label TEXT,
    end_lat   REAL, end_lon   REAL, end_label   TEXT
  );

  CREATE TABLE IF NOT EXISTS points (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id  INTEGER NOT NULL,
    ts       INTEGER NOT NULL,
    lat      REAL NOT NULL,
    lon      REAL NOT NULL,
    speed    REAL,
    accuracy REAL
  );

  CREATE INDEX IF NOT EXISTS idx_points_trip ON points (trip_id, ts);
  CREATE INDEX IF NOT EXISTS idx_trips_status ON trips (status, started_at);
`);

export const activeTrip = () =>
  db.getFirstAsync(`SELECT * FROM trips WHERE status = 'active' ORDER BY id DESC LIMIT 1`);

export const lastPoint = (tripId) =>
  db.getFirstAsync(`SELECT * FROM points WHERE trip_id = ? ORDER BY ts DESC LIMIT 1`, tripId);

export const untaggedTrips = () =>
  db.getAllAsync(
    `SELECT * FROM trips
      WHERE status = 'complete' AND category IS NULL
      ORDER BY started_at DESC`
  );

export const taggedTrips = () =>
  db.getAllAsync(
    `SELECT * FROM trips
      WHERE status = 'complete' AND category IS NOT NULL
      ORDER BY started_at DESC
      LIMIT 300`
  );

export const untaggedCount = async () => {
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS n FROM trips WHERE status = 'complete' AND category IS NULL`
  );
  return row?.n ?? 0;
};

export const tripsBetween = (fromMs, toMs) =>
  db.getAllAsync(
    `SELECT * FROM trips
      WHERE status = 'complete' AND started_at >= ? AND started_at < ?
      ORDER BY started_at ASC`,
    fromMs,
    toMs
  );

export const classifyTrip = (id, category, purpose) =>
  db.runAsync(`UPDATE trips SET category = ?, purpose = ? WHERE id = ?`, category, purpose ?? null, id);

export const setTripLabels = (id, startLabel, endLabel) =>
  db.runAsync(`UPDATE trips SET start_label = ?, end_label = ? WHERE id = ?`, startLabel, endLabel, id);

export const setTripDistance = (id, meters) =>
  db.runAsync(`UPDATE trips SET distance_meters = ? WHERE id = ?`, meters, id);

export async function deleteTrip(id) {
  await db.runAsync(`DELETE FROM points WHERE trip_id = ?`, id);
  await db.runAsync(`DELETE FROM trips WHERE id = ?`, id);
}
