import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizationSource } from '../lib/accessPolicy';

const hookMocks = vi.hoisted(() => ({
  recordStates: new Map(),
  moduleStates: new Map(),
  meta: {},
  yearDecision: { allowed: true, code: 'year-writable', reason: null },
  useYearRecords: vi.fn((year, moduleKey, options = {}) => {
    const key = `${year}/${moduleKey}/${options.includeDeleted ? 1 : 0}`;
    return hookMocks.recordStates.get(key) || hookMocks.readyRecords([]);
  }),
  useYearModule: vi.fn((year, moduleKey) => hookMocks.moduleStates.get(`${year}/${moduleKey}`)),
  useYearMeta: vi.fn(() => ({
    ...hookMocks.meta,
    authorizeWrite: () => ({ ...hookMocks.yearDecision, meta: hookMocks.meta.meta }),
  })),
  readyRecords: null,
}));

const authMocks = vi.hoisted(() => ({
  decision: { allowed: true, code: 'access-granted', reason: null, role: 'admin', modules: [] },
  actor: { uid: 'admin-records', name: '即時管理員' },
  authorization: null,
  value: null,
}));

vi.mock('../hooks/useYearData', () => ({
  useYearRecords: hookMocks.useYearRecords,
  useYearModule: hookMocks.useYearModule,
  useYearMeta: hookMocks.useYearMeta,
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authMocks.value,
}));

const [{ default: Budget }, { default: Language }, { default: Generic }] = await Promise.all([
  import('./Budget.jsx'),
  import('./Language.jsx'),
  import('./Generic.jsx'),
]);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textOf).join('');
}

function pageText(renderer) {
  return textOf(renderer.root);
}

function control(renderer, text) {
  return renderer.root.findAll(
    (node) => typeof node.props.onClick === 'function' && textOf(node).trim() === text,
  )[0];
}

function field(renderer, ariaLabel) {
  return renderer.root.findAll(
    (node) => ['input', 'select', 'textarea'].includes(node.type)
      && node.props['aria-label'] === ariaLabel,
  )[0];
}

function change(renderer, ariaLabel, value) {
  act(() => field(renderer, ariaLabel).props.onChange({ target: { value } }));
}

function mount(Page, props = {}) {
  let renderer;
  let currentProps = props;
  const render = () => (
    <Page
      year="115"
      years={['113', '114', '115']}
      latestYear="115"
      hasCurrentYear={() => true}
      {...currentProps}
    />
  );
  act(() => { renderer = TestRenderer.create(render()); });
  return {
    renderer,
    rerender(nextProps = currentProps) {
      currentProps = nextProps;
      act(() => renderer.update(render()));
    },
    unmount() { act(() => renderer.unmount()); },
  };
}

function readyRecords(data, overrides = {}) {
  const state = {
    data,
    loading: false,
    error: null,
    decision: { allowed: true, code: 'records-writable', reason: null },
    create: vi.fn().mockResolvedValue({ id: 'created-record' }),
    update: vi.fn().mockResolvedValue({ id: 'updated-record' }),
    delete: vi.fn().mockResolvedValue({ id: 'deleted-record' }),
    restore: vi.fn().mockResolvedValue({ id: 'restored-record' }),
    ...overrides,
  };
  state.authorizeWrite = vi.fn(() => state.decision);
  return state;
}

function installRecords(moduleKey, active, recovery = active) {
  hookMocks.recordStates.set(`115/${moduleKey}/0`, active);
  hookMocks.recordStates.set(`115/${moduleKey}/1`, recovery);
}

beforeEach(() => {
  vi.clearAllMocks();
  hookMocks.readyRecords = readyRecords;
  hookMocks.recordStates = new Map();
  hookMocks.moduleStates = new Map();
  hookMocks.meta = {
    meta: { locked: false, deadlines: {} },
    loading: false,
    exists: true,
    error: null,
  };
  hookMocks.yearDecision = { allowed: true, code: 'year-writable', reason: null };
  for (const year of ['113', '114', '115']) {
    for (const moduleKey of ['budget', 'language', 'awards', 'club', 'land', 'inquiry']) {
      hookMocks.recordStates.set(`${year}/${moduleKey}/0`, readyRecords([]));
      hookMocks.moduleStates.set(`${year}/${moduleKey}`, {
        data: null,
        loading: false,
        error: null,
        save: vi.fn(),
        copyFrom: vi.fn(),
      });
    }
  }
  authMocks.decision = {
    allowed: true, code: 'access-granted', reason: null, role: 'admin', modules: [],
  };
  authMocks.actor = { uid: 'admin-records', name: '即時管理員' };
  authMocks.authorization = createAuthorizationSource(authMocks.decision, authMocks.actor);
  authMocks.value = {
    canEditModule: () => authMocks.decision.allowed,
    authorizeModule: () => authMocks.decision,
    authorizeModuleActor: (moduleKey) => {
      authMocks.authorization.replace(authMocks.decision, authMocks.actor);
      return authMocks.authorization.authorizeModuleActor(moduleKey);
    },
  };
});

describe('Budget records CRUD page', () => {
  it('renders Chinese loading, error, and empty states from the selected records listener', () => {
    installRecords('budget', readyRecords([], { loading: true }));
    const mounted = mount(Budget);
    expect(pageText(mounted.renderer)).toContain('正在載入歲入歲出資料…');

    installRecords('budget', readyRecords([], { error: new Error('permission denied') }));
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain('無法載入歲入歲出資料');

    installRecords('budget', readyRecords([]));
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain('尚無歲出資料');
    mounted.unmount();
  });

  it('validates and creates a typed expense record with the invocation-current audit actor', async () => {
    const records = readyRecords([]);
    installRecords('budget', records);
    const mounted = mount(Budget);

    await act(async () => control(mounted.renderer, '＋ 新增歲出').props.onClick());
    change(mounted.renderer, '項目名稱', '  國民教育計畫  ');
    change(mounted.renderer, '內容說明', '  辦理教學活動  ');
    change(mounted.renderer, '金額（千元）', '-1');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).not.toHaveBeenCalled();
    expect(pageText(mounted.renderer)).toContain('金額必須是非負有限數值');

    change(mounted.renderer, '金額（千元）', '1200.5');
    authMocks.actor = { uid: 'current-budget', name: '現在承辦人' };
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenCalledWith({
      recordType: 'expense',
      label: '國民教育計畫',
      formula: '辦理教學活動',
      amount: 1200.5,
    }, { uid: 'current-budget', name: '現在承辦人' });
    expect(pageText(mounted.renderer)).toContain('新增成功。');
    mounted.unmount();
  });

  it('creates a revenue row with its distinct stable recordType', async () => {
    const records = readyRecords([]);
    installRecords('budget', records);
    const mounted = mount(Budget);

    await act(async () => control(mounted.renderer, '歲入（收入）').props.onClick());
    await act(async () => control(mounted.renderer, '＋ 新增歲入').props.onClick());
    change(mounted.renderer, '來源項目', ' 利息收入 ');
    change(mounted.renderer, '金額（千元）', '2');
    await act(async () => control(mounted.renderer, '新增').props.onClick());

    expect(records.create).toHaveBeenCalledWith({
      recordType: 'revenue', label: '利息收入', amount: 2,
    }, authMocks.actor);
    mounted.unmount();
  });

  it('updates once while pending, soft-deletes, enters recovery scope, and restores with exact actors', async () => {
    const write = deferred();
    const active = readyRecords([
      { id: 'expense-1', recordType: 'expense', label: '教育計畫', formula: '說明', amount: 100, deletedAt: null },
    ], { update: vi.fn(() => write.promise) });
    const recovery = readyRecords([
      { id: 'expense-1', recordType: 'expense', label: '教育計畫', formula: '說明', amount: 100, deletedAt: null },
      { id: 'revenue-old', recordType: 'revenue', label: '舊收入', amount: 9, deletedAt: { seconds: 3 } },
    ]);
    installRecords('budget', active, recovery);
    const mounted = mount(Budget);

    await act(async () => control(mounted.renderer, '編輯').props.onClick());
    change(mounted.renderer, '金額（千元）', '250');
    const save = control(mounted.renderer, '儲存');
    let first;
    let duplicate;
    act(() => {
      first = save.props.onClick();
      duplicate = save.props.onClick();
    });
    await act(async () => Promise.resolve());
    expect(active.update).toHaveBeenCalledOnce();
    expect(active.update).toHaveBeenCalledWith('expense-1', {
      recordType: 'expense', label: '教育計畫', formula: '說明', amount: 250,
    }, authMocks.actor);
    expect(field(mounted.renderer, '金額（千元）').props.disabled).toBe(true);
    write.resolve();
    await act(async () => { await first; await duplicate; });

    await act(async () => control(mounted.renderer, '停用').props.onClick());
    expect(active.delete).toHaveBeenCalledWith('expense-1', authMocks.actor);

    await act(async () => control(mounted.renderer, '顯示已停用資料').props.onClick());
    expect(pageText(mounted.renderer)).toContain('舊收入');
    authMocks.actor = { uid: 'restore-budget', name: '復原承辦人' };
    await act(async () => control(mounted.renderer, '復原').props.onClick());
    expect(recovery.restore).toHaveBeenCalledWith(
      'revenue-old',
      { uid: 'restore-budget', name: '復原承辦人' },
    );
    expect(recovery.delete).not.toHaveBeenCalled();
    mounted.unmount();
  });
});

describe('Language variant records CRUD page', () => {
  it('derives existing class and certification statistics from typed records', () => {
    const records = readyRecords([
      { id: 'class-1', recordType: 'class', lang: '閩南語', classes: 13, students: 264, deletedAt: null },
      { id: 'class-2', recordType: 'class', lang: '客語', classes: 1, students: 4, deletedAt: null },
      { id: 'cert-1', recordType: 'certification', lang: '閩南語', certifiedTeachers: 2, totalTeachers: 2, tested: 10, passed: 7, deletedAt: null },
      { id: 'roster-1', recordType: 'roster', lang: '閩南語', level: 'A級（初級）', name: '陳○安', deletedAt: null },
    ]);
    installRecords('language', records);
    const mounted = mount(Language);
    const text = pageText(mounted.renderer);
    expect(text).toContain('開班語系及班級數總和 14');
    expect(text).toContain('2 / 2 人（100%）');
    expect(text).toContain('70.0%');
    expect(text).toContain('陳○安');
    mounted.unmount();
  });

  it('creates class, certification, and roster schemas and rejects semantically invalid counts', async () => {
    const records = readyRecords([]);
    installRecords('language', records);
    const mounted = mount(Language);

    await act(async () => control(mounted.renderer, '＋ 新增開班資料').props.onClick());
    change(mounted.renderer, '語系', ' 客語 ');
    change(mounted.renderer, '班級數', '2');
    change(mounted.renderer, '學生人數', '7');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenLastCalledWith({
      recordType: 'class', lang: '客語', classes: 2, students: 7,
    }, authMocks.actor);

    await act(async () => control(mounted.renderer, '＋ 新增認證統計').props.onClick());
    change(mounted.renderer, '語系', '閩南語');
    change(mounted.renderer, '已認證教師', '3');
    change(mounted.renderer, '授課教師總數', '2');
    change(mounted.renderer, '應考人數', '4');
    change(mounted.renderer, '通過人數', '5');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenCalledOnce();
    expect(pageText(mounted.renderer)).toContain('已認證教師不可超過授課教師總數');

    change(mounted.renderer, '已認證教師', '2');
    change(mounted.renderer, '通過人數', '4');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenLastCalledWith({
      recordType: 'certification', lang: '閩南語', certifiedTeachers: 2,
      totalTeachers: 2, tested: 4, passed: 4,
    }, authMocks.actor);

    await act(async () => control(mounted.renderer, '＋ 新增名冊').props.onClick());
    change(mounted.renderer, '語系', '賽考利克泰雅語');
    change(mounted.renderer, '通過級別', 'B級（中級）');
    change(mounted.renderer, '學生姓名', ' 林○恩 ');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenLastCalledWith({
      recordType: 'roster', lang: '賽考利克泰雅語', level: 'B級（中級）', name: '林○恩',
    }, authMocks.actor);
    mounted.unmount();
  });

  it('edits, soft-deletes, and restores variant rows without changing recordType', async () => {
    const active = readyRecords([
      { id: 'cert-1', recordType: 'certification', lang: '客語', certifiedTeachers: 1, totalTeachers: 1, tested: 4, passed: 2, deletedAt: null },
      { id: 'roster-1', recordType: 'roster', lang: '客語', level: 'A級（初級）', name: '王○明', deletedAt: null },
    ]);
    const recovery = readyRecords([
      { id: 'class-old', recordType: 'class', lang: '太魯閣語', classes: 1, students: 2, deletedAt: { seconds: 1 } },
    ]);
    installRecords('language', active, recovery);
    const mounted = mount(Language);

    await act(async () => control(mounted.renderer, '編輯認證統計').props.onClick());
    change(mounted.renderer, '通過人數', '3');
    await act(async () => control(mounted.renderer, '儲存').props.onClick());
    expect(active.update).toHaveBeenCalledWith('cert-1', {
      recordType: 'certification', lang: '客語', certifiedTeachers: 1,
      totalTeachers: 1, tested: 4, passed: 3,
    }, authMocks.actor);

    await act(async () => control(mounted.renderer, '停用名冊').props.onClick());
    expect(active.delete).toHaveBeenCalledWith('roster-1', authMocks.actor);
    await act(async () => control(mounted.renderer, '顯示已停用資料').props.onClick());
    await act(async () => control(mounted.renderer, '復原').props.onClick());
    expect(recovery.restore).toHaveBeenCalledWith('class-old', authMocks.actor);
    mounted.unmount();
  });
});

describe('schema-driven Generic records CRUD page', () => {
  it.each([
    ['awards', ['獲獎項目', '等級', '日期']],
    ['club', ['社團名稱', '指導老師', '人數', '上課時間']],
    ['land', ['地號', '面積(㎡)', '公告現值(元/㎡)']],
    ['inquiry', ['日期', '議員/題目', '答詢狀態']],
  ])('preserves %s column semantics from its record schema', (moduleKey, labels) => {
    installRecords(moduleKey, readyRecords([]));
    const mounted = mount(Generic, { moduleKey });
    for (const column of labels) expect(pageText(mounted.renderer)).toContain(column);
    mounted.unmount();
  });

  it('validates dates and creates a typed awards record with trimmed fields', async () => {
    const records = readyRecords([]);
    installRecords('awards', records);
    const mounted = mount(Generic, { moduleKey: 'awards' });
    await act(async () => control(mounted.renderer, '＋ 新增一筆').props.onClick());
    change(mounted.renderer, '獲獎項目', ' 全國語文競賽 ');
    change(mounted.renderer, '等級', ' 特優 ');
    change(mounted.renderer, '日期', '2025-02-30');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).not.toHaveBeenCalled();
    expect(pageText(mounted.renderer)).toContain('日期必須是有效的 YYYY-MM-DD');

    change(mounted.renderer, '日期', '2025-02-28');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenCalledWith({
      recordType: 'award', item: '全國語文競賽', level: '特優', date: '2025-02-28',
    }, authMocks.actor);
    mounted.unmount();
  });

  it.each([
    ['club', { '社團名稱': '桌球社', '指導老師': '陳老師', '人數': '18', '上課時間': '週二 16:00' }, { recordType: 'club', name: '桌球社', instructor: '陳老師', participants: 18, schedule: '週二 16:00' }],
    ['land', { '地號': '五結段123地號', '面積(㎡)': '8450.5', '公告現值(元/㎡)': '12800' }, { recordType: 'land', parcel: '五結段123地號', area: 8450.5, announcedValue: 12800 }],
    ['inquiry', { '日期': '2026-05-20', '議員/題目': '陳議員：課後社團經費', '答詢狀態': '待答詢' }, { recordType: 'inquiry', date: '2026-05-20', subject: '陳議員：課後社團經費', status: '待答詢' }],
  ])('creates stable %s record fields instead of cells arrays', async (moduleKey, values, expected) => {
    const records = readyRecords([]);
    installRecords(moduleKey, records);
    const mounted = mount(Generic, { moduleKey });
    await act(async () => control(mounted.renderer, '＋ 新增一筆').props.onClick());
    for (const [label, value] of Object.entries(values)) change(mounted.renderer, label, value);
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenCalledWith(expected, authMocks.actor);
    mounted.unmount();
  });

  it('edits, soft-deletes, and restores by record id through the active query scope', async () => {
    const active = readyRecords([
      { id: 'award-1', recordType: 'award', item: '縣科展', level: '優等', date: '2025-09-20', deletedAt: null },
    ]);
    const recovery = readyRecords([
      { id: 'award-old', recordType: 'award', item: '舊獎項', level: '佳作', date: '2024-01-10', deletedAt: { seconds: 2 } },
    ]);
    installRecords('awards', active, recovery);
    const mounted = mount(Generic, { moduleKey: 'awards' });

    await act(async () => control(mounted.renderer, '編輯').props.onClick());
    change(mounted.renderer, '等級', '特優');
    await act(async () => control(mounted.renderer, '儲存').props.onClick());
    expect(active.update).toHaveBeenCalledWith('award-1', {
      recordType: 'award', item: '縣科展', level: '特優', date: '2025-09-20',
    }, authMocks.actor);
    await act(async () => control(mounted.renderer, '停用').props.onClick());
    expect(active.delete).toHaveBeenCalledWith('award-1', authMocks.actor);
    await act(async () => control(mounted.renderer, '顯示已停用資料').props.onClick());
    await act(async () => control(mounted.renderer, '復原').props.onClick());
    expect(recovery.restore).toHaveBeenCalledWith('award-old', authMocks.actor);
    expect(recovery.delete).not.toHaveBeenCalled();
    mounted.unmount();
  });
});

describe('record page invocation guards', () => {
  it.each([
    ['Language', Language, 'language', {}, '正在載入族語開班資料…', '無法載入族語開班資料', '尚無開班資料'],
    ['Generic', Generic, 'awards', { moduleKey: 'awards' }, '正在載入獲獎紀錄資料…', '無法載入獲獎紀錄資料', '尚無資料'],
  ])('%s exposes distinct Chinese loading, error, and empty states', (_name, Page, moduleKey, props, loadingText, errorText, emptyText) => {
    installRecords(moduleKey, readyRecords([], { loading: true }));
    const mounted = mount(Page, props);
    expect(pageText(mounted.renderer)).toContain(loadingText);

    installRecords(moduleKey, readyRecords([], { error: new Error('permission denied') }));
    mounted.rerender(props);
    expect(pageText(mounted.renderer)).toContain(errorText);

    installRecords(moduleKey, readyRecords([]));
    mounted.rerender(props);
    expect(pageText(mounted.renderer)).toContain(emptyText);
    mounted.unmount();
  });

  it.each([
    ['Budget', Budget, {}],
    ['Language', Language, {}],
    ['Generic', Generic, { moduleKey: 'awards' }],
  ])('%s rechecks live authorization, Shell year, year meta, and records readiness for retained controls', async (_name, Page, extraProps) => {
    const moduleKey = extraProps.moduleKey || (_name === 'Budget' ? 'budget' : 'language');
    const records = readyRecords([]);
    installRecords(moduleKey, records);
    let shellCurrent = true;
    const mounted = mount(Page, { ...extraProps, hasCurrentYear: () => shellCurrent });
    const addLabel = _name === 'Budget' ? '＋ 新增歲出' : (_name === 'Language' ? '＋ 新增開班資料' : '＋ 新增一筆');
    const retainedAdd = control(mounted.renderer, addLabel).props.onClick;

    authMocks.decision = { allowed: false, code: 'profile-disabled', reason: '此帳號已停用。' };
    await act(async () => retainedAdd());
    expect(pageText(mounted.renderer)).toContain('此帳號已停用');
    expect(mounted.renderer.root.findAllByType('input')).toHaveLength(0);

    authMocks.decision = {
      allowed: true, code: 'access-granted', reason: null, role: 'admin', modules: [],
    };
    shellCurrent = false;
    await act(async () => retainedAdd());
    expect(pageText(mounted.renderer)).toContain('目前選擇的年度已變更');

    shellCurrent = true;
    hookMocks.yearDecision = { allowed: false, code: 'year-locked', reason: '此年度已鎖定，無法編輯或儲存。' };
    await act(async () => retainedAdd());
    expect(pageText(mounted.renderer)).toContain('此年度已鎖定');

    hookMocks.yearDecision = { allowed: true, code: 'year-writable', reason: null };
    records.decision = { allowed: false, code: 'records-error', reason: '無法確認資料列狀態，請稍後再試。' };
    await act(async () => retainedAdd());
    expect(pageText(mounted.renderer)).toContain('無法確認資料列狀態');
    expect(records.create).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it('retained edit, cancel, create, delete, and restore callbacks write nothing after scope/revocation errors', async () => {
    const active = readyRecords([
      { id: 'award-1', recordType: 'award', item: '縣科展', level: '優等', date: '2025-09-20', deletedAt: null },
    ]);
    const recovery = readyRecords([
      { id: 'award-old', recordType: 'award', item: '舊獎項', level: '佳作', date: '2024-01-10', deletedAt: { seconds: 2 } },
    ]);
    installRecords('awards', active, recovery);
    const mounted = mount(Generic, { moduleKey: 'awards' });

    const retainedEdit = control(mounted.renderer, '編輯').props.onClick;
    active.decision = { allowed: false, code: 'records-error', reason: '資料列監聽失敗。' };
    await act(async () => retainedEdit());
    expect(mounted.renderer.root.findAllByType('input')).toHaveLength(0);

    active.decision = { allowed: true, code: 'records-writable', reason: null };
    await act(async () => retainedEdit());
    const retainedCancel = control(mounted.renderer, '取消').props.onClick;
    const retainedSave = control(mounted.renderer, '儲存').props.onClick;
    const retainedDelete = control(mounted.renderer, '停用').props.onClick;
    active.decision = { allowed: false, code: 'records-stale', reason: '目前資料列範圍已變更。' };
    await act(async () => retainedCancel());
    await act(async () => retainedSave());
    await act(async () => retainedDelete());
    expect(mounted.renderer.root.findAllByType('input').length).toBeGreaterThan(0);
    expect(active.update).not.toHaveBeenCalled();
    expect(active.delete).not.toHaveBeenCalled();

    active.decision = { allowed: true, code: 'records-writable', reason: null };
    await act(async () => control(mounted.renderer, '顯示已停用資料').props.onClick());
    const retainedRestore = control(mounted.renderer, '復原').props.onClick;
    recovery.decision = { allowed: false, code: 'records-error', reason: '復原範圍監聽失敗。' };
    await act(async () => retainedRestore());
    expect(recovery.restore).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it('rejects a retained actual add handler across A to B to A generations', async () => {
    const oldA = readyRecords([]);
    installRecords('awards', oldA);
    const mounted = mount(Generic, { moduleKey: 'awards', year: '115' });
    const retainedOldAAdd = control(mounted.renderer, '＋ 新增一筆').props.onClick;

    oldA.decision = { allowed: false, code: 'records-stale', reason: '目前資料列範圍已變更。' };
    mounted.rerender({ moduleKey: 'awards', year: '114' });
    const newA = readyRecords([]);
    installRecords('awards', newA);
    mounted.rerender({ moduleKey: 'awards', year: '115' });
    await act(async () => retainedOldAAdd());

    expect(mounted.renderer.root.findAllByType('input')).toHaveLength(0);
    expect(oldA.create).not.toHaveBeenCalled();
    expect(newA.create).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it('requires an invocation-current actor and deduplicates a pending row operation synchronously', async () => {
    const remove = deferred();
    const records = readyRecords([
      { id: 'award-1', recordType: 'award', item: '縣科展', level: '優等', date: '2025-09-20', deletedAt: null },
    ], { delete: vi.fn(() => remove.promise) });
    installRecords('awards', records);
    const mounted = mount(Generic, { moduleKey: 'awards' });

    await act(async () => control(mounted.renderer, '編輯').props.onClick());
    const retainedSave = control(mounted.renderer, '儲存').props.onClick;
    authMocks.actor = null;
    await act(async () => retainedSave());
    expect(records.update).not.toHaveBeenCalled();
    expect(pageText(mounted.renderer)).toContain('無法確認操作者身分');

    authMocks.actor = { uid: 'row-current', name: '列操作人員' };
    await act(async () => control(mounted.renderer, '取消').props.onClick());
    const stop = control(mounted.renderer, '停用');
    let first;
    let duplicate;
    act(() => {
      first = stop.props.onClick();
      duplicate = stop.props.onClick();
    });
    await act(async () => Promise.resolve());
    expect(records.delete).toHaveBeenCalledOnce();
    expect(records.delete).toHaveBeenCalledWith(
      'award-1',
      { uid: 'row-current', name: '列操作人員' },
    );
    expect(control(mounted.renderer, '停用').props.disabled).toBe(true);
    remove.resolve();
    await act(async () => { await first; await duplicate; });
    mounted.unmount();
  });

  it('keeps historical years read-only and hides recovery from users who cannot edit', () => {
    const records = readyRecords([
      { id: 'award-1', recordType: 'award', item: '歷史獎項', level: '優等', date: '2024-01-01', deletedAt: null },
    ]);
    hookMocks.recordStates.set('114/awards/0', records);
    const historical = mount(Generic, { moduleKey: 'awards', year: '114' });
    expect(control(historical.renderer, '＋ 新增一筆')).toBeUndefined();
    expect(control(historical.renderer, '顯示已停用資料')).toBeUndefined();
    historical.unmount();

    installRecords('awards', records);
    authMocks.decision = { allowed: false, code: 'module-denied', reason: '沒有權限。' };
    const readOnly = mount(Generic, { moduleKey: 'awards' });
    expect(pageText(readOnly.renderer)).toContain('歷史獎項');
    expect(control(readOnly.renderer, '顯示已停用資料')).toBeUndefined();
    readOnly.unmount();
  });

  it.each([
    ['Budget', Budget, {}],
    ['Language', Language, {}],
    ['Generic', Generic, { moduleKey: 'awards' }],
  ])('%s hides every write/recovery entry unless locked is exactly false', (_name, Page, props) => {
    const moduleKey = props.moduleKey || (_name === 'Budget' ? 'budget' : 'language');
    installRecords(moduleKey, readyRecords([]));
    const mounted = mount(Page, props);
    const addLabel = _name === 'Budget' ? '＋ 新增歲出' : (_name === 'Language' ? '＋ 新增開班資料' : '＋ 新增一筆');

    for (const locked of [undefined, null, 0, 'false', true]) {
      hookMocks.meta = {
        meta: locked === undefined ? {} : { locked },
        loading: false,
        exists: true,
        error: null,
      };
      mounted.rerender(props);
      expect(control(mounted.renderer, addLabel)).toBeUndefined();
      expect(control(mounted.renderer, '顯示已停用資料')).toBeUndefined();
      expect(pageText(mounted.renderer)).toContain('無法編輯或儲存');
    }
    mounted.unmount();
  });
});
