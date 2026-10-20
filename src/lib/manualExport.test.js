import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import jsPDF from 'jspdf';
import { buildManualPdf } from './manualExport';
import { MANUAL_SECTIONS } from './manualContent';

// buildManualPdf() loads each screenshot via `new Image()` and embeds it
// with jsPDF's addImage, both of which need a real browser canvas — this
// test suite runs in plain Node (no jsdom/canvas, same as the rest of the
// project), so both are stubbed here rather than pulled in as a new
// devDependency just for this one PDF's image step. The stubs exercise the
// same code path (image "loads", addImage gets called); only the actual
// pixel decoding is skipped.
describe('buildManualPdf', () => {
  let originalImage;

  beforeAll(() => {
    originalImage = globalThis.Image;
    globalThis.Image = class FakeImage {
      set src(_value) {
        this.naturalWidth = 1280;
        this.naturalHeight = 900;
        queueMicrotask(() => this.onload?.());
      }
    };
    // jsPDF plugin methods like addImage live on jsPDF.API and get copied
    // onto each instance as an own property at construction time — they
    // are never reachable via jsPDF.prototype, so the API object (not the
    // prototype) is what must be patched before buildManualPdf() creates
    // its own internal `new jsPDF()`.
    vi.spyOn(jsPDF.API, 'addImage').mockImplementation(function addImage() { return this; });
  });

  afterAll(() => {
    globalThis.Image = originalImage;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    jsPDF.API.addImage.mockClear();
  });

  it('registers the Chinese-capable font and produces a saveable, multi-page document', async () => {
    const doc = await buildManualPdf();
    expect(doc.getFontList().NotoSansTC).toEqual(['normal', 'bold']);
    expect(doc).toHaveProperty('save');
    expect(typeof doc.output('datauristring')).toBe('string');
    // A cover page plus at least one page per section's screenshot means
    // the page count should be at least the section count.
    expect(doc.internal.getNumberOfPages()).toBeGreaterThanOrEqual(MANUAL_SECTIONS.length);
  });

  it('calls addImage once per screenshot block in the content', async () => {
    const imageBlockCount = MANUAL_SECTIONS.flatMap((s) => s.blocks).filter((b) => b.type === 'image').length;
    await buildManualPdf();
    expect(jsPDF.API.addImage).toHaveBeenCalledTimes(imageBlockCount);
  });
});
