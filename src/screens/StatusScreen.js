import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { activeTrip, untaggedCount } from '../db';
import { formatDuration, formatMiles } from '../geo';
import { endCurrentTrip, isTracking, reconcile, startTracking, stopTracking } from '../tracking';
import { c, t } from '../theme';

export default function StatusScreen({ onReviewPress }) {
  const [tracking, setTracking] = useState(false);
  const [trip, setTrip] = useState(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    await reconcile();
    setTracking(await isTracking());
    setTrip(await activeTrip());
    setPending(await untaggedCount());
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  const toggle = async (on) => {
    setBusy(true);
    try {
      if (on) {
        const res = await startTracking();
        if (!res.ok) Alert.alert('Cannot track trips', res.reason);
      } else {
        await stopTracking();
      }
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={t.title}>Automatic tracking</Text>
          <Text style={[t.meta, { marginTop: 2 }]}>
            {tracking ? 'Watching for trips in the background' : 'Off — no trips will be recorded'}
          </Text>
        </View>
        <Switch value={tracking} onValueChange={toggle} disabled={busy} trackColor={{ true: c.business }} />
      </View>

      <View style={s.card}>
        {trip ? (
          <>
            <View style={s.liveRow}>
              <View style={s.dot} />
              <Text style={[t.meta, { color: c.live, fontWeight: '600' }]}>Trip in progress</Text>
            </View>
            <Text style={t.odometer}>{formatMiles(trip.distance_meters)}</Text>
            <Text style={t.meta}>miles · {formatDuration(Date.now() - trip.started_at)} so far</Text>

            <Pressable style={s.endButton} onPress={() => endCurrentTrip().then(refresh)}>
              <Text style={s.endButtonText}>End trip now</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={t.odometer}>0.0</Text>
            <Text style={t.meta}>
              {tracking
                ? 'No trip right now. Recording starts on its own once you get above about 11 mph.'
                : 'Turn tracking on to start logging trips.'}
            </Text>
          </>
        )}
      </View>

      {pending > 0 && (
        <Pressable style={s.pending} onPress={onReviewPress}>
          <Text style={[t.body, { fontWeight: '600' }]}>
            {pending} {pending === 1 ? 'trip needs' : 'trips need'} a category
          </Text>
          <Text style={t.meta}>Mark each one business or personal before you export.</Text>
        </Pressable>
      )}

      <Text style={s.footnote}>
        Keep "Always" location access on, or iOS will stop waking the app once you leave it. The blue
        status bar means a trip is being recorded.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, gap: 16 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 24,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.live },
  endButton: {
    marginTop: 20,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.hairline,
    alignItems: 'center',
  },
  endButtonText: { ...t.body, fontWeight: '600' },
  pending: {
    backgroundColor: c.businessSoft,
    borderRadius: 14,
    padding: 18,
    gap: 3,
  },
  footnote: { ...t.meta, lineHeight: 19, paddingHorizontal: 4 },
});
