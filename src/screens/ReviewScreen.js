import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import { classifyTrip, deleteTrip, pointsForTrip, setTripLabels, taggedTrips, untaggedTrips } from '../db';
import { formatDuration, formatMiles } from '../geo';
import TripMap from '../TripMap';
import { c, t } from '../theme';

const labelFor = (place) => {
  if (!place) return null;
  const street = [place.streetNumber, place.street].filter(Boolean).join(' ') || place.name;
  return [street, place.city].filter(Boolean).join(', ') || place.region || null;
};

/** Fill in street names for trips that don't have them yet. Foreground only —
 *  reverse geocoding needs the network and isn't worth waking the app for. */
async function backfillLabels(trips, onDone) {
  for (const trip of trips.filter((x) => !x.start_label && x.start_lat != null)) {
    try {
      const [start] = await Location.reverseGeocodeAsync({
        latitude: trip.start_lat,
        longitude: trip.start_lon,
      });
      const [end] = await Location.reverseGeocodeAsync({
        latitude: trip.end_lat ?? trip.start_lat,
        longitude: trip.end_lon ?? trip.start_lon,
      });
      await setTripLabels(trip.id, labelFor(start), labelFor(end));
    } catch {
      // Offline or rate-limited. The trip still exports, just without a street name.
    }
  }
  onDone();
}

function TripCard({ trip, onChanged }) {
  const [purpose, setPurpose] = useState(trip.purpose ?? '');
  const [showMap, setShowMap] = useState(false);
  const [route, setRoute] = useState(null);
  const started = new Date(trip.started_at);
  const hasGeo = trip.start_lat != null;

  useEffect(() => {
    if (showMap && route == null) pointsForTrip(trip.id).then(setRoute);
  }, [showMap, route, trip.id]);

  const openInMaps = () => {
    const from = `${trip.start_lat},${trip.start_lon}`;
    const to = trip.end_lat != null ? `${trip.end_lat},${trip.end_lon}` : from;
    Linking.openURL(`http://maps.apple.com/?saddr=${from}&daddr=${to}&dirflg=d`);
  };

  const choose = (category) => classifyTrip(trip.id, category, purpose.trim() || null).then(onChanged);

  const confirmDelete = () =>
    Alert.alert('Delete this trip?', 'It will be removed from your records for good.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTrip(trip.id).then(onChanged) },
    ]);

  const tone =
    trip.category === 'business' ? c.business : trip.category === 'personal' ? c.personal : c.inkSoft;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={t.figure}>{formatMiles(trip.distance_meters)} mi</Text>
          <Text style={t.meta}>
            {started.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {' · '}
            {started.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            {trip.ended_at ? ` · ${formatDuration(trip.ended_at - trip.started_at)}` : ''}
          </Text>
        </View>
        {trip.category && (
          <View style={[s.badge, { backgroundColor: tone }]}>
            <Text style={s.badgeText}>{trip.category === 'business' ? 'Business' : 'Personal'}</Text>
          </View>
        )}
      </View>

      {(trip.start_label || trip.end_label) && (
        <Text style={[t.meta, { marginTop: 8 }]}>
          {trip.start_label ?? 'Unknown'} → {trip.end_label ?? 'Unknown'}
        </Text>
      )}

      {hasGeo && (
        <>
          <Pressable style={s.mapToggle} onPress={() => setShowMap((v) => !v)}>
            <Text style={[t.meta, { fontWeight: '600', color: c.business }]}>
              {showMap ? 'Hide route' : 'Show route'}
            </Text>
          </Pressable>

          {showMap && (
            <View style={{ gap: 8 }}>
              <TripMap
                points={route ?? []}
                start={{ lat: trip.start_lat, lon: trip.start_lon }}
                end={trip.end_lat != null ? { lat: trip.end_lat, lon: trip.end_lon } : undefined}
                interactive={false}
              />
              <Pressable style={s.mapsLink} onPress={openInMaps}>
                <Text style={[s.btnText, { color: c.ink }]}>Open in Maps</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      <TextInput
        style={s.input}
        value={purpose}
        onChangeText={setPurpose}
        onBlur={() => trip.category && choose(trip.category)}
        placeholder="Purpose — client visit, site inspection…"
        placeholderTextColor={c.inkSoft}
        returnKeyType="done"
      />

      <View style={s.actions}>
        <Pressable
          onPress={() => choose('business')}
          style={[s.btn, trip.category === 'business' && { backgroundColor: c.businessSoft, borderColor: c.business }]}
        >
          <Text style={[s.btnText, { color: c.business }]}>Business</Text>
        </Pressable>
        <Pressable
          onPress={() => choose('personal')}
          style={[s.btn, trip.category === 'personal' && { backgroundColor: c.personalSoft, borderColor: c.personal }]}
        >
          <Text style={[s.btnText, { color: c.personal }]}>Personal</Text>
        </Pressable>
        <Pressable onPress={confirmDelete} style={s.discard}>
          <Text style={[s.btnText, { color: c.inkSoft }]}>Discard</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ReviewScreen() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const untagged = await untaggedTrips();
    const tagged = await taggedTrips();
    setTrips([...untagged, ...tagged]);
    setLoading(false);
    backfillLabels(untagged, async () => {
      setTrips([...(await untaggedTrips()), ...(await taggedTrips())]);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <FlatList
      data={trips}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={s.page}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      renderItem={({ item }) => <TripCard trip={item} onChanged={load} />}
      ListEmptyComponent={
        <View style={s.empty}>
          <Text style={t.title}>No trips yet</Text>
          <Text style={[t.meta, { marginTop: 6, textAlign: 'center', lineHeight: 20 }]}>
            Once tracking is on, drives show up here for you to mark business or personal.
          </Text>
        </View>
      }
    />
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 12, flexGrow: 1 },
  card: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  input: {
    ...t.body,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: c.bg,
    borderRadius: 9,
  },
  mapToggle: { marginTop: 10, alignSelf: 'flex-start' },
  mapsLink: {
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: c.hairline,
    alignItems: 'center',
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: c.hairline,
    alignItems: 'center',
  },
  discard: { paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 14, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
});
