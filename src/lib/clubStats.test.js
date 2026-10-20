import { describe, expect, it } from 'vitest';
import { summarizeClubParticipation } from './clubStats';

describe('summarizeClubParticipation', () => {
  it('sums participants across every club and computes the share of the whole student body', () => {
    const records = [
      { name: '桌球社', participants: 18 },
      { name: '直笛隊', participants: 24 },
      { name: '科學實驗社', participants: 15 },
    ];
    expect(summarizeClubParticipation(records, 262)).toEqual({
      totalParticipants: 57, totalStudents: 262, pct: expect.closeTo(21.8, 1),
    });
  });

  it('coerces a missing or non-numeric participants value to zero instead of producing NaN', () => {
    const records = [{ name: '桌球社', participants: 18 }, { name: '直笛隊' }];
    expect(summarizeClubParticipation(records, 100)).toEqual({ totalParticipants: 18, totalStudents: 100, pct: 18 });
  });

  it('returns a null pct (not a divide-by-zero NaN) when the total student count is unavailable', () => {
    expect(summarizeClubParticipation([{ participants: 10 }], 0)).toEqual({
      totalParticipants: 10, totalStudents: 0, pct: null,
    });
  });

  it('returns zero participants for no records', () => {
    expect(summarizeClubParticipation([], 262)).toEqual({ totalParticipants: 0, totalStudents: 262, pct: 0 });
  });
});
