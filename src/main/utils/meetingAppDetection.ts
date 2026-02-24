const MEETING_APP_BUNDLE_IDS = new Set([
  'com.google.chrome',
  'com.google.chrome.canary',
  'com.microsoft.edgemac',
  'com.microsoft.edge',
  'com.brave.browser',
  'com.vivaldi.vivaldi',
  'company.thebrowser.browser', // Arc
  'org.mozilla.firefox',
  'com.apple.safari',
  'us.zoom.xos',
  'com.microsoft.teams',
  'com.microsoft.teams2',
  'com.webex.meetingmanager',
  'com.cisco.webexmeetingsapp',
]);

export const normalizeAppId = (entry: string): string => {
  const trimmed = entry.trim();
  const colonIndex = trimmed.indexOf(':');
  const value = colonIndex >= 0 ? trimmed.slice(colonIndex + 1) : trimmed;
  return value.toLowerCase();
};

export const isMeetingApp = (entry: string): boolean => {
  const normalized = normalizeAppId(entry);
  return MEETING_APP_BUNDLE_IDS.has(normalized);
};
