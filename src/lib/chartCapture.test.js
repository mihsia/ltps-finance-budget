import { beforeEach, describe, expect, it, vi } from 'vitest';

const html2canvasMock = vi.fn();
vi.mock('html2canvas', () => ({ default: (...args) => html2canvasMock(...args) }));

const { captureChartImages } = await import('./chartCapture');

beforeEach(() => {
  html2canvasMock.mockReset();
});

function fakeCanvas(dataUrl) {
  return { toDataURL: () => dataUrl };
}

function fakeChartEl(offsetWidth, offsetHeight) {
  return { offsetWidth, offsetHeight };
}

describe('captureChartImages', () => {
  it("captures each present DOM node's own CSS pixel size (not the captured canvas's scaled-up pixel size)", async () => {
    const elA = fakeChartEl(300, 150);
    const elB = fakeChartEl(200, 200);
    html2canvasMock.mockImplementation(async (el) => (
      el === elA ? fakeCanvas('data:image/png;base64,AAAA') : fakeCanvas('data:image/png;base64,BBBB')
    ));

    const images = await captureChartImages({ 'finance.expenseTrend': elA, 'module.specialNeeds': elB });

    expect(images).toEqual({
      'finance.expenseTrend': { dataUrl: 'data:image/png;base64,AAAA', width: 300, height: 150 },
      'module.specialNeeds': { dataUrl: 'data:image/png;base64,BBBB', width: 200, height: 200 },
    });
  });

  it('skips a key whose element is null (chart not currently rendered) instead of failing the whole capture', async () => {
    html2canvasMock.mockResolvedValue(fakeCanvas('data:image/png;base64,CCCC'));

    const images = await captureChartImages({ 'module.awards': null, 'module.club': fakeChartEl(100, 100) });

    expect(Object.keys(images)).toEqual(['module.club']);
    expect(html2canvasMock).toHaveBeenCalledOnce();
  });

  it('returns an empty object for no refs', async () => {
    expect(await captureChartImages({})).toEqual({});
    expect(html2canvasMock).not.toHaveBeenCalled();
  });
});
