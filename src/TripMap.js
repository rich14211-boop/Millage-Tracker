import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';

import { c } from './theme';

const toCoord = (p) => ({ latitude: p.lat, longitude: p.lon });

/**
 * A trip's route on an Apple Map: the recorded point trail as a line, with a
 * start and an end pin. Shared by the Review tab (a finished trip) and the
 * Track tab (the trip in progress, with `showUser` on to draw the blue dot).
 *
 * No `provider` prop, so iOS uses Apple Maps — no API key, no billing. A
 * Google Maps key would be needed here only for Android.
 */
export default function TripMap({
  points = [],
  start,
  end,
  style,
  showUser = false,
  interactive = true,
}) {
  const mapRef = useRef(null);

  const coords = points.map(toCoord);
  const startCoord = start ? toCoord(start) : coords[0];
  const endCoord = end ? toCoord(end) : coords[coords.length - 1];

  const fit = useCallback(() => {
    const all = coords.length ? coords : [startCoord, endCoord].filter(Boolean);
    if (all.length < 1 || !mapRef.current) return;
    mapRef.current.fitToCoordinates(all, {
      edgePadding: { top: 44, right: 44, bottom: 44, left: 44 },
      animated: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords.length]);

  useEffect(fit, [fit]);

  const initialRegion = startCoord && {
    latitude: startCoord.latitude,
    longitude: startCoord.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  return (
    <View style={[s.wrap, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion || undefined}
        onMapReady={fit}
        showsUserLocation={showUser}
        showsMyLocationButton={false}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {coords.length > 1 && (
          <Polyline coordinates={coords} strokeWidth={4} strokeColor={c.business} />
        )}
        {startCoord && <Marker coordinate={startCoord} title="Start" pinColor={c.business} />}
        {endCoord && coords.length > 1 && (
          <Marker coordinate={endCoord} title="End" pinColor={c.personal} />
        )}
      </MapView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: c.bg,
  },
});
