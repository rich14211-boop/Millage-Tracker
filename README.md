# Mileage

Automatic GPS mileage tracking for iOS. Detects when you start driving, logs the trip in the
background, lets you mark each one business or personal, and exports to CSV.

## Setup

```bash
npx create-expo-app@latest mileage-tracker --template blank
cd mileage-tracker

npx expo install expo-location expo-task-manager expo-sqlite expo-file-system expo-sharing expo-dev-client
```

Then copy `App.js`, `app.json`, and the `src/` folder from here over the generated ones. Running
`npx expo install` rather than `npm install` matters — it pins each package to the version that
matches your SDK, which is the single most common source of native build failures.

## Running it on your phone

**Expo Go will not work.** Background execution isn't available to it on iOS, so `TaskManager` never
fires and trips silently never record. You need a development build:

```bash
npx expo run:ios --device        # needs Xcode, plugs into a real iPhone
```

Or over the cloud, if you'd rather not install Xcode:

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform ios
```

A free Apple developer account works. Builds signed that way expire after 7 days and need
reinstalling; a paid account ($99/yr) stretches that to a year.

The first launch will ask for location twice. Answer **Always** to the second prompt. "While Using
the App" is not enough — iOS will stop delivering fixes the moment you switch away, and you'll get
trips that end at the edge of your driveway.

## How trip detection works

There's no single iOS API that says "the user is driving." What the app does instead:

1. `expo-location` runs continuous background location updates with `activityType` set to
   `AutomotiveNavigation`, so iOS applies its driving-specific filtering.
2. Each fix arrives in a `TaskManager` task, which runs in a bare JS context with no UI mounted —
   which is why all state lives in SQLite rather than React state.
3. A trip opens the first time speed crosses ~11 mph, and closes after 4 minutes below ~3.4 mph.
4. Distance accumulates as the sum of great-circle hops between fixes, ignoring anything under 15 m
   so that GPS jitter while parked doesn't quietly add a mile a day to your total.
5. Trips under 0.3 mi are deleted rather than saved.

Every threshold is a named constant at the top of `src/tracking.js`. Those are the numbers to adjust
if you get phantom trips or missed starts.

### The parked-car problem

iOS delivers background fixes based on distance travelled, not time. Sit still and nothing arrives —
so nothing triggers the idle timeout, and the trip stays open indefinitely. Two things handle it:
`reconcile()` runs whenever the app comes to the foreground, and the ingest path checks for a stale
trip before recording any new fix. Either way the trip gets closed with its end time backdated to
when you actually stopped, not when the app noticed.

## Battery

Continuous high-accuracy background location is the expensive option, and there's no way around that
if you want genuine auto-detection. `deferredUpdatesInterval` lets iOS batch fixes and hand them over
in groups instead of waking the JS runtime for every one, which helps a lot. Expect a noticeable but
livable hit — roughly comparable to leaving a navigation app running. If it bothers you, dropping
`accuracy` to `Location.Accuracy.Balanced` cuts it further at the cost of some precision on short
trips.

## Records for the IRS

The export includes date, start and end times, miles, category, purpose, and street-level start and
end locations. That covers what a mileage log is expected to show. The two things worth knowing:

- **Fill in the purpose field.** A business trip with no stated purpose is the first thing an auditor
  questions. The Review tab prompts for it.
- **The rate on the Export tab defaults to $0.70/mi and is editable.** The IRS resets the standard
  mileage rate each year, so check the current figure on irs.gov rather than trusting the default.

Reverse geocoding for street names happens in the foreground, on demand, when you open the Review
tab. It needs a network connection; without one the trip still exports, just with blank location
columns.

## Files

| Path | What's in it |
| --- | --- |
| `src/tracking.js` | Background task, trip state machine, tuning constants |
| `src/db.js` | SQLite schema and queries |
| `src/geo.js` | Haversine distance, formatting |
| `src/csv.js` | CSV building and share-sheet export |
| `src/screens/` | Track, Review, and Export tabs |

## If you ship it to the App Store

Apple reviews background location use specifically and rejects apps that can't justify it. A mileage
tracker is a well-established use case, but you'll need to explain in the review notes why the app
needs location when it isn't open. For personal use on your own device, none of this applies.
