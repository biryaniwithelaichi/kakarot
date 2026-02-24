import { describe, it, expect } from 'vitest';
import {
  formatTimestamp,
  formatDuration,
  formatTime,
  getSpeakerLabel,
  getInitials,
  getAvatarColor,
  formatRelativeTime,
} from './formatters';

describe('formatTimestamp', () => {
  it('formats zero milliseconds', () => {
    expect(formatTimestamp(0)).toBe('0:00');
  });

  it('formats seconds only', () => {
    expect(formatTimestamp(45000)).toBe('0:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimestamp(125000)).toBe('2:05');
  });

  it('pads single-digit seconds', () => {
    expect(formatTimestamp(63000)).toBe('1:03');
  });

  it('handles large values', () => {
    expect(formatTimestamp(3661000)).toBe('61:01');
  });
});

describe('formatDuration', () => {
  it('formats zero', () => {
    expect(formatDuration(0)).toBe('0m 0s');
  });

  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('0m 45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2m 5s');
  });
});

describe('formatTime', () => {
  it('formats ms to MM:SS from ISO', () => {
    // 90000ms = 1m 30s, ISO substring(14,19) = "01:30"
    expect(formatTime(90000)).toBe('01:30');
  });
});

describe('getSpeakerLabel', () => {
  it('returns You for mic', () => {
    expect(getSpeakerLabel('mic')).toBe('You');
  });

  it('returns Other for system', () => {
    expect(getSpeakerLabel('system')).toBe('Other');
  });
});

describe('getInitials', () => {
  it('returns two initials from a full name', () => {
    expect(getInitials('john@example.com', 'John Doe')).toBe('JD');
  });

  it('returns first letter of identifier when no name', () => {
    expect(getInitials('alice@example.com')).toBe('A');
  });

  it('caps at two characters', () => {
    expect(getInitials('x', 'Alice Bob Charlie')).toBe('AB');
  });
});

describe('getAvatarColor', () => {
  it('returns a valid tailwind class', () => {
    const color = getAvatarColor('test@example.com');
    expect(color).toMatch(/^bg-/);
  });

  it('is deterministic', () => {
    const a = getAvatarColor('foo@bar.com');
    const b = getAvatarColor('foo@bar.com');
    expect(a).toBe(b);
  });
});

describe('formatRelativeTime', () => {
  it('formats zero', () => {
    expect(formatRelativeTime(0)).toBe('00:00');
  });

  it('formats 90 seconds', () => {
    expect(formatRelativeTime(90000)).toBe('01:30');
  });

  it('handles negative values gracefully', () => {
    expect(formatRelativeTime(-1000)).toBe('00:00');
  });
});
