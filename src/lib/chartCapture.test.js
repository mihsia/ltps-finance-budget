import { beforeEach, describe, expect, it, vi } from 'vitest';

const html2canvasMock = vi.fn();
vi.mock('html2canvas', () => ({ default: (...args) => html2canvasMock(...args) }));

const { captureChartImages } = await import('./chartCapture');

beforeEach(() => {
  html2canvasMock.mockReset();
});

function fakeCanvas(dataUrl, width, height) {
  return { width, height, toDataURL: () => dataUrl };
}

describe('captureChartImages', () => {
  it('captures each present DOM node into a keyed {dataUrl, width, height} entry', async () => {
    const elA = {};
    const elB = {};
    html2canvasMock.mockImplementation(async (el) => (
      el === elA ? fakeCanvas('data:image/png;base64,AAAA', 300, 150) : fakeCanvas('data:image/png;base64,BBBB', 200, 200)
    ));

    const images = await captureChartImages({ 'finance.expenseTrend': elA, 'module.specialNeeds': elB });

    expect(images).toEqual({
      'finance.expenseTrend': { dataUrl: 'data:image/png;base64,AAAA', width: 300, height: 150 },
      'module.specialNeeds': { dataUrl: 'data:image/png;base64,BBBB', width: 200, height: 200 },
    });
  });

  it('skips a key whose element is null (chart not currently rendered) instead of failing the whole capture', async () => {
    html2canvasMock.mockResolvedValue(fakeCanvas('data:image/png;base64,CCCC', 100, 100));

    const images = await captureChartImages({ 'module.awards': null, 'module.club': {} });

    expect(Object.keys(images)).toEqual(['module.club']);
    expect(html2canvasMock).toHaveBeenCalledOnce();
  });

  it('returns an empty object for no refs', async () => {
    expect(await captureChartImages({})).toEqual({});
    expect(html2canvasMock).not.toHaveBeenCalled();
  });
});
