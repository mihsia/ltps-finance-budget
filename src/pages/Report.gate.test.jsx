import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Report.jsx is a very large component with many data hooks; this file only
// exercises the view-level 'report' module permission gate added alongside
// the 歷史歸檔 permission gate — not the report's full rendering logic
// (which has its own coverage in Report.test.js / reportCharts.test.jsx via
// the pure functions and chart components it exports).
const mocks = vi.hoisted(() => ({
  canEditReport: true,
}));

vi.mock('../firebase', () => ({
  db: { name: 'test-db' },
  isFirebaseConfigured: false,
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
}));
vi.mock('../hooks/useYearData', () => ({
  useYearModule: () => ({ data: null, loading: false, error: null }),
  useYearRecords: () => ({ data: [], loading: false, error: null }),
  useYearMeta: () => ({ meta: null, loading: false, exists: false, error: null }),
  updateYearReportNarrative: vi.fn(),
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { name: '管理員' },
    user: { email: 'admin@example.com' },
    canEditModule: (moduleKey) => moduleKey === 'report' && mocks.canEditReport,
    authorizeModule: () => ({ allowed: true }),
    isAdmin: true,
    authorizeAdmin: () => ({ allowed: true }),
  }),
}));

const Report = (await import('./Report.jsx')).default;

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textOf).join('');
}

beforeEach(() => {
  mocks.canEditReport = true;
});

describe('Report module permission', () => {
  it('shows 無權限 instead of the report body for an account without the report module', () => {
    mocks.canEditReport = false;
    let renderer;
    act(() => {
      renderer = TestRenderer.create(<Report year="115" years={['113', '114', '115']} />);
    });

    expect(textOf(renderer.root)).toContain('無權限');
    act(() => renderer.unmount());
  });

  it('does not show the no-access message for an account with the report module', () => {
    mocks.canEditReport = true;
    let renderer;
    act(() => {
      renderer = TestRenderer.create(<Report year="115" years={['113', '114', '115']} />);
    });

    expect(textOf(renderer.root)).not.toContain('無權限');
    expect(textOf(renderer.root)).toContain('議會報表匯出');
    act(() => renderer.unmount());
  });
});
