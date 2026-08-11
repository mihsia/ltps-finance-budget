import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hookMocks = vi.hoisted(() => ({
  records: new Map(),
  modules: new Map(),
  useYearRecords: vi.fn((year, moduleKey) => hookMocks.records.get(`${year}/${moduleKey}`) || {
    data: [], loading: false, error: null,
  }),
  useYearModule: vi.fn((year, moduleKey) => hookMocks.modules.get(`${year}/${moduleKey}`) || {
    data: null, loading: false, exists: false, error: null,
  }),
  useYearMeta: vi.fn(() => ({
    meta: { locked: false }, loading: false, exists: true, error: null,
    authorizeWrite: () => ({ allowed: true }),
  })),
}));

vi.mock('../hooks/useYearData', () => ({
  useYearRecords: hookMocks.useYearRecords,
  useYearModule: hookMocks.useYearModule,
  useYearMeta: hookMocks.useYearMeta,
}));
vi.mock('../firebase', () => ({
  db: { name: 'test-db' },
  isFirebaseConfigured: false,
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { name: '管理員' },
    user: { uid: 'admin-1', email: 'admin@example.test' },
    canEditModule: () => true,
    authorizeModule: () => ({ allowed: true }),
    authorizeModuleActor: () => ({
      allowed: true,
      actor: { uid: 'admin-1', name: '管理員' },
    }),
  }),
}));

const [{ default: Dashboard }, { default: BudgetBook }, { default: Report }] = await Promise.all([
  import('./Dashboard.jsx'),
  import('./BudgetBook.jsx'),
  import('./Report.jsx'),
]);

function readyModule(data) {
  return {
    data,
    loading: false,
    exists: data !== null,
    error: null,
    save: vi.fn().mockResolvedValue(undefined),
    authorizeWrite: () => ({ allowed: true }),
  };
}

function readyRecords(data, overrides = {}) {
  return { data, loading: false, error: null, ...overrides };
}

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textOf).join('');
}

function pageText(renderer) {
  return textOf(renderer.root);
}

function mount(Page, props = {}) {
  let renderer;
  const render = () => (
    <Page
      year="115"
      years={['113', '114', '115']}
      latestYear="115"
      hasCurrentYear={() => true}
      {...props}
    />
  );
  act(() => { renderer = TestRenderer.create(render()); });
  return {
    renderer,
    rerender() { act(() => renderer.update(render())); },
    unmount() { act(() => renderer.unmount()); },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hookMocks.records = new Map();
  hookMocks.modules = new Map();

  for (const year of ['113', '114', '115']) {
    hookMocks.records.set(`${year}/budget`, readyRecords([
      { id: `${year}-expense`, recordType: 'expense', label: '教育計畫', formula: '說明', amount: Number(year) - 100, deletedAt: null },
    ]));
    hookMocks.modules.set(`${year}/budget`, readyModule({
      expense: { breakdown: [{ label: '舊模組數值', amount: 999 }] },
      revenue: { rows: [{ label: '舊模組收入', amount: 999 }] },
    }));
  }

  hookMocks.records.set('115/language', readyRecords([
    { id: 'class-1', recordType: 'class', lang: '客語', classes: 2, students: 7, deletedAt: null },
    { id: 'class-deleted', recordType: 'class', lang: '舊語系', classes: 10, students: 99, deletedAt: { seconds: 1 } },
  ]));
  hookMocks.modules.set('115/language', readyModule({
    classes: [{ lang: '舊模組語系', classes: 999, students: 999 }],
  }));
  hookMocks.modules.set('115/basic', readyModule({
    classes: 13,
    students: 262,
    staff: 28,
    regularTeachers: 19,
    substituteVacancy: 6,
    substituteAdditional: 3,
    partTimeTeachers: 2,
    status: 'submitted',
  }));
  hookMocks.modules.set('115/library', readyModule({ generalBooks: 100, indigenousBooks: 20 }));
  hookMocks.modules.set('115/budgetbook', readyModule({
    fundName: '利澤國小校務基金',
    reviewAuthority: '宜蘭縣議會',
  }));
  for (const moduleKey of ['awards', 'club', 'land', 'inquiry']) {
    hookMocks.records.set(`115/${moduleKey}`, readyRecords([]));
    hookMocks.modules.set(`115/${moduleKey}`, readyModule({ rows: [{ legacy: true }] }));
  }
});

describe('Task 5 downstream record authority', () => {
  it('updates Dashboard totals through record create, update, soft-delete, and restore while ignoring legacy arrays', () => {
    const latest = readyRecords([
      { id: 'expense-1', recordType: 'expense', label: '教育計畫', formula: '說明', amount: 100, deletedAt: null },
      { id: 'expense-deleted', recordType: 'expense', label: '停用項目', formula: '說明', amount: 900, deletedAt: { seconds: 1 } },
    ]);
    hookMocks.records.set('115/budget', latest);
    const mounted = mount(Dashboard);

    expect(pageText(mounted.renderer)).toContain('100 千元');
    expect(pageText(mounted.renderer)).not.toContain('999 千元');

    latest.data = [
      ...latest.data,
      { id: 'expense-2', recordType: 'expense', label: '新增項目', formula: '說明', amount: 50, deletedAt: null },
    ];
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain('150 千元');

    latest.data = latest.data.map((record) => (
      record.id === 'expense-1' ? { ...record, amount: 75 } : record
    ));
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain('125 千元');

    latest.data = latest.data.map((record) => (
      record.id === 'expense-1' ? { ...record, deletedAt: { seconds: 2 } } : record
    ));
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain('50 千元');

    latest.data = latest.data.map((record) => (
      record.id === 'expense-1' ? { ...record, deletedAt: null } : record
    ));
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain('125 千元');
    mounted.unmount();
  });

  it('derives BudgetBook expense, revenue, and balance from active budget records and keeps its fixed module doc', () => {
    hookMocks.records.set('115/budget', readyRecords([
      { id: 'expense-1', recordType: 'expense', label: '教育計畫', formula: '說明', amount: 100, deletedAt: null },
      { id: 'revenue-1', recordType: 'revenue', label: '公庫撥款', amount: 120, deletedAt: null },
      { id: 'revenue-deleted', recordType: 'revenue', label: '停用收入', amount: 999, deletedAt: { seconds: 1 } },
    ]));
    const mounted = mount(BudgetBook);
    const text = pageText(mounted.renderer);

    expect(text).toContain('利澤國小校務基金');
    expect(text).toContain('基金來源合計（歲入） 120 千元');
    expect(text).toContain('基金用途合計（歲出） 100 千元');
    expect(text).toContain('本期賸餘 20');
    expect(text).not.toContain('舊模組數值');
    mounted.unmount();
  });

  it('derives Report preview budget and language values from active records and fails closed while records load or error', () => {
    hookMocks.records.set('115/budget', readyRecords([
      { id: 'expense-1', recordType: 'expense', label: '教育計畫', formula: '說明', amount: 321, deletedAt: null },
      { id: 'expense-deleted', recordType: 'expense', label: '停用項目', formula: '說明', amount: 999, deletedAt: { seconds: 1 } },
    ]));
    const mounted = mount(Report);
    expect(pageText(mounted.renderer)).toContain('115年度歲出預算321 千元');
    expect(pageText(mounted.renderer)).toContain('族語開班2 班');
    expect(pageText(mounted.renderer)).not.toContain('999');

    hookMocks.records.set('115/budget', readyRecords([], { loading: true }));
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain('正在載入議會報表資料…');
    expect(pageText(mounted.renderer)).not.toContain('115年度預算數（千元）0');

    hookMocks.records.set('115/budget', readyRecords([], { error: new Error('denied') }));
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain('無法載入議會報表資料');
    mounted.unmount();
  });
});
