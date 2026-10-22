import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  actor: null,
  isAdmin: true,
  canEditArchive: true,
  importRecords: vi.fn().mockResolvedValue([]),
  ensureNextYearCreated: vi.fn().mockResolvedValue('116'),
  deleteLatestYear: vi.fn().mockResolvedValue(null),
  updateYearOpeningFundBalance: vi.fn().mockResolvedValue(undefined),
  setYear: vi.fn(),
  parseImportFile: vi.fn().mockResolvedValue({
    fields: {
      revenueTotal: 140,
      expenseTotal: 100,
      propertyIncome: 20,
      govGrant: 120,
      eduPlan: 50,
      adminPlan: 30,
      buildingPlan: 20,
      openingFundBalance: 728,
    },
    missing: [],
  }),
  budgetRecords: {
    data: [
      { id: 'old-property', recordType: 'revenue', label: '財產處分收入', amount: 10, deletedAt: null },
      { id: 'old-rent', recordType: 'revenue', label: '租金收入', amount: 5, deletedAt: null },
      { id: 'old-grant', recordType: 'revenue', label: '政府撥入收入（公庫撥款）', amount: 100, deletedAt: null },
      { id: 'deleted-interest', recordType: 'revenue', label: '利息收入', amount: 999, deletedAt: { seconds: 1 } },
    ],
    loading: false,
    error: null,
  },
  updateYearDeadline: vi.fn().mockResolvedValue(undefined),
  yearMeta: { meta: { deadline: null }, loading: false, exists: true, error: null },
}));

vi.mock('../firebase', () => ({ db: { name: 'test-db' } }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...segments) => ({ path: segments })),
  getDoc: vi.fn().mockResolvedValue({ data: () => ({ expense: { breakdown: [] }, revenue: { rows: [] } }) }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => ({ timestamp: true })),
}));
vi.mock('../hooks/useYearData', () => ({
  createNextYear: vi.fn().mockResolvedValue('116'),
  ensureNextYearCreated: mocks.ensureNextYearCreated,
  deleteLatestYear: mocks.deleteLatestYear,
  updateYearDeadline: mocks.updateYearDeadline,
  updateYearOpeningFundBalance: mocks.updateYearOpeningFundBalance,
  useYearMeta: () => mocks.yearMeta,
  useYearRecords: () => mocks.budgetRecords,
}));
vi.mock('../lib/yearDataRepository', () => ({
  yearDataRepository: { importRecords: mocks.importRecords },
}));
vi.mock('../lib/importParser', () => ({
  parseImportFile: mocks.parseImportFile,
  IMPORT_FIELDS: [
    { id: 'revenueTotal', label: '歲入合計', group: 'info' },
    { id: 'expenseTotal', label: '歲出合計', group: 'info' },
    { id: 'propertyIncome', label: '財產收入', group: 'info' },
    { id: 'govGrant', label: '政府撥入收入', group: 'revenue', revenueLabel: '政府撥入收入（公庫撥款）' },
    { id: 'eduPlan', label: '國民教育計畫', group: 'expense', expenseLabel: '國民教育計畫' },
    { id: 'adminPlan', label: '一般行政管理計畫', group: 'expense', expenseLabel: '一般行政管理計畫' },
    { id: 'buildingPlan', label: '建築及設備計畫', group: 'expense', expenseLabel: '建築及設備計畫' },
    { id: 'openingFundBalance', label: '期初基金餘額（預算書表）', group: 'budgetbook' },
  ],
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAdmin: mocks.isAdmin,
    canEditModule: (moduleKey) => moduleKey === 'archive' && mocks.canEditArchive,
    authorizeAdmin: () => ({ allowed: true }),
    authorizeAdminActor: () => mocks.actor
      ? { allowed: true, actor: { ...mocks.actor } }
      : { allowed: false, code: 'actor-missing', reason: '無法確認操作者身分。' },
  }),
}));

const archiveModule = await import('./Archive.jsx');
const Archive = archiveModule.default;

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textOf).join('');
}

function control(renderer, label) {
  return renderer.root.findAll(
    (node) => typeof node.props.onClick === 'function' && textOf(node).trim() === label,
  )[0];
}

async function prepareReview(renderer) {
  const fileInput = renderer.root.findByProps({ type: 'file' });
  await act(async () => fileInput.props.onChange({
    target: { files: [{ name: '116-budget.pdf' }], value: 'selected' },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor = null;
  mocks.isAdmin = true;
  mocks.canEditArchive = true;
  mocks.ensureNextYearCreated.mockResolvedValue('116');
  mocks.deleteLatestYear.mockResolvedValue(null);
  mocks.budgetRecords.loading = false;
  mocks.budgetRecords.error = null;
  mocks.updateYearDeadline.mockResolvedValue(undefined);
  mocks.updateYearOpeningFundBalance.mockResolvedValue(undefined);
  mocks.yearMeta = { meta: { deadline: null }, loading: false, exists: true, error: null };
});

describe('Archive budget import', () => {
  it('builds the same flat typed record shape consumed by Budget and excludes deleted carry-forward rows', () => {
    expect(archiveModule.buildBudgetImportRecords).toBeTypeOf('function');
    const review = [
      { id: 'govGrant', value: '120' },
      { id: 'eduPlan', value: '50' },
      { id: 'adminPlan', value: '30' },
      { id: 'buildingPlan', value: '20' },
    ];

    expect(archiveModule.buildBudgetImportRecords(review, mocks.budgetRecords.data)).toEqual([
      { recordType: 'expense', label: '國民教育計畫', formula: '辦理校務行政、教學活動及各項專案計畫等', amount: 50 },
      { recordType: 'expense', label: '一般行政管理計畫', formula: '教職員工人事費、歷年退休金及遺屬年金業務等', amount: 30 },
      { recordType: 'expense', label: '建築及設備計畫', formula: '改善並充實學校教學及行政環境、購置設備等', amount: 20 },
      { recordType: 'revenue', label: '財產處分收入', amount: 10 },
      { recordType: 'revenue', label: '租金收入', amount: 5 },
      { recordType: 'revenue', label: '政府撥入收入（公庫撥款）', amount: 120 },
    ]);
  });

  it('requires the invocation-current admin actor and imports target-year records atomically without a legacy module write', async () => {
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive
          years={['113', '114', '115']}
          latestYear="115"
          setYear={mocks.setYear}
          setNav={vi.fn()}
        />,
      );
    });
    await prepareReview(renderer);

    await act(async () => control(renderer, '確認匯入 116 年度').props.onClick());
    expect(mocks.importRecords).not.toHaveBeenCalled();
    expect(mocks.setYear).not.toHaveBeenCalled();

    mocks.actor = { uid: 'admin-current', name: '即時管理員' };
    await act(async () => control(renderer, '確認匯入 116 年度').props.onClick());

    expect(mocks.ensureNextYearCreated).toHaveBeenCalledWith('115');
    expect(mocks.importRecords).toHaveBeenCalledWith(expect.objectContaining({
      year: '116',
      moduleKey: 'budget',
      actor: { uid: 'admin-current', name: '即時管理員' },
      records: expect.arrayContaining([
        expect.objectContaining({ recordType: 'expense', label: '國民教育計畫', amount: 50 }),
        expect.objectContaining({ recordType: 'revenue', label: '政府撥入收入（公庫撥款）', amount: 120 }),
      ]),
    }));
    expect(mocks.importRecords.mock.calls[0][0]).not.toHaveProperty('yearData');
    expect(mocks.setYear).toHaveBeenCalledWith('116');
    act(() => renderer.unmount());
  });

  it('applies the parsed 期初基金餘額 to the next year\'s 預算書表 on confirm', async () => {
    mocks.actor = { uid: 'admin-current', name: '即時管理員' };
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['113', '114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });
    await prepareReview(renderer);

    await act(async () => control(renderer, '確認匯入 116 年度').props.onClick());

    expect(mocks.updateYearOpeningFundBalance).toHaveBeenCalledWith('116', 728);
    act(() => renderer.unmount());
  });

  it('leaves the copied-forward draft alone when the upload has no 期初基金餘額 to confirm', async () => {
    mocks.actor = { uid: 'admin-current', name: '即時管理員' };
    mocks.parseImportFile.mockResolvedValue({
      fields: { govGrant: 120, eduPlan: 50, adminPlan: 30, buildingPlan: 20 },
      missing: ['openingFundBalance'],
    });
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['113', '114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });
    await prepareReview(renderer);

    await act(async () => control(renderer, '確認匯入 116 年度').props.onClick());

    expect(mocks.updateYearOpeningFundBalance).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });
});

describe('Archive year deletion', () => {
  it('only shows 刪除 next to the current (unlocked) year, not an archived one, and only for an admin', () => {
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });
    const deleteControls = () => renderer.root.findAll(
      (node) => typeof node.props.onClick === 'function' && textOf(node).trim() === '刪除',
    );
    expect(deleteControls()).toHaveLength(1);
    act(() => renderer.unmount());

    mocks.isAdmin = false;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });
    expect(deleteControls()).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('ignores 確實刪除 until the typed text matches the year exactly, then deletes and moves to the returned previous year', async () => {
    mocks.deleteLatestYear.mockResolvedValue('114');
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });

    act(() => control(renderer, '刪除').props.onClick());
    const confirmInput = renderer.root.findByProps({ placeholder: '115' });

    await act(async () => control(renderer, '確實刪除').props.onClick());
    expect(mocks.deleteLatestYear).not.toHaveBeenCalled();

    act(() => confirmInput.props.onChange({ target: { value: '11' } }));
    await act(async () => control(renderer, '確實刪除').props.onClick());
    expect(mocks.deleteLatestYear).not.toHaveBeenCalled();

    act(() => confirmInput.props.onChange({ target: { value: '115' } }));
    await act(async () => control(renderer, '確實刪除').props.onClick());

    expect(mocks.deleteLatestYear).toHaveBeenCalledWith('115');
    expect(mocks.setYear).toHaveBeenCalledWith('114');
    act(() => renderer.unmount());
  });

  it('shows the thrown error message and keeps the dialog open when deletion fails', async () => {
    mocks.deleteLatestYear.mockRejectedValue(new Error('只能刪除目前「編輯中」（尚未封存）的年度，已封存的年度無法刪除。'));
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });

    act(() => control(renderer, '刪除').props.onClick());
    const confirmInput = renderer.root.findByProps({ placeholder: '115' });
    act(() => confirmInput.props.onChange({ target: { value: '115' } }));
    await act(async () => control(renderer, '確實刪除').props.onClick());

    expect(textOf(renderer.root)).toContain('只能刪除目前「編輯中」（尚未封存）的年度，已封存的年度無法刪除。');
    expect(mocks.setYear).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ placeholder: '115' })).toBeTruthy();
    act(() => renderer.unmount());
  });

  it('closes the dialog and clears the typed text on 取消', () => {
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });

    act(() => control(renderer, '刪除').props.onClick());
    expect(renderer.root.findByProps({ placeholder: '115' })).toBeTruthy();

    act(() => control(renderer, '取消').props.onClick());
    expect(() => renderer.root.findByProps({ placeholder: '115' })).toThrow();
    act(() => renderer.unmount());
  });
});

describe('Archive 填報截止日管理', () => {
  function saveLink(renderer) {
    return renderer.root.findAll(
      (node) => typeof node.props.onClick === 'function' && textOf(node).trim() === '儲存',
    )[0];
  }

  it('renders a single date input pre-filled with the committed system-wide deadline', () => {
    mocks.yearMeta = {
      meta: { deadline: '2026-11-30' }, loading: false, exists: true, error: null,
    };
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });

    const dateInputs = renderer.root.findAllByProps({ type: 'date' });
    expect(dateInputs).toHaveLength(1);
    expect(dateInputs[0].props.value).toBe('2026-11-30');
    act(() => renderer.unmount());
  });

  it('saves a typed-in date against the current (latest) year, not a specific module', async () => {
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });

    const dateInput = renderer.root.findAllByProps({ type: 'date' })[0];
    act(() => dateInput.props.onChange({ target: { value: '2026-11-30' } }));
    await act(async () => saveLink(renderer).props.onClick());

    expect(mocks.updateYearDeadline).toHaveBeenCalledWith('115', '2026-11-30');
    act(() => renderer.unmount());
  });

  it('clears the committed deadline via 清除, which only appears once a deadline is committed', async () => {
    mocks.yearMeta = {
      meta: { deadline: '2026-10-31' }, loading: false, exists: true, error: null,
    };
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });

    const clearLinks = renderer.root.findAll(
      (node) => typeof node.props.onClick === 'function' && textOf(node).trim() === '清除',
    );
    expect(clearLinks).toHaveLength(1);
    await act(async () => clearLinks[0].props.onClick());

    expect(mocks.updateYearDeadline).toHaveBeenCalledWith('115', '');
    act(() => renderer.unmount());
  });

  it('does not show 清除 when no deadline is committed yet', () => {
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });

    const clearLinks = renderer.root.findAll(
      (node) => typeof node.props.onClick === 'function' && textOf(node).trim() === '清除',
    );
    expect(clearLinks).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('shows the thrown error message instead of silently failing', async () => {
    mocks.updateYearDeadline.mockRejectedValue(new Error('無法更新填報截止日，請稍後再試。'));
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });

    const dateInput = renderer.root.findAllByProps({ type: 'date' })[0];
    act(() => dateInput.props.onChange({ target: { value: '2026-11-30' } }));
    await act(async () => saveLink(renderer).props.onClick());

    expect(textOf(renderer.root)).toContain('無法更新填報截止日，請稍後再試。');
    act(() => renderer.unmount());
  });

  it('is not shown at all to a non-admin, even one with the archive module assigned', () => {
    mocks.isAdmin = false;
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });

    expect(renderer.root.findAllByProps({ type: 'date' })).toHaveLength(0);
    expect(textOf(renderer.root)).not.toContain('填報截止日管理');
    act(() => renderer.unmount());
  });
});

describe('Archive module permission', () => {
  it('shows 無權限 instead of the year list for an account without the archive module (even a non-admin editor)', () => {
    mocks.isAdmin = false;
    mocks.canEditArchive = false;
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        <Archive years={['114', '115']} latestYear="115" setYear={mocks.setYear} setNav={vi.fn()} />,
      );
    });

    expect(textOf(renderer.root)).toContain('無權限');
    expect(renderer.root.findAllByType('input')).toHaveLength(0);
    act(() => renderer.unmount());
  });
});
