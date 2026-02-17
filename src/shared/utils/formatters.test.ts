import { describe, it, expect } from 'vitest';
import {
  formatTimestamp,
  formatDuration,
  getSpeakerLabel,
  getAvatarColor,
  getInitials,
  formatRelativeTime,
} from './formatters';

describe('formatTimestamp', () => {
  it('formats zero milliseconds', () => {
    expect(formatTimestamp(0)).toBe('0:00');
  });

  it('formats seconds correctly', () => {
    expect(formatTimestamp(5000)).toBe('0:05');
    expect(formatTimestamp(30000)).toBe('0:30');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimestamp(65000)).toBe('1:05');
    expect(formatTimestamp(600000)).toBe('10:00');
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

describe('getSpeakerLabel', () => {
  it('returns You for mic', () => {
    expect(getSpeakerLabel('mic')).toBe('You');
  });

  it('returns Other for system', () => {
    expect(getSpeakerLabel('system')).toBe('Other');
  });
});

describe('getAvatarColor', () => {
  it('returns a consistent color for the same email', () => {
    const color1 = getAvatarColor('test@example.com');
    const color2 = getAvatarColor('test@example.com');
    expect(color1).toBe(color2);
  });

  it('returns a valid tailwind class', () => {
    const color = getAvatarColor('user@test.com');
    expect(color).toMatch(/^bg-/);
  });
});

describe('getInitials', () => {
  it('returns first letter of identifier when no name given', () => {
    expect(getInitials('john@example.com')).toBe('J');
  });

  it('returns initials from a full name', () => {
    expect(getInitials('john@example.com', 'John Doe')).toBe('JD');
  });

  it('limits to 2 characters', () => {
    expect(getInitials('x', 'John Michael Doe')).toBe('JM');
  });
});

describe('formatRelativeTime', () => {
  it('formats zero', () => {
    expect(formatRelativeTime(0)).toBe('00:00');
  });

  it('formats under a minute', () => {
    expect(formatRelativeTime(45000)).toBe('00:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatRelativeTime(125000)).toBe('02:05');
  });

  it('handles negative values as zero', () => {
    expect(formatRelativeTime(-1000)).toBe('00:00');
  });
});
