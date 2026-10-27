import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorizationSource, evaluateProfileAccess } from '../lib/accessPolicy';

vi.mock('../firebase', () => ({
  db: { name: 'db' },
  isFirebaseConfigured: true,
}));

const reportModule = await import('./Report.jsx');

function activeAccess(modules = ['report']) {
  return evaluateProfileAccess({
    profileState: 'ready',
    profile: { role: 'editor', status: 'active', modules },
  });
}

function createHarness() {
  const authorization = createAuthorizationSource(activeAccess());
  const downloadExcel = vi.fn().mockResolvedValue(undefined);
  const downloadOverviewExcel = vi.fn().mockResolvedValue(undefined);
  const downloadPdf = vi.fn().mockResolvedValue(undefined);
  const logExport = vi.fn().mockResolvedValue(undefined);
  const createHandlers = reportModule.createReportExportHandlers;

  expect(createHandlers).toBeTypeOf('function');

  const handlers = createHandlers({
    year: '115',
    who: '管理者',
    authorizeModule: authorization.authorizeModule,
    downloadExcel,
    downloadOverviewExcel,
    downloadPdf,
    logExport,
  });

  return {
    authorization,
    downloadExcel,
    downloadOverviewExcel,
    downloadPdf,
    logExport,
    ...handlers,
  };
}

describe('Report export authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies retained export callbacks after current report access is revoked', async () => {
    const harness = createHarness();
    const retainedExcel = harness.exportExcel;
    const retainedPdf = harness.exportPdf;

    harness.authorization.replace(evaluateProfileAccess({
      profileState: 'ready',
      profile: { role: 'editor', status: 'disabled', modules: ['report'] },
    }));

    await retainedExcel(false);
    await retainedPdf();

    expect(harness.downloadExcel).not.toHaveBeenCalled();
    expect(harness.downloadOverviewExcel).not.toHaveBeenCalled();
    expect(harness.downloadPdf).not.toHaveBeenCalled();
    expect(harness.logExport).not.toHaveBeenCalled();
  });

  it('logs exactly one history entry for each successful authorized export', async () => {
    const harness = createHarness();

    await harness.exportExcel(true);
    await harness.exportPdf();

    // Filenames carry a trailing _YYYYMMDD-HHmm timestamp (fileTimestampSuffix
    // in Report.jsx) so a re-export doesn't collide with/overwrite an
    // earlier one — matched loosely here since the exact minute isn't
    // deterministic.
    const excelNamePattern = /^115年度議會報表（議會格式）_\d{8}-\d{4}\.xlsx$/;
    const pdfNamePattern = /^115年度基金總覽報表_\d{8}-\d{4}\.pdf$/;
    expect(harness.downloadExcel).toHaveBeenCalledOnce();
    expect(harness.downloadExcel.mock.calls[0][0]).toMatch(excelNamePattern);
    expect(harness.downloadPdf).toHaveBeenCalledOnce();
    expect(harness.downloadPdf.mock.calls[0][0]).toMatch(pdfNamePattern);
    expect(harness.logExport).toHaveBeenCalledTimes(2);
    expect(harness.logExport.mock.calls[0][0]).toMatch(excelNamePattern);
    expect(harness.logExport.mock.calls[0][1]).toBe('管理者');
    expect(harness.logExport.mock.calls[1][0]).toMatch(pdfNamePattern);
    expect(harness.logExport.mock.calls[1][1]).toBe('管理者');
  });

  it('does not log a successful export when the download fails', async () => {
    const harness = createHarness();
    harness.downloadOverviewExcel.mockRejectedValueOnce(new Error('download failed'));

    await expect(harness.exportExcel(false)).rejects.toThrow('download failed');

    expect(harness.logExport).not.toHaveBeenCalled();
  });
});
