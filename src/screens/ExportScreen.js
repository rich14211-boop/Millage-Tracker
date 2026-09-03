import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { tripsBetween } from '../db';
import { metersToMiles } from '../geo';
import { exportCsv } from '../csv';
import { c, t } from '../theme';

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1).getTime();

function ranges() {
  const now = new Date();
  const thisMonth = startOfMonth(now);
  const lastMonth = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return [
    { key: 'month', label: 'This month', from: thisMonth, to: Date.now() },
    { key: 'last', label: 'Last month', from: lastMonth, to: thisMonth },
    { key: 'ytd', label: 'Year to date', from: new Date(now.getFullYear(), 0, 1).getTime(), to: Date.now() },
    { key: 'all', label: 'Everything', from: 0, to: Date.now() },
  ];
}

export default function ExportScreen() {
  const options = ranges();
  const [selected, setSelected] = useState(options[0]);
  const [businessOnly, setBusinessOnly] = useState(false);
  const [rate, setRate] = useState('0.70');
  const [trips, setTrips] = useState([]);

  const load = useCallback(async () => {
    const rows = await tripsBetween(selected.from, selected.to);
    setTrips(businessOnly ? rows.filter((r) => r.category === 'business') : rows);
  }, [selected, businessOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const sum = (predicate) =>
    trips.filter(predicate).reduce((n, x) => n + metersToMiles(x.distance_meters), 0);

  const business = sum((x) => x.category === 'business');
  const personal = sum((x) => x.category === 'personal');
  const unclassified = trips.filter((x) => !x.category).length;
  const parsedRate = parseFloat(rate);

  const run = async () => {
    if (!trips.length) {
      Alert.alert('Nothing to export', 'No trips fall inside this date range.');
      return;
    }
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await exportCsv(trips, `mileage-${selected.key}-${stamp}.csv`, {
        rate: Number.isFinite(parsedRate) ? parsedRate : undefined,
      });
    } catch (e) {
      Alert.alert('Export failed', e?.message ?? 'The file could not be written.');
    }
  };

  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.chips}>
        {options.map((o) => (
          <Pressable
            key={o.key}
            onPress={() => setSelected(o)}
            style={[s.chip, selected.key === o.key && s.chipOn]}
          >
            <Text style={[s.chipText, selected.key === o.key && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.card}>
        <View style={s.line}>
          <Text style={t.body}>Business</Text>
          <Text style={[t.figure, { color: c.business }]}>{business.toFixed(1)} mi</Text>
        </View>
        <View style={s.rule} />
        <View style={s.line}>
          <Text style={t.body}>Personal</Text>
          <Text style={[t.figure, { color: c.personal }]}>{personal.toFixed(1)} mi</Text>
        </View>

        {unclassified > 0 && (
          <Text style={[t.meta, { marginTop: 14, color: c.live }]}>
            {unclassified} {unclassified === 1 ? 'trip is' : 'trips are'} still unclassified and will
            export without a category.
          </Text>
        )}
      </View>

      <View style={s.card}>
        <Text style={[t.body, { fontWeight: '600' }]}>Deduction estimate</Text>
        <View style={[s.line, { marginTop: 12 }]}>
          <View style={s.rateBox}>
            <Text style={t.body}>$</Text>
            <TextInput
              style={[t.body, { minWidth: 60 }]}
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
            />
            <Text style={t.meta}>per mile</Text>
          </View>
          <Text style={t.figure}>
            ${(business * (Number.isFinite(parsedRate) ? parsedRate : 0)).toFixed(2)}
          </Text>
        </View>
        <Text style={[t.meta, { marginTop: 10, lineHeight: 19 }]}>
          Set this to the current IRS standard mileage rate — it changes every year, so check
          irs.gov before you file.
        </Text>
      </View>

      <Pressable onPress={() => setBusinessOnly((v) => !v)} style={s.toggle}>
        <View style={[s.box, businessOnly && { backgroundColor: c.business, borderColor: c.business }]}>
          {businessOnly && <Text style={s.tick}>✓</Text>}
        </View>
        <Text style={t.body}>Business trips only</Text>
      </Pressable>

      <Pressable style={s.export} onPress={run}>
        <Text style={s.exportText}>Export {trips.length} trips as CSV</Text>
      </Pressable>

      <Text style={[t.meta, { paddingHorizontal: 4, lineHeight: 19 }]}>
        The share sheet lets you drop the file straight into Numbers, Excel, Google Sheets, Files, or
        an email.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  chipOn: { backgroundColor: c.ink, borderColor: c.ink },
  chipText: { fontSize: 14, fontWeight: '500', color: c.ink },
  card: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rule: { height: 1, backgroundColor: c.hairline, marginVertical: 12 },
  rateBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: c.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: { color: '#fff', fontSize: 13, fontWeight: '700' },
  export: {
    backgroundColor: c.business,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  exportText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
