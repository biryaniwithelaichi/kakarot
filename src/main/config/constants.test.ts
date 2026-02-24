import { describe, it, expect } from 'vitest';
import { matchesQuestionPattern } from './constants';

describe('matchesQuestionPattern', () => {
  it('detects trailing question mark', () => {
    expect(matchesQuestionPattern('Is this working?')).toBe(true);
  });

  it('detects question words at start', () => {
    expect(matchesQuestionPattern('What is the timeline')).toBe(true);
    expect(matchesQuestionPattern('How do we proceed')).toBe(true);
    expect(matchesQuestionPattern('Who is responsible')).toBe(true);
    expect(matchesQuestionPattern('Can you share the docs')).toBe(true);
  });

  it('detects imperative question phrases', () => {
    expect(matchesQuestionPattern('Tell me about the project')).toBe(true);
    expect(matchesQuestionPattern('Explain the architecture')).toBe(true);
  });

  it('detects complex question openers', () => {
    expect(matchesQuestionPattern('Do you know when it ships')).toBe(true);
    expect(matchesQuestionPattern('Can you tell me more')).toBe(true);
  });

  it('rejects plain statements', () => {
    expect(matchesQuestionPattern('The meeting is at 3pm')).toBe(false);
    expect(matchesQuestionPattern('I will send the report')).toBe(false);
  });

  it('handles whitespace', () => {
    expect(matchesQuestionPattern('  What time is it  ')).toBe(true);
  });
});
