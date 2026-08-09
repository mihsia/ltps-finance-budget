import { describe, expect, it } from 'vitest';
import { MAX_PDF_BYTES as SERVER_MAX_PDF_BYTES } from '../../functions/pdfStorage.cjs';
import { MAX_PDF_BYTES, fileToBase64, validatePdfFile } from './pdfUpload';

it('keeps the client-side size limit in sync with functions/pdfStorage.cjs', () => {
  expect(MAX_PDF_BYTES).toBe(SERVER_MAX_PDF_BYTES);
});

function fakeFile({ type = 'application/pdf', size = 10, bytes = null } = {}) {
  const content = bytes || new Uint8Array(size).fill(65);
  return {
    type,
    size: content.length,
    arrayBuffer: async () => content.buffer,
  };
}

describe('validatePdfFile', () => {
  it('rejects a missing file', () => {
    expect(validatePdfFile(null).valid).toBe(false);
  });

  it('rejects a non-PDF content type', () => {
    const result = validatePdfFile(fakeFile({ type: 'image/png' }));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/PDF/);
  });

  it('rejects a file over the size limit', () => {
    const result = validatePdfFile(fakeFile({ size: MAX_PDF_BYTES + 1 }));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/大小/);
  });

  it('accepts a well-formed PDF file', () => {
    const result = validatePdfFile(fakeFile({}));
    expect(result.valid).toBe(true);
  });
});

describe('fileToBase64', () => {
  it('encodes small file content correctly', async () => {
    const file = fakeFile({ bytes: new TextEncoder().encode('%PDF-1.4 hello') });
    const base64 = await fileToBase64(file);
    expect(atob(base64)).toBe('%PDF-1.4 hello');
  });

  it('encodes content spanning multiple internal chunks without corruption', async () => {
    const bytes = new Uint8Array(0x8000 + 100);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251;
    const base64 = await fileToBase64(fakeFile({ bytes }));
    const decoded = atob(base64);
    expect(decoded.length).toBe(bytes.length);
    expect(decoded.charCodeAt(0)).toBe(0);
    expect(decoded.charCodeAt(0x8000)).toBe(0x8000 % 251);
  });
});
