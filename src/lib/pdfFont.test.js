import { describe, expect, it } from 'vitest';
import { registerCjkFont } from './pdfFont';

function fakeDoc() {
  const calls = [];
  return {
    calls,
    addFileToVFS: (name, data) => calls.push(['addFileToVFS', name, data]),
    addFont: (file, name, style) => calls.push(['addFont', file, name, style]),
    setFont: (name, style) => calls.push(['setFont', name, style]),
  };
}

describe('registerCjkFont', () => {
  it('registers a Chinese-capable normal and bold font under one family name', async () => {
    const doc = fakeDoc();
    const fontName = await registerCjkFont(doc);

    expect(fontName).toBe('NotoSansTC');
    const addFontCalls = doc.calls.filter((call) => call[0] === 'addFont');
    expect(addFontCalls).toEqual([
      ['addFont', 'NotoSansTC-Regular.ttf', 'NotoSansTC', 'normal'],
      ['addFont', 'NotoSansTC-Bold.ttf', 'NotoSansTC', 'bold'],
    ]);
    expect(doc.calls).toContainEqual(['setFont', 'NotoSansTC', 'normal']);
  });

  it('embeds non-empty, distinct font payloads for each style', async () => {
    const doc = fakeDoc();
    await registerCjkFont(doc);

    const vfsCalls = doc.calls.filter((call) => call[0] === 'addFileToVFS');
    expect(vfsCalls).toHaveLength(2);
    const [regular, bold] = vfsCalls.map((call) => call[2]);
    expect(regular.length).toBeGreaterThan(1000);
    expect(bold.length).toBeGreaterThan(1000);
    expect(regular).not.toBe(bold);
  });
});
