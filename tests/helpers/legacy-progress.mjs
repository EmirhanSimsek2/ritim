// Static old-backup fixture. No retired feature operations are implemented here.
export const legacyDefinition = {
  id: 'legacy-reading', name: 'Eski okuma', unit: 'page', unitLabel: 'sayfa',
  scope: 'daily', goal: null, mode: 'one', archived: false,
};
export const legacySession = {
  id: 'legacy-session', jarId: legacyDefinition.id, name: 'Eski okuma',
  unit: 'page', unitLabel: 'sayfa', scope: 'daily', goal: null, mode: 'one',
  startedAt: '2026-11-01T10:00:00.000Z', ended: true,
  actions: [{ id: 'legacy-action', amount: 5, at: '2026-11-01T10:01:00.000Z', pagesBefore: null }],
};
