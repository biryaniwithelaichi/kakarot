export function formatTimestamp(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export function formatTime(ms: number): string {
  return new Date(ms).toISOString().substring(14, 19);
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString();
}

export function formatMeetingDate(date: Date): string {
  const d = new Date(date);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const day = d.toLocaleDateString('en-US', { day: '2-digit' });
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const year = d.toLocaleDateString('en-US', { year: 'numeric' });
  return `${weekday} - ${day} ${month}, ${year}`;
}

export function getSpeakerLabel(source: 'mic' | 'system'): string {
  return source === 'mic' ? 'You' : 'Other';
}

export function formatDateShort(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

export function formatTimeShort(date: Date): string {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function isToday(date: Date): boolean {
  return new Date(date).toDateString() === new Date().toDateString();
}

export function isTomorrow(date: Date): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return new Date(date).toDateString() === tomorrow.toDateString();
}

export function formatDateTimeContext(date: Date): string {
  const d = new Date(date);
  if (isToday(d)) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-[#4ea8dd]',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-yellow-500',
  'bg-red-500',
  'bg-teal-500',
];

export function getAvatarColor(email: string): string {
  const hash = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function getInitials(identifier: string, name?: string): string {
  if (name) {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  return identifier[0].toUpperCase();
}

export function formatRelativeTime(timestampMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(timestampMs / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function formatLastMeeting(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
