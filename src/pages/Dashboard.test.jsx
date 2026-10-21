import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hookMocks = vi.hoisted(() => ({
  yearMeta: { meta: { deadlines: {} }, loading: false, exists: true, error: null },
  useYearRecords: vi.fn(() => ({ data: [], loading: false, error: null })),
  useYearModule: vi.fn(() => ({ data: null, loading: false, exists: false, error: null })),
  useYearMeta: vi.fn(() => hookMocks.yearMeta),
  canEditModule: vi.fn(() => true),
}));

vi.mock('../hooks/useYearData', () => ({
  useYearRecords: hookMocks.useYearRecords,
  useYearModule: hookMocks.useYearModule,
  useYearMeta: hookMocks.useYearMeta,
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ canEditModule: hookMocks.canEditModule }),
}));

const { default: Dashboard, upcomingDeadlines } = await import('./Dashboard.jsx');

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textOf).join('');
}

function render(element) {
  let renderer;
  act(() => { renderer = TestRenderer.create(element); });
  return renderer;
}

beforeEach(() => {
  hookMocks.yearMeta = { meta: { deadlines: {} }, loading: false, exists: true, error: null };
  hookMocks.canEditModule.mockReturnValue(true);
});

describe('upcomingDeadlines', () => {
  it('returns only configured, valid deadlines for modules the account can edit, soonest first', () => {
    const now = new Date(2026, 9, 21);
    const deadlines = { basic: '2026-10-28', budget: '2026-10-24', library: 'not-a-date' };
    const canEditModule = (key) => key !== 'budget';

    const rows = upcomingDeadlines(deadlines, canEditModule, now);

    expect(rows.map((r) => r.key)).toEqual(['basic']);
    expect(rows[0]).toMatchObject({ label: '基本資料', dateText: '2026-10-28', days: 7 });
  });

  it('sorts overdue deadlines before upcoming ones, soonest/most-overdue first', () => {
    const now = new Date(2026, 9, 21);
    const deadlines = { basic: '2026-11-01', budget: '2026-10-15', library: '2026-10-20' };

    const rows = upcomingDeadlines(deadlines, () => true, now);

    expect(rows.map((r) => r.key)).toEqual(['budget', 'library', 'basic']);
    expect(rows[0].days).toBeLessThan(0);
  });

  it('returns an empty list when no deadlines are configured', () => {
    expect(upcomingDeadlines({}, () => true)).toEqual([]);
    expect(upcomingDeadlines(null, () => true)).toEqual([]);
  });
});

describe('Dashboard 填報截止日提醒 card', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not shown at all when there are no configured deadlines', () => {
    const renderer = render(<Dashboard years={['115']} latestYear="115" />);
    expect(textOf(renderer.root)).not.toContain('填報截止日提醒');
    act(() => renderer.unmount());
  });

  it('shows one row per upcoming deadline with its date and a 剩 N 天 / 已截止 status', () => {
    hookMocks.yearMeta = {
      meta: { deadlines: { basic: '2026-10-24', budget: '2026-10-15' } },
      loading: false,
      exists: true,
      error: null,
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 21));

    const renderer = render(<Dashboard years={['115']} latestYear="115" />);

    const text = textOf(renderer.root);
    expect(text).toContain('填報截止日提醒（115年度）');
    expect(text).toContain('基本資料');
    expect(text).toContain('2026-10-24 截止');
    expect(text).toContain('歲入歲出');
    expect(text).toContain('已截止');
    act(() => renderer.unmount());
  });

  it('only reminds about modules the current account can edit', () => {
    hookMocks.yearMeta = {
      meta: { deadlines: { basic: '2026-10-24', budget: '2026-10-24' } },
      loading: false,
      exists: true,
      error: null,
    };
    hookMocks.canEditModule.mockImplementation((key) => key === 'basic');

    const renderer = render(<Dashboard years={['115']} latestYear="115" />);

    const text = textOf(renderer.root);
    expect(text).toContain('基本資料');
    expect(text).not.toContain('歲入歲出');
    act(() => renderer.unmount());
  });
});
