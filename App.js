import { useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// Importing this registers the background location task. It has to happen at
// startup, before any screen mounts, or iOS won't find the task when it wakes
// the app to hand over location fixes.
import './src/tracking';

import StatusScreen from './src/screens/StatusScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import ExportScreen from './src/screens/ExportScreen';
import { c, t } from './src/theme';

const TABS = [
  { key: 'status', label: 'Track' },
  { key: 'review', label: 'Review' },
  { key: 'export', label: 'Export' },
];

export default function App() {
  const [tab, setTab] = useState('status');

  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.root}>
        <StatusBar barStyle="dark-content" />

        <View style={s.body}>
          {tab === 'status' && <StatusScreen onReviewPress={() => setTab('review')} />}
          {tab === 'review' && <ReviewScreen />}
          {tab === 'export' && <ExportScreen />}
        </View>

        <View style={s.tabs}>
          {TABS.map((item) => (
            <Pressable key={item.key} style={s.tab} onPress={() => setTab(item.key)}>
              <Text style={[s.tabLabel, tab === item.key && s.tabLabelOn]}>{item.label}</Text>
              {tab === item.key && <View style={s.marker} />}
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  body: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: c.hairline,
    backgroundColor: c.surface,
  },
  tab: { flex: 1, alignItems: 'center', paddingTop: 14, paddingBottom: 10, gap: 6 },
  tabLabel: { ...t.body, color: c.inkSoft, fontWeight: '500' },
  tabLabelOn: { color: c.ink, fontWeight: '600' },
  marker: { width: 18, height: 2, borderRadius: 1, backgroundColor: c.ink },
});
