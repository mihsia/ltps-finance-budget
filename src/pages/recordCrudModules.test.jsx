import TestRenderer, { act } from 'react-test-renderer';
import * as XLSX from 'xlsx';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizationSource } from '../lib/accessPolicy';
import { AWARD_IMPORT_HEADERS } from '../lib/awardImport';

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

const [{ default: Budget }, { default: Language }, { default: LanguageCert }, { default: Generic }] = await Promise.all([
  import('./Budget.jsx'),
  import('./Language.jsx'),
  import('./LanguageCert.jsx'),
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

// Excludes the awards module's always-mounted hidden xlsx file-picker input,
// which isn't a record form field and shouldn't count toward "no form is open".
function formInputs(renderer) {
  return renderer.root.findAllByType('input').filter((node) => node.props.type !== 'file');
}

function fileInput(renderer) {
  return renderer.root.findAll((node) => node.type === 'input' && node.props.type === 'file')[0];
}

/** A File-like object (arrayBuffer() only, matching what Generic.jsx reads) built from plain rows. */
function fakeXlsxFile(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return { name: 'import.xlsx', arrayBuffer: async () => buffer };
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
    for (const moduleKey of ['budget', 'language', 'languageCert', 'awards', 'club', 'land', 'inquiry']) {
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
    change(mounted.renderer, '預算金額（千元）', '-1');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).not.toHaveBeenCalled();
    expect(pageText(mounted.renderer)).toContain('金額必須是非負有限數值');

    change(mounted.renderer, '預算金額（千元）', '1200.5');
    authMocks.actor = { uid: 'current-budget', name: '現在承辦人' };
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenCalledWith({
      recordType: 'expense',
      label: '國民教育計畫',
      formula: '辦理教學活動',
      amount: 1200.5,
      actualAmount: null,
      varianceNote: null,
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
    change(mounted.renderer, '預算金額（千元）', '2');
    await act(async () => control(mounted.renderer, '新增').props.onClick());

    expect(records.create).toHaveBeenCalledWith({
      recordType: 'revenue', label: '利息收入', amount: 2, actualAmount: null, varianceNote: null,
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
    change(mounted.renderer, '預算金額（千元）', '250');
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
      label: '教育計畫', formula: '說明', amount: 250, actualAmount: null, varianceNote: null,
    }, authMocks.actor);
    expect(field(mounted.renderer, '預算金額（千元）').props.disabled).toBe(true);
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

describe('Language class records CRUD page', () => {
  it('derives existing class statistics from typed records', () => {
    const records = readyRecords([
      { id: 'class-1', recordType: 'class', lang: '閩南語', classes: 13, students: 264, deletedAt: null },
      { id: 'class-2', recordType: 'class', lang: '客語', classes: 1, students: 4, deletedAt: null },
    ]);
    installRecords('language', records);
    const mounted = mount(Language);
    const text = pageText(mounted.renderer);
    expect(text).toContain('開班語系及班級數總和 14');
    mounted.unmount();
  });

  it('creates a class schema record with trimmed fields', async () => {
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
    mounted.unmount();
  });

  it('edits, soft-deletes, and restores class rows without changing recordType', async () => {
    const active = readyRecords([
      { id: 'class-1', recordType: 'class', lang: '客語', classes: 1, students: 4, deletedAt: null },
    ]);
    const recovery = readyRecords([
      { id: 'class-old', recordType: 'class', lang: '太魯閣語', classes: 1, students: 2, deletedAt: { seconds: 1 } },
    ]);
    installRecords('language', active, recovery);
    const mounted = mount(Language);

    await act(async () => control(mounted.renderer, '編輯開班資料').props.onClick());
    change(mounted.renderer, '學生人數', '5');
    await act(async () => control(mounted.renderer, '儲存').props.onClick());
    expect(active.update).toHaveBeenCalledWith('class-1', {
      lang: '客語', classes: 1, students: 5,
    }, authMocks.actor);

    await act(async () => control(mounted.renderer, '停用開班資料').props.onClick());
    expect(active.delete).toHaveBeenCalledWith('class-1', authMocks.actor);
    await act(async () => control(mounted.renderer, '顯示已停用資料').props.onClick());
    await act(async () => control(mounted.renderer, '復原').props.onClick());
    expect(recovery.restore).toHaveBeenCalledWith('class-old', authMocks.actor);
    mounted.unmount();
  });
});

describe('LanguageCert variant records CRUD page', () => {
  it('derives teacher-certification ratio and passed-student count from typed records', () => {
    const records = readyRecords([
      { id: 'teacher-1', recordType: 'teacher', lang: '閩南語', name: '陳老師', certified: '是', deletedAt: null },
      { id: 'teacher-2', recordType: 'teacher', lang: '閩南語', name: '林老師', certified: '否', deletedAt: null },
      { id: 'roster-1', recordType: 'roster', lang: '閩南語', level: '初級', name: '陳○安', deletedAt: null },
    ]);
    installRecords('languageCert', records);
    const mounted = mount(LanguageCert);
    const text = pageText(mounted.renderer);
    expect(text).toContain('1 / 2 人（50%）');
    expect(text).toContain('1 人');
    expect(text).toContain('陳老師');
    expect(text).toContain('陳○安');
    mounted.unmount();
  });

  it('creates teacher and roster schemas with the lang/certified/level dropdowns', async () => {
    const records = readyRecords([]);
    installRecords('languageCert', records);
    const mounted = mount(LanguageCert);

    await act(async () => control(mounted.renderer, '＋ 新增師資名冊').props.onClick());
    change(mounted.renderer, '語系', '閩南語');
    change(mounted.renderer, '教師姓名', ' 陳老師 ');
    change(mounted.renderer, '是否已通過認證', '是');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenLastCalledWith({
      recordType: 'teacher', lang: '閩南語', name: '陳老師', certified: '是',
    }, authMocks.actor);

    await act(async () => control(mounted.renderer, '＋ 新增學生通過名冊').props.onClick());
    change(mounted.renderer, '語系', '泰雅語');
    change(mounted.renderer, '通過級別', '中級');
    change(mounted.renderer, '學生姓名', ' 林○恩 ');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenLastCalledWith({
      recordType: 'roster', lang: '泰雅語', level: '中級', name: '林○恩',
    }, authMocks.actor);
    mounted.unmount();
  });

  it('edits, soft-deletes, and restores variant rows without changing recordType', async () => {
    const active = readyRecords([
      { id: 'teacher-1', recordType: 'teacher', lang: '客語', name: '黃老師', certified: '否', deletedAt: null },
      { id: 'roster-1', recordType: 'roster', lang: '客語', level: '初級', name: '王○明', deletedAt: null },
    ]);
    const recovery = readyRecords([
      { id: 'teacher-old', recordType: 'teacher', lang: '太魯閣語', name: '王老師', certified: '否', deletedAt: { seconds: 1 } },
    ]);
    installRecords('languageCert', active, recovery);
    const mounted = mount(LanguageCert);

    await act(async () => control(mounted.renderer, '編輯師資名冊').props.onClick());
    change(mounted.renderer, '是否已通過認證', '是');
    await act(async () => control(mounted.renderer, '儲存').props.onClick());
    expect(active.update).toHaveBeenCalledWith('teacher-1', {
      lang: '客語', name: '黃老師', certified: '是',
    }, authMocks.actor);

    await act(async () => control(mounted.renderer, '停用名冊').props.onClick());
    expect(active.delete).toHaveBeenCalledWith('roster-1', authMocks.actor);
    await act(async () => control(mounted.renderer, '顯示已停用資料').props.onClick());
    await act(async () => control(mounted.renderer, '復原').props.onClick());
    expect(recovery.restore).toHaveBeenCalledWith('teacher-old', authMocks.actor);
    mounted.unmount();
  });
});

describe('schema-driven Generic records CRUD page', () => {
  it.each([
    ['awards', ['類別', '獲獎項目', '賽事類型', '學生姓名', '等級', '日期']],
    ['club', ['社團名稱', '指導老師', '人數', '上課星期', '開始時間', '結束時間', '上課場地', '每生費用（元）']],
    ['land', ['地號', '面積(㎡)', '公告現值(元/㎡)']],
    ['inquiry', ['日期', '議員/題目', '答詢狀態']],
  ])('preserves %s column semantics from its record schema', (moduleKey, labels) => {
    installRecords(moduleKey, readyRecords([]));
    const mounted = mount(Generic, { moduleKey });
    for (const column of labels) expect(pageText(mounted.renderer)).toContain(column);
    mounted.unmount();
  });

  it('validates dates and creates a typed awards record with trimmed fields, requiring 學生姓名 for an 個人賽', async () => {
    const records = readyRecords([]);
    installRecords('awards', records);
    const mounted = mount(Generic, { moduleKey: 'awards' });
    await act(async () => control(mounted.renderer, '＋ 新增一筆').props.onClick());
    change(mounted.renderer, '類別', '語文類');
    change(mounted.renderer, '獲獎項目', ' 宜蘭縣語文競賽 ');
    change(mounted.renderer, '賽事類型', '個人賽');
    change(mounted.renderer, '等級', ' 特優 ');
    change(mounted.renderer, '日期', '2025-02-30');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).not.toHaveBeenCalled();
    expect(pageText(mounted.renderer)).toContain('日期必須是有效的 YYYY-MM-DD');

    change(mounted.renderer, '日期', '2025-02-28');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).not.toHaveBeenCalled();
    expect(pageText(mounted.renderer)).toContain('個人賽請填寫得獎學生姓名');

    change(mounted.renderer, '學生姓名', ' 陳○安 ');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenCalledWith({
      recordType: 'award', category: '語文類', item: '宜蘭縣語文競賽', competitionType: '個人賽', studentName: '陳○安', level: '特優', date: '2025-02-28',
    }, authMocks.actor);
    mounted.unmount();
  });

  it('lets a 團體賽 award be created with no 學生姓名', async () => {
    const records = readyRecords([]);
    installRecords('awards', records);
    const mounted = mount(Generic, { moduleKey: 'awards' });
    await act(async () => control(mounted.renderer, '＋ 新增一筆').props.onClick());
    change(mounted.renderer, '類別', '體育類');
    change(mounted.renderer, '獲獎項目', '宜蘭縣運動會');
    change(mounted.renderer, '賽事類型', '團體賽');
    change(mounted.renderer, '等級', '第二名');
    change(mounted.renderer, '日期', '2025-05-15');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenCalledWith({
      recordType: 'award', category: '體育類', item: '宜蘭縣運動會', competitionType: '團體賽', studentName: null, level: '第二名', date: '2025-05-15',
    }, authMocks.actor);
    mounted.unmount();
  });

  it('lets a 特生統計 category be picked from the dropdown or typed as a custom value', async () => {
    const records = readyRecords([]);
    installRecords('specialNeeds', records);
    const mounted = mount(Generic, { moduleKey: 'specialNeeds' });
    await act(async () => control(mounted.renderer, '＋ 新增一筆').props.onClick());
    change(mounted.renderer, '類別', '原住民');
    change(mounted.renderer, '人數', '17');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenCalledWith({
      recordType: 'specialNeeds', category: '原住民', count: 17, note: null,
    }, authMocks.actor);
    mounted.unmount();

    const customRecords = readyRecords([]);
    installRecords('specialNeeds', customRecords);
    const customMounted = mount(Generic, { moduleKey: 'specialNeeds' });
    await act(async () => control(customMounted.renderer, '＋ 新增一筆').props.onClick());
    change(customMounted.renderer, '類別', '__custom__');
    change(customMounted.renderer, '類別（自訂）', '外籍配偶子女');
    change(customMounted.renderer, '人數', '3');
    await act(async () => control(customMounted.renderer, '新增').props.onClick());
    expect(customRecords.create).toHaveBeenCalledWith({
      recordType: 'specialNeeds', category: '外籍配偶子女', count: 3, note: null,
    }, authMocks.actor);
    customMounted.unmount();
  });

  it.each([
    ['club', {
      '社團名稱': '桌球社', '指導老師': '陳老師', '人數': '18', '上課星期': '週二', '開始時間': '16:00', '結束時間': '17:00', '上課場地': '活動中心', '每生費用（元）': '200',
    }, {
      recordType: 'club', name: '桌球社', instructor: '陳老師', participants: 18, weekday: '週二', startTime: '16:00', endTime: '17:00', venue: '活動中心', feePerStudent: 200,
    }],
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

  it('requires the 課後社團 結束時間 to be after 開始時間', async () => {
    const records = readyRecords([]);
    installRecords('club', records);
    const mounted = mount(Generic, { moduleKey: 'club' });
    await act(async () => control(mounted.renderer, '＋ 新增一筆').props.onClick());
    change(mounted.renderer, '社團名稱', '桌球社');
    change(mounted.renderer, '指導老師', '陳老師');
    change(mounted.renderer, '人數', '18');
    change(mounted.renderer, '上課星期', '週五');
    change(mounted.renderer, '開始時間', '17:00');
    change(mounted.renderer, '結束時間', '16:00');
    change(mounted.renderer, '上課場地', '活動中心');
    change(mounted.renderer, '每生費用（元）', '200');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).not.toHaveBeenCalled();
    expect(pageText(mounted.renderer)).toContain('結束時間必須晚於開始時間');

    change(mounted.renderer, '結束時間', '18:00');
    await act(async () => control(mounted.renderer, '新增').props.onClick());
    expect(records.create).toHaveBeenCalledWith({
      recordType: 'club', name: '桌球社', instructor: '陳老師', participants: 18, weekday: '週五', startTime: '17:00', endTime: '18:00', venue: '活動中心', feePerStudent: 200,
    }, authMocks.actor);
    mounted.unmount();
  });

  it('edits, soft-deletes, and restores by record id through the active query scope', async () => {
    const active = readyRecords([
      {
        id: 'award-1', recordType: 'award', category: '科學類', item: '縣科展', competitionType: '團體賽', studentName: '', level: '優等', date: '2025-09-20', deletedAt: null,
      },
    ]);
    const recovery = readyRecords([
      {
        id: 'award-old', recordType: 'award', category: '體育類', item: '舊獎項', competitionType: '團體賽', studentName: '', level: '佳作', date: '2024-01-10', deletedAt: { seconds: 2 },
      },
    ]);
    installRecords('awards', active, recovery);
    const mounted = mount(Generic, { moduleKey: 'awards' });

    await act(async () => control(mounted.renderer, '編輯').props.onClick());
    change(mounted.renderer, '等級', '特優');
    await act(async () => control(mounted.renderer, '儲存').props.onClick());
    expect(active.update).toHaveBeenCalledWith('award-1', {
      category: '科學類', item: '縣科展', competitionType: '團體賽', studentName: null, level: '特優', date: '2025-09-20',
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
    ['LanguageCert', LanguageCert, 'languageCert', {}, '正在載入族語認證資料…', '無法載入族語認證資料', '尚無師資名冊資料'],
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

  const DEFAULT_MODULE_KEY = { Budget: 'budget', Language: 'language', LanguageCert: 'languageCert', Generic: 'awards' };
  const DEFAULT_ADD_LABEL = {
    Budget: '＋ 新增歲出', Language: '＋ 新增開班資料', LanguageCert: '＋ 新增師資名冊', Generic: '＋ 新增一筆',
  };

  it.each([
    ['Budget', Budget, {}],
    ['Language', Language, {}],
    ['LanguageCert', LanguageCert, {}],
    ['Generic', Generic, { moduleKey: 'awards' }],
  ])('%s rechecks live authorization, Shell year, year meta, and records readiness for retained controls', async (_name, Page, extraProps) => {
    const moduleKey = extraProps.moduleKey || DEFAULT_MODULE_KEY[_name];
    const records = readyRecords([]);
    installRecords(moduleKey, records);
    let shellCurrent = true;
    const mounted = mount(Page, { ...extraProps, hasCurrentYear: () => shellCurrent });
    const addLabel = DEFAULT_ADD_LABEL[_name];
    const retainedAdd = control(mounted.renderer, addLabel).props.onClick;

    // A denied/disabled account now also fails canEditModule's own check, so
    // the whole page swaps to the no-access view rather than showing the
    // retained callback's rejection message inline — still "no form, no
    // write", just via a different (friendlier) screen.
    authMocks.decision = { allowed: false, code: 'profile-disabled', reason: '此帳號已停用。' };
    await act(async () => retainedAdd());
    expect(pageText(mounted.renderer)).toContain('無權限');
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
    expect(formInputs(mounted.renderer)).toHaveLength(0);

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

    expect(formInputs(mounted.renderer)).toHaveLength(0);
    expect(oldA.create).not.toHaveBeenCalled();
    expect(newA.create).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it('writes nothing through a retained save after latestYear advances past the still-unlocked selected year', async () => {
    const records = readyRecords([
      { id: 'award-1', recordType: 'award', item: '縣科展', level: '優等', date: '2025-09-20', deletedAt: null },
    ]);
    installRecords('awards', records);
    const mounted = mount(Generic, { moduleKey: 'awards' });

    await act(async () => control(mounted.renderer, '編輯').props.onClick());
    const retainedSave = control(mounted.renderer, '儲存').props.onClick;
    mounted.rerender({ moduleKey: 'awards', latestYear: '116' });
    await act(async () => retainedSave());

    expect(records.update).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it('requires the invocation-current actor for edit, cancel, and recovery scope toggles', async () => {
    const active = readyRecords([
      { id: 'award-1', recordType: 'award', item: '縣科展', level: '優等', date: '2025-09-20', deletedAt: null },
    ]);
    const recovery = readyRecords([
      { id: 'award-old', recordType: 'award', item: '舊獎項', level: '佳作', date: '2024-01-10', deletedAt: { seconds: 2 } },
    ]);
    installRecords('awards', active, recovery);
    const mounted = mount(Generic, { moduleKey: 'awards' });

    authMocks.actor = null;
    await act(async () => control(mounted.renderer, '編輯').props.onClick());
    expect(formInputs(mounted.renderer)).toHaveLength(0);

    authMocks.actor = { uid: 'actor-now', name: '即時操作者' };
    await act(async () => control(mounted.renderer, '編輯').props.onClick());
    expect(mounted.renderer.root.findAllByType('input').length).toBeGreaterThan(0);

    authMocks.actor = null;
    await act(async () => control(mounted.renderer, '取消').props.onClick());
    expect(mounted.renderer.root.findAllByType('input').length).toBeGreaterThan(0);

    authMocks.actor = { uid: 'actor-now', name: '即時操作者' };
    await act(async () => control(mounted.renderer, '取消').props.onClick());
    authMocks.actor = null;
    await act(async () => control(mounted.renderer, '顯示已停用資料').props.onClick());
    expect(pageText(mounted.renderer)).not.toContain('舊獎項');
    expect(pageText(mounted.renderer)).toContain('無法確認操作者身分');
    mounted.unmount();
  });

  it('fully freezes conflicting row, recovery, and form controls while either operation kind is pending', async () => {
    const formWrite = deferred();
    const rowWrite = deferred();
    const records = readyRecords([
      {
        id: 'award-1', recordType: 'award', category: '科學類', item: '縣科展', competitionType: '團體賽', studentName: '', level: '優等', date: '2025-09-20', deletedAt: null,
      },
      {
        id: 'award-2', recordType: 'award', category: '語文類', item: '縣語文競賽', competitionType: '團體賽', studentName: '', level: '特優', date: '2025-10-20', deletedAt: null,
      },
    ], {
      update: vi.fn(() => formWrite.promise),
      delete: vi.fn((recordId) => (recordId === 'award-2' ? rowWrite.promise : Promise.resolve())),
    });
    installRecords('awards', records);
    const mounted = mount(Generic, { moduleKey: 'awards' });

    await act(async () => control(mounted.renderer, '編輯').props.onClick());
    let pendingForm;
    act(() => { pendingForm = control(mounted.renderer, '儲存').props.onClick(); });
    await act(async () => Promise.resolve());

    expect(control(mounted.renderer, '顯示已停用資料').props.disabled).toBe(true);
    expect(mounted.renderer.root.findAll(
      (node) => typeof node.props.onClick === 'function' && textOf(node).trim() === '停用',
    ).every((node) => node.props.disabled)).toBe(true);

    formWrite.resolve();
    await act(async () => pendingForm);

    await act(async () => control(mounted.renderer, '編輯').props.onClick());
    const stopButtons = mounted.renderer.root.findAll(
      (node) => typeof node.props.onClick === 'function' && textOf(node).trim() === '停用',
    );
    let pendingRow;
    act(() => { pendingRow = stopButtons[1].props.onClick(); });
    await act(async () => Promise.resolve());

    expect(field(mounted.renderer, '等級').props.disabled).toBe(true);
    expect(control(mounted.renderer, '儲存').props.disabled).toBe(true);
    expect(control(mounted.renderer, '取消').props.disabled).toBe(true);
    expect(pageText(mounted.renderer)).toContain('停用中…');
    expect(mounted.renderer.root.findAll(
      (node) => typeof node.props.onClick === 'function' && ['停用', '停用中…'].includes(textOf(node).trim()),
    ).every((node) => node.props.disabled)).toBe(true);

    rowWrite.resolve();
    await act(async () => pendingRow);
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
    expect(control(mounted.renderer, '停用中…').props.disabled).toBe(true);
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
    expect(pageText(readOnly.renderer)).not.toContain('歷史獎項');
    expect(pageText(readOnly.renderer)).toContain('無權限');
    expect(control(readOnly.renderer, '顯示已停用資料')).toBeUndefined();
    readOnly.unmount();
  });

  it.each([
    ['Budget', Budget, {}],
    ['Language', Language, {}],
    ['LanguageCert', LanguageCert, {}],
    ['Generic', Generic, { moduleKey: 'awards' }],
  ])('%s hides every write/recovery entry unless locked is exactly false', (_name, Page, props) => {
    const moduleKey = props.moduleKey || DEFAULT_MODULE_KEY[_name];
    installRecords(moduleKey, readyRecords([]));
    const mounted = mount(Page, props);
    const addLabel = DEFAULT_ADD_LABEL[_name];

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

describe('Generic awards xlsx export/import', () => {
  it('offers export, template, and import controls once the module is editable', () => {
    installRecords('awards', readyRecords([]));
    const mounted = mount(Generic, { moduleKey: 'awards' });
    expect(control(mounted.renderer, '⬇ 匯出 Excel')).toBeTruthy();
    expect(control(mounted.renderer, '⬇ 下載範本')).toBeTruthy();
    expect(control(mounted.renderer, '⬆ 匯入 Excel')).toBeTruthy();
    expect(fileInput(mounted.renderer)).toBeTruthy();
    mounted.unmount();
  });

  it('does not offer export/import controls for other generic modules', () => {
    installRecords('club', readyRecords([]));
    const mounted = mount(Generic, { moduleKey: 'club' });
    expect(control(mounted.renderer, '⬇ 匯出 Excel')).toBeUndefined();
    expect(control(mounted.renderer, '⬆ 匯入 Excel')).toBeUndefined();
    expect(fileInput(mounted.renderer)).toBeUndefined();
    mounted.unmount();
  });

  it('hides the import control but keeps export once the year is locked', () => {
    installRecords('awards', readyRecords([]));
    hookMocks.yearDecision = { allowed: false, code: 'year-locked', reason: '此年度已鎖定，無法編輯或儲存。' };
    hookMocks.meta = {
      meta: { locked: true, deadlines: {} }, loading: false, exists: true, error: null,
    };
    const mounted = mount(Generic, { moduleKey: 'awards' });
    expect(control(mounted.renderer, '⬇ 匯出 Excel')).toBeTruthy();
    expect(control(mounted.renderer, '⬆ 匯入 Excel')).toBeUndefined();
    mounted.unmount();
  });

  it('imports every valid row, skips an invalid one, and shows a per-row result summary', async () => {
    const records = readyRecords([]);
    installRecords('awards', records);
    const mounted = mount(Generic, { moduleKey: 'awards' });

    const file = fakeXlsxFile([
      AWARD_IMPORT_HEADERS,
      ['語文類', '宜蘭縣語文競賽－朗讀', '個人賽', '陳○安', '特優', '2025-10-12'],
      ['科學類', '縣科展', '團體賽', '', '優等', 'not-a-date'],
    ]);
    await act(async () => { await fileInput(mounted.renderer).props.onChange({ target: { files: [file], value: '' } }); });

    expect(records.create).toHaveBeenCalledOnce();
    expect(records.create).toHaveBeenCalledWith({
      recordType: 'award', category: '語文類', item: '宜蘭縣語文競賽－朗讀', competitionType: '個人賽', studentName: '陳○安', level: '特優', date: '2025-10-12',
    }, authMocks.actor);

    const text = pageText(mounted.renderer);
    expect(text).toContain('成功 1 筆／失敗 1 筆');
    expect(text).toContain('日期必須是有效的 YYYY-MM-DD');
    mounted.unmount();
  });

  it('rejects an obviously malformed file without creating any records', async () => {
    const records = readyRecords([]);
    installRecords('awards', records);
    const mounted = mount(Generic, { moduleKey: 'awards' });

    const file = fakeXlsxFile([
      ['Name', 'Date'],
      ['宜蘭縣語文競賽', '2025-10-12'],
    ]);
    await act(async () => { await fileInput(mounted.renderer).props.onChange({ target: { files: [file], value: '' } }); });

    expect(records.create).not.toHaveBeenCalled();
    expect(pageText(mounted.renderer)).toContain('範本格式');
    mounted.unmount();
  });

  it('only offers 獲獎項目 options that belong to the currently selected 類別', async () => {
    installRecords('awards', readyRecords([]));
    const mounted = mount(Generic, { moduleKey: 'awards' });
    await act(async () => control(mounted.renderer, '＋ 新增一筆').props.onClick());

    change(mounted.renderer, '類別', '科學類');
    let options = field(mounted.renderer, '獲獎項目').findAllByType('option').map((o) => o.props.value);
    expect(options).toContain('宜蘭縣科學展覽會');
    expect(options).not.toContain('宜蘭縣運動會');

    change(mounted.renderer, '類別', '體育類');
    options = field(mounted.renderer, '獲獎項目').findAllByType('option').map((o) => o.props.value);
    expect(options).toContain('宜蘭縣運動會');
    expect(options).not.toContain('宜蘭縣科學展覽會');
    mounted.unmount();
  });
});

describe('Module deadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['Budget', Budget, {}, 'budget', '＋ 新增歲出'],
    ['Language', Language, {}, 'language', '＋ 新增開班資料'],
    ['LanguageCert', LanguageCert, {}, 'languageCert', '＋ 新增師資名冊'],
    ['Generic', Generic, { moduleKey: 'awards' }, 'awards', '＋ 新增一筆'],
  ])('%s shows a deadline banner, hides write controls, and blocks a retained save once past 填報截止日', async (_name, Page, extraProps, moduleKey, addLabel) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 9, 12));
    hookMocks.meta.meta = { locked: false, deadlines: { [moduleKey]: '2026-08-10' } };
    installRecords(moduleKey, readyRecords([]));
    const mounted = mount(Page, extraProps);

    expect(pageText(mounted.renderer)).toContain('填報截止日：2026-08-10');
    expect(pageText(mounted.renderer)).toContain('截止當日 23:59 前可儲存');
    expect(control(mounted.renderer, addLabel)).toBeTruthy();
    const retainedAdd = control(mounted.renderer, addLabel).props.onClick;

    hookMocks.meta.meta = { locked: false, deadlines: { [moduleKey]: '2026-08-08' } };
    await act(async () => retainedAdd());

    expect(pageText(mounted.renderer)).toContain('已超過填報期限');
    expect(control(mounted.renderer, addLabel)).toBeUndefined();
    mounted.unmount();
  });
});
