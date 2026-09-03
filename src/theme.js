// The one distinction this app exists to make is business vs personal, so the
// palette spends its colour there and stays quiet everywhere else.

export const c = {
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  ink: '#16181D',
  inkSoft: '#5B616E',
  hairline: '#E3E6EB',
  business: '#0F766E',
  businessSoft: '#E3F2F0',
  personal: '#B45309',
  personalSoft: '#FBF0DF',
  live: '#DC2626',
};

export const t = {
  odometer: { fontSize: 56, fontWeight: '300', color: c.ink, fontVariant: ['tabular-nums'] },
  figure: { fontSize: 26, fontWeight: '500', color: c.ink, fontVariant: ['tabular-nums'] },
  title: { fontSize: 20, fontWeight: '600', color: c.ink },
  body: { fontSize: 15, color: c.ink },
  meta: { fontSize: 13, color: c.inkSoft },
};
