import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { metersToMiles } from './geo';

const HEADERS = [
  'Date',
  'Start time',
  'End time',
  'Miles',
  'Category',
  'Purpose',
  'Start location',
  'End location',
];

const cell = (value) => {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const d = (ms) => new Date(ms);
const dateOf = (ms) => d(ms).toLocaleDateString('en-US');
const timeOf = (ms) => d(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function buildCsv(trips, { rate } = {}) {
  const rows = trips.map((t) => [
    dateOf(t.started_at),
    timeOf(t.started_at),
    t.ended_at ? timeOf(t.ended_at) : '',
    metersToMiles(t.distance_meters).toFixed(1),
    t.category === 'business' ? 'Business' : t.category === 'personal' ? 'Personal' : 'Unclassified',
    t.purpose ?? '',
    t.start_label ?? '',
    t.end_label ?? '',
  ]);

  const businessMiles = trips
    .filter((t) => t.category === 'business')
    .reduce((sum, t) => sum + metersToMiles(t.distance_meters), 0);

  const totals = [
    [],
    ['Business miles', '', '', businessMiles.toFixed(1)],
    ...(rate ? [['Deduction at $' + rate.toFixed(3) + '/mi', '', '', (businessMiles * rate).toFixed(2)]] : []),
  ];

  return [HEADERS, ...rows, ...totals].map((r) => r.map(cell).join(',')).join('\r\n');
}

export async function exportCsv(trips, filename, options) {
  // The BOM is what makes Excel open this as UTF-8 instead of mangling it.
  const contents = '\uFEFF' + buildCsv(trips, options);

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'Export mileage',
    });
  }
  return file.uri;
}
