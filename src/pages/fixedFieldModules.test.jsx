import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizationSource } from '../lib/accessPolicy';

const hookMocks = vi.hoisted(() => ({
  modules: {},
  records: {},
  meta: {},
  audit: {},
  moduleDecision: { allowed: true, code: 'module-writable', reason: null },
  yearDecision: { allowed: true, code: 'year-writable', reason: null, meta: null },
  useYearModule: vi.fn((_, moduleKey) => hookMocks.modules[moduleKey]),
  useYearRecords: vi.fn((_, moduleKey) => hookMocks.records[moduleKey]),
  useYearMeta: vi.fn(() => ({
    ...hookMocks.meta,
    authorizeWrite: () => ({ ...hookMocks.yearDecision, meta: hookMocks.meta.meta }),
  })),
  useAuditLog: vi.fn(() => hookMocks.audit),
}));

const authMocks = vi.hoisted(() => ({
  decision: {
    allowed: true,
    code: 'access-granted',
    reason: null,
    role: 'admin',
    modules: [],
  },
  actor: { uid: 'admin-fixed', name: '校務管理員' },
  authorization: null,
  value: null,
}));

const callableMocks = vi.hoisted(() => ({
  calls: [],
  impl: vi.fn(async () => ({ data: {} })),
}));

vi.mock('../hooks/useYearData', () => ({
  useYearModule: hookMocks.useYearModule,
  useYearRecords: hookMocks.useYearRecords,
  useYearMeta: hookMocks.useYearMeta,
  useAuditLog: hookMocks.useAuditLog,
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authMocks.value,
}));
vi.mock('../firebase', () => ({
  functions: {},
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions, name) => async (payload) => {
    callableMocks.calls.push({ name, payload });
    return callableMocks.impl(name, payload);
  },
}));

const [{ default: Basic }, { default: Library }, { default: BudgetBook }] = await Promise.all([
  import('./Basic.jsx'),
  import('./Library.jsx'),
  import('./BudgetBook.jsx'),
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

function control(renderer, label) {
  return renderer.root.findAll(
    (node) => typeof node.props.onClick === 'function' && textOf(node).trim() === label,
  )[0];
}

function mount(Page, props = {}) {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(
      <Page
        year="115"
        latestYear="115"
        hasCurrentYear={() => true}
        {...props}
      />,
    );
  });
  return {
    renderer,
    rerender(nextProps = props) {
      act(() => {
        renderer.update(
          <Page
            year="115"
            latestYear="115"
            hasCurrentYear={() => true}
            {...nextProps}
          />,
        );
      });
    },
    unmount() { act(() => renderer.unmount()); },
  };
}

function fakeFile({ name = 'budget.pdf', type = 'application/pdf', content = '%PDF-1.4 fake' } = {}) {
  const bytes = new TextEncoder().encode(content);
  return {
    name, type, size: bytes.length, arrayBuffer: async () => bytes.buffer,
  };
}

function fileInput(renderer) {
  return renderer.root.findAll((node) => node.type === 'input' && node.props.type === 'file')[0];
}

function readyModule(data, save = vi.fn().mockResolvedValue(undefined), exists = true) {
  return {
    data,
    loading: false,
    exists,
    error: null,
    save,
    authorizeWrite: () => hookMocks.moduleDecision,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  callableMocks.calls = [];
  callableMocks.impl = vi.fn(async () => ({ data: {} }));
  hookMocks.moduleDecision = { allowed: true, code: 'module-writable', reason: null };
  hookMocks.meta = { meta: { locked: false, deadlines: {} }, loading: false, exists: true, error: null };
  hookMocks.yearDecision = { allowed: true, code: 'year-writable', reason: null };
  hookMocks.audit = { entries: [], loading: false, error: null };
  hookMocks.modules = {
    basic: readyModule({
      classes: '13',
      students: '262',
      staff: '28',
      regularTeachers: '19',
      substitute: '9',
      partTimeTeachers: '2',
      status: 'draft',
      unrelated: { keep: true },
    }),
    library: readyModule({ generalBooks: 1, indigenousBooks: 2, unrelated: { keep: true } }),
    budget: readyModule({ expense: { breakdown: [] }, revenue: { rows: [] } }),
    budgetbook: readyModule({
      fundName: '利澤國小校務基金',
      reviewAuthority: '宜蘭縣議會',
      pdfUrl: 'https://example.test/budget.pdf',
      unrelated: { keep: true },
    }),
  };
  hookMocks.records = {
    budget: {
      data: [],
      loading: false,
      error: null,
    },
  };
  authMocks.decision = {
    allowed: true,
    code: 'access-granted',
    reason: null,
    role: 'admin',
    modules: [],
  };
  authMocks.actor = { uid: 'admin-fixed', name: '校務管理員' };
  authMocks.authorization = createAuthorizationSource(authMocks.decision, authMocks.actor);
  authMocks.value = {
    profile: { name: '校務管理員' },
    user: { uid: 'admin-fixed', email: 'admin@example.test' },
    canEditModule: () => authMocks.decision.allowed,
    authorizeModule: () => authMocks.decision,
    authorizeModuleActor: (moduleKey) => {
      authMocks.authorization.replace(authMocks.decision, authMocks.actor);
      return authMocks.authorization.authorizeModuleActor(moduleKey);
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Basic fixed-field module', () => {
  it('surfaces module loading/error and audit loading/error/empty as distinct Chinese states', () => {
    hookMocks.modules.basic = {
      ...readyModule(null, vi.fn(), false),
      loading: true,
    };
    const mounted = mount(Basic);
    expect(pageText(mounted.renderer)).toContain('正在載入學校基本資料…');

    hookMocks.modules.basic = {
      ...hookMocks.modules.basic,
      loading: false,
      error: new Error('permission denied'),
    };
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain('無法載入學校基本資料');

    hookMocks.modules.basic = readyModule({
      classes: '1', students: '2', staff: '3', regularTeachers: '1', substitute: '1', partTimeTeachers: '1', status: 'draft',
    });
    hookMocks.audit = { entries: [], loading: true, error: null };
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain('正在載入稽核紀錄…');

    hookMocks.audit = { entries: [], loading: false, error: new Error('audit denied') };
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain('無法載入稽核紀錄');

    hookMocks.audit = { entries: [], loading: false, error: null };
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain('尚無稽核紀錄');
    mounted.unmount();
  });

  it('validates every count for draft and submitted saves, freezes pending controls, and writes one scoped audit', async () => {
    const write = deferred();
    const save = vi.fn(() => write.promise);
    hookMocks.modules.basic = readyModule({
      classes: '13', students: '262', staff: '28', regularTeachers: '19', substitute: '9', partTimeTeachers: '2', status: 'draft', unrelated: { keep: true },
    }, save);
    const mounted = mount(Basic);

    await act(async () => control(mounted.renderer, '編輯資料').props.onClick());
    let inputs = mounted.renderer.root.findAllByType('input');
    act(() => inputs[2].props.onChange({ target: { value: '-1' } }));
    await act(async () => control(mounted.renderer, '儲存草稿').props.onClick());
    await act(async () => control(mounted.renderer, '儲存並送出審核').props.onClick());
    expect(save).not.toHaveBeenCalled();
    expect(pageText(mounted.renderer)).toContain('所有人數與班級數都必須是非負整數');

    inputs = mounted.renderer.root.findAllByType('input');
    act(() => inputs[2].props.onChange({ target: { value: '29' } }));
    const submit = control(mounted.renderer, '儲存並送出審核');
    let first;
    let duplicate;
    act(() => {
      first = submit.props.onClick();
      duplicate = submit.props.onClick();
    });
    await act(async () => Promise.resolve());

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({
      classes: '13',
      students: '262',
      staff: '29',
      regularTeachers: '19',
      substitute: '9',
      partTimeTeachers: '2',
      status: 'submitted',
    }, {
      actor: { uid: 'admin-fixed', name: '校務管理員' },
      fields: ['classes', 'students', 'staff', 'regularTeachers', 'substitute', 'partTimeTeachers', 'status'],
    });
    expect(mounted.renderer.root.findAllByType('input').every((field) => field.props.disabled)).toBe(true);

    write.resolve();
    await act(async () => {
      await first;
      await duplicate;
    });
    expect(pageText(mounted.renderer)).toContain('儲存成功。');
    mounted.unmount();
  });

  it('accepts an exact submitted-status echo but rejects genuinely unrelated changes', async () => {
    const firstWrite = deferred();
    const save = vi.fn(() => firstWrite.promise);
    const source = {
      classes: '13', students: '262', staff: '28', regularTeachers: '19', substitute: '9', partTimeTeachers: '2',
      status: 'draft', unrelated: { keep: true }, updatedAt: { seconds: 1 },
    };
    hookMocks.modules.basic = readyModule(source, save);
    const mounted = mount(Basic);

    await act(async () => control(mounted.renderer, '編輯資料').props.onClick());
    let pending;
    act(() => { pending = control(mounted.renderer, '儲存並送出審核').props.onClick(); });
    await act(async () => Promise.resolve());
    hookMocks.modules.basic = readyModule({
      ...source,
      status: 'submitted',
      updatedAt: { seconds: 2 },
    }, save);
    mounted.rerender();
    firstWrite.resolve();
    await act(async () => pending);
    expect(pageText(mounted.renderer)).toContain('儲存成功。');

    const secondWrite = deferred();
    hookMocks.modules.basic = readyModule({
      ...source,
      status: 'submitted',
      updatedAt: { seconds: 2 },
    }, vi.fn(() => secondWrite.promise));
    mounted.rerender();
    await act(async () => control(mounted.renderer, '編輯資料').props.onClick());
    let secondPending;
    act(() => { secondPending = control(mounted.renderer, '儲存並送出審核').props.onClick(); });
    await act(async () => Promise.resolve());
    hookMocks.modules.basic = readyModule({
      ...source,
      status: 'submitted',
      unrelated: { keep: false },
      updatedAt: { seconds: 3 },
    }, save);
    mounted.rerender();
    secondWrite.resolve();
    await act(async () => secondPending);
    expect(pageText(mounted.renderer)).toContain('資料已在儲存期間變更');
    mounted.unmount();
  });

  it('fails closed for own-property falsy deadlines in the UI and retained callbacks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 9, 12));
    hookMocks.meta.meta = { locked: false, deadlines: { basic: '2026-08-10' } };
    const save = vi.fn();
    hookMocks.modules.basic = { ...hookMocks.modules.basic, save };
    const mounted = mount(Basic);
    await act(async () => control(mounted.renderer, '編輯資料').props.onClick());
    const retainedCancel = control(mounted.renderer, '取消').props.onClick;

    hookMocks.meta.meta = { locked: false, deadlines: { basic: false } };
    await act(async () => retainedCancel());

    expect(mounted.renderer.root.findAllByType('input')).toHaveLength(6);
    expect(pageText(mounted.renderer)).toContain('基本資料填報截止日格式錯誤');
    expect(control(mounted.renderer, '編輯資料')).toBeUndefined();

    hookMocks.meta.meta = { locked: false, deadlines: {} };
    mounted.rerender();
    const retainedSave = control(mounted.renderer, '儲存草稿').props.onClick;
    hookMocks.meta.meta = { locked: false, deadlines: { basic: undefined } };
    await act(async () => retainedSave());

    expect(save).not.toHaveBeenCalled();
    expect(mounted.renderer.root.findAllByType('input')).toHaveLength(6);
    expect(pageText(mounted.renderer)).toContain('基本資料填報截止日格式錯誤');
    mounted.unmount();
  });
});

describe('Library fixed-field module', () => {
  it('accepts one exact source echo, preserves audit types, and denies retained cancel after authorization revocation', async () => {
    const write = deferred();
    const save = vi.fn(() => write.promise);
    hookMocks.modules.library = readyModule({
      generalBooks: 1,
      indigenousBooks: 2,
      unrelated: { keep: true },
      updatedAt: { seconds: 1 },
    }, save);
    const mounted = mount(Library);

    await act(async () => control(mounted.renderer, '編輯數量').props.onClick());
    let inputs = mounted.renderer.root.findAllByType('input');
    act(() => inputs[0].props.onChange({ target: { value: '11' } }));
    let pending;
    act(() => { pending = control(mounted.renderer, '儲存').props.onClick(); });
    await act(async () => Promise.resolve());
    expect(save).toHaveBeenCalledWith({ generalBooks: '11', indigenousBooks: '2' }, {
      actor: { uid: 'admin-fixed', name: '校務管理員' },
      fields: ['generalBooks', 'indigenousBooks'],
    });

    hookMocks.modules.library = readyModule({
      generalBooks: '11',
      indigenousBooks: '2',
      unrelated: { keep: true },
      updatedAt: { seconds: 2 },
    }, save);
    mounted.rerender();
    write.resolve();
    await act(async () => pending);
    expect(pageText(mounted.renderer)).toContain('儲存成功。');

    await act(async () => control(mounted.renderer, '編輯數量').props.onClick());
    authMocks.decision = { allowed: false, code: 'profile-disabled', reason: '此帳號已停用。' };
    await act(async () => control(mounted.renderer, '取消').props.onClick());
    expect(mounted.renderer.root.findAllByType('input')).toHaveLength(2);
    expect(pageText(mounted.renderer)).toContain('此帳號已停用。');
    mounted.unmount();
  });

  it('fails closed for a stale Shell year, missing metadata, module errors, and invalid counts', async () => {
    const save = vi.fn();
    hookMocks.modules.library = readyModule({ generalBooks: 1, indigenousBooks: 2 }, save);
    const mounted = mount(Library, { hasCurrentYear: () => false });
    await act(async () => control(mounted.renderer, '編輯數量').props.onClick());
    expect(pageText(mounted.renderer)).toContain('目前選擇的年度已變更');

    hookMocks.meta = { meta: null, loading: false, exists: false, error: null };
    hookMocks.yearDecision = { allowed: false, code: 'year-missing', reason: '找不到此年度設定，無法儲存。' };
    mounted.rerender({ hasCurrentYear: () => true });
    expect(pageText(mounted.renderer)).toContain('找不到此年度設定');

    hookMocks.meta = { meta: { locked: false }, loading: false, exists: true, error: null };
    hookMocks.yearDecision = { allowed: true, code: 'year-writable', reason: null };
    hookMocks.modules.library = { ...readyModule(null), error: new Error('module denied') };
    mounted.rerender({ hasCurrentYear: () => true });
    expect(pageText(mounted.renderer)).toContain('無法載入圖書館藏書資料');
    mounted.unmount();
  });

  it('uses the invocation-current audit actor and writes nothing when that actor is unavailable', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    hookMocks.modules.library = readyModule({ generalBooks: 1, indigenousBooks: 2 }, save);
    const mounted = mount(Library);
    await act(async () => control(mounted.renderer, '編輯數量').props.onClick());
    const retainedSave = control(mounted.renderer, '儲存').props.onClick;

    authMocks.actor = { uid: 'current-user', name: '即時名稱' };
    await act(async () => retainedSave());
    expect(save).toHaveBeenCalledWith(
      { generalBooks: '1', indigenousBooks: '2' },
      {
        actor: { uid: 'current-user', name: '即時名稱' },
        fields: ['generalBooks', 'indigenousBooks'],
      },
    );

    await act(async () => control(mounted.renderer, '編輯數量').props.onClick());
    const retainedWithoutActor = control(mounted.renderer, '儲存').props.onClick;
    authMocks.actor = null;
    await act(async () => retainedWithoutActor());
    expect(save).toHaveBeenCalledOnce();
    expect(pageText(mounted.renderer)).toContain('無法確認操作者身分');
    mounted.unmount();
  });
});

describe('BudgetBook fixed-field module', () => {
  it('trims and validates both metadata fields, and saves an audited fixed-field payload', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    hookMocks.modules.budgetbook = readyModule({
      fundName: '利澤國小校務基金',
      reviewAuthority: '宜蘭縣議會',
      pdfUrl: 'https://example.test/budget.pdf',
      unrelated: { keep: true },
    }, save);
    const mounted = mount(BudgetBook);
    expect(mounted.renderer.root.findAllByType('a')[0].props.href).toBe('https://example.test/budget.pdf');

    await act(async () => control(mounted.renderer, '編輯基金資料').props.onClick());
    let inputs = mounted.renderer.root.findAllByType('input');
    act(() => inputs[0].props.onChange({ target: { value: '   ' } }));
    await act(async () => control(mounted.renderer, '儲存').props.onClick());
    expect(save).not.toHaveBeenCalled();
    expect(pageText(mounted.renderer)).toContain('基金別與審議機關不得留白');

    inputs = mounted.renderer.root.findAllByType('input');
    act(() => {
      inputs[0].props.onChange({ target: { value: ` ${'基'.repeat(101)} ` } });
      inputs[1].props.onChange({ target: { value: ' 新審議機關 ' } });
    });
    await act(async () => control(mounted.renderer, '儲存').props.onClick());
    expect(save).not.toHaveBeenCalled();
    expect(pageText(mounted.renderer)).toContain('不得超過 100 個字');

    inputs = mounted.renderer.root.findAllByType('input');
    act(() => inputs[0].props.onChange({ target: { value: ' 新校務基金 ' } }));
    await act(async () => control(mounted.renderer, '儲存').props.onClick());
    expect(save).toHaveBeenCalledWith({
      fundName: '新校務基金',
      reviewAuthority: '新審議機關',
    }, {
      actor: { uid: 'admin-fixed', name: '校務管理員' },
      fields: ['fundName', 'reviewAuthority'],
    });
    expect(pageText(mounted.renderer)).toContain('儲存成功。');
    mounted.unmount();
  });

  it('uploads a PDF, then offers to replace it once one exists', async () => {
    const moduleWithoutPdf = readyModule({ fundName: '基金', reviewAuthority: '機關' });
    hookMocks.modules.budgetbook = moduleWithoutPdf;
    const mounted = mount(BudgetBook);

    expect(pageText(mounted.renderer)).toContain('上傳 PDF 全文');
    expect(pageText(mounted.renderer)).not.toContain('更換 PDF 全文');

    const file = fakeFile({ name: '115budget.pdf', content: '%PDF-1.4 hello' });
    await act(async () => fileInput(mounted.renderer).props.onChange({ target: { files: [file], value: 'x' } }));

    const call = callableMocks.calls.find((c) => c.name === 'uploadBudgetBookPdf');
    expect(call).toBeTruthy();
    expect(call.payload).toMatchObject({ year: '115', fileName: '115budget.pdf', contentType: 'application/pdf' });
    expect(atob(call.payload.base64)).toBe('%PDF-1.4 hello');
    expect(pageText(mounted.renderer)).toContain('已上傳 PDF 全文。');

    hookMocks.modules.budgetbook = readyModule({ fundName: '基金', reviewAuthority: '機關', pdfUrl: 'https://example.test/new.pdf' });
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain('更換 PDF 全文');
    mounted.unmount();
  });

  it('rejects a non-PDF file on the client without calling the function', async () => {
    hookMocks.modules.budgetbook = readyModule({ fundName: '基金', reviewAuthority: '機關' });
    const mounted = mount(BudgetBook);

    const file = fakeFile({ name: 'photo.png', type: 'image/png' });
    await act(async () => fileInput(mounted.renderer).props.onChange({ target: { files: [file], value: 'x' } }));

    expect(callableMocks.calls).toHaveLength(0);
    expect(pageText(mounted.renderer)).toContain('僅接受 PDF 檔案');
    mounted.unmount();
  });

  it('surfaces a failed upload instead of appearing to succeed', async () => {
    callableMocks.impl = vi.fn(async () => { throw new Error('儲存空間已滿'); });
    hookMocks.modules.budgetbook = readyModule({ fundName: '基金', reviewAuthority: '機關' });
    const mounted = mount(BudgetBook);

    const file = fakeFile();
    await act(async () => fileInput(mounted.renderer).props.onChange({ target: { files: [file], value: 'x' } }));

    expect(pageText(mounted.renderer)).toContain('儲存空間已滿');
    mounted.unmount();
  });

  it('freezes the upload control while a request is in flight so it cannot fire twice', async () => {
    const pending = deferred();
    callableMocks.impl = vi.fn(() => pending.promise);
    hookMocks.modules.budgetbook = readyModule({ fundName: '基金', reviewAuthority: '機關' });
    const mounted = mount(BudgetBook);

    const file = fakeFile();
    act(() => { fileInput(mounted.renderer).props.onChange({ target: { files: [file], value: 'x' } }); });
    await act(async () => Promise.resolve());
    expect(callableMocks.calls).toHaveLength(1);

    act(() => { fileInput(mounted.renderer).props.onChange({ target: { files: [file], value: 'x' } }); });
    await act(async () => Promise.resolve());
    expect(callableMocks.calls).toHaveLength(1);

    await act(async () => {
      pending.resolve({ data: {} });
      await pending.promise;
    });
    mounted.unmount();
  });

  it('hides the upload control once the year is locked or the module is not editable', async () => {
    hookMocks.modules.budgetbook = readyModule({ fundName: '基金', reviewAuthority: '機關' });
    hookMocks.meta = { meta: { locked: true, deadlines: {} }, loading: false, exists: true, error: null };
    const mounted = mount(BudgetBook);
    expect(fileInput(mounted.renderer)).toBeUndefined();

    hookMocks.meta = { meta: { locked: false, deadlines: {} }, loading: false, exists: true, error: null };
    authMocks.decision = { allowed: false, code: 'module-denied', reason: '沒有此模組的編輯權限。' };
    mounted.rerender();
    expect(fileInput(mounted.renderer)).toBeUndefined();
    mounted.unmount();
  });
});

describe('fixed-field year readiness and error priority', () => {
  it.each([
    ['Basic', Basic, 'basic', '編輯資料'],
    ['Library', Library, 'library', '編輯數量'],
    ['BudgetBook', BudgetBook, 'budgetbook', '編輯基金資料'],
  ])('%s hides editing unless locked is exactly false', (_name, Page, moduleKey, editLabel) => {
    const save = vi.fn();
    hookMocks.modules[moduleKey] = { ...hookMocks.modules[moduleKey], save };
    const mounted = mount(Page);

    for (const locked of [undefined, null, 0, 'false', true]) {
      hookMocks.meta = {
        meta: locked === undefined ? { deadlines: {} } : { locked, deadlines: {} },
        loading: false,
        exists: true,
        error: null,
      };
      mounted.rerender();
      expect(control(mounted.renderer, editLabel)).toBeUndefined();
      expect(pageText(mounted.renderer)).toContain('無法編輯或儲存');
    }

    expect(save).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it.each([
    ['Basic', Basic, 'basic', '無法載入學校基本資料'],
    ['Library', Library, 'library', '無法載入圖書館藏書資料'],
    ['BudgetBook', BudgetBook, 'budgetbook', '無法載入預算書基本資料'],
  ])('%s renders an active error ahead of loading and performs no write', (_name, Page, moduleKey, errorText) => {
    const save = vi.fn();
    const ready = { ...hookMocks.modules[moduleKey], save };

    hookMocks.modules[moduleKey] = { ...ready, error: new Error('module denied') };
    hookMocks.meta = { meta: null, loading: true, exists: false, error: null };
    const mounted = mount(Page);
    expect(pageText(mounted.renderer)).toContain(errorText);
    expect(pageText(mounted.renderer)).not.toContain('正在載入');

    hookMocks.modules[moduleKey] = { ...ready, loading: true };
    hookMocks.meta = {
      meta: null,
      loading: false,
      exists: false,
      error: new Error('meta denied'),
    };
    mounted.rerender();
    expect(pageText(mounted.renderer)).toContain(errorText);
    expect(pageText(mounted.renderer)).not.toContain('正在載入');
    expect(save).not.toHaveBeenCalled();
    mounted.unmount();
  });
});
