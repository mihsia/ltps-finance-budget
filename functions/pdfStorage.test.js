import { describe, expect, it } from 'vitest';
import {
  MAX_PDF_BYTES, decodeBase64Pdf, sanitizeFileName, validateUploadRequest,
} from './pdfStorage.cjs';

const smallPdfBase64 = Buffer.from('%PDF-1.4 fake pdf bytes').toString('base64');

const validInput = {
  year: '115',
  fileName: '115年度預算書.pdf',
  contentType: 'application/pdf',
  base64: smallPdfBase64,
};

describe('decodeBase64Pdf', () => {
  it('decodes a bare base64 string', () => {
    expect(decodeBase64Pdf(smallPdfBase64).toString()).toContain('%PDF');
  });

  it('decodes a data: URL by stripping the header', () => {
    expect(decodeBase64Pdf(`data:application/pdf;base64,${smallPdfBase64}`).toString()).toContain('%PDF');
  });

  it('rejects empty input', () => {
    expect(decodeBase64Pdf('')).toBeNull();
    expect(decodeBase64Pdf(undefined)).toBeNull();
  });
});

describe('sanitizeFileName', () => {
  it('leaves an ordinary Chinese file name untouched', () => {
    expect(sanitizeFileName('115年度預算書.pdf')).toBe('115年度預算書.pdf');
  });

  it('collapses path separators so a crafted name cannot escape the year folder', () => {
    expect(sanitizeFileName('../../etc/budget.pdf')).not.toMatch(/[/\\]/);
  });

  it('strips leading dots so the object key cannot look like a relative path', () => {
    expect(sanitizeFileName('..hidden.pdf')).toBe('hidden.pdf');
  });

  it('falls back to a default name when nothing but dots remains', () => {
    expect(sanitizeFileName('...')).toBe('budget.pdf');
  });

  it('truncates an excessively long name', () => {
    expect(sanitizeFileName(`${'a'.repeat(300)}.pdf`).length).toBe(150);
  });
});

describe('validateUploadRequest', () => {
  it('accepts a well-formed request and returns the decoded buffer', () => {
    const result = validateUploadRequest(validInput);
    expect(result.valid).toBe(true);
    expect(result.fileName).toBe('115年度預算書.pdf');
    expect(result.buffer.toString()).toContain('%PDF');
  });

  it('trims the file name', () => {
    const result = validateUploadRequest({ ...validInput, fileName: '  budget.pdf  ' });
    expect(result.valid).toBe(true);
    expect(result.fileName).toBe('budget.pdf');
  });

  it('rejects a non-numeric year', () => {
    const result = validateUploadRequest({ ...validInput, year: '115a' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/年度/);
  });

  it('rejects a missing file name', () => {
    const result = validateUploadRequest({ ...validInput, fileName: '   ' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/檔案名稱/);
  });

  it('rejects a non-PDF content type', () => {
    const result = validateUploadRequest({ ...validInput, contentType: 'image/png' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/PDF/);
  });

  it('rejects unparsable base64 content', () => {
    const result = validateUploadRequest({ ...validInput, base64: '' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/檔案內容/);
  });

  it('rejects a file larger than the size limit', () => {
    const oversized = Buffer.alloc(MAX_PDF_BYTES + 1, 1).toString('base64');
    const result = validateUploadRequest({ ...validInput, base64: oversized });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/大小/);
  });

  it('accepts a file exactly at the size limit', () => {
    const atLimit = Buffer.alloc(MAX_PDF_BYTES, 1).toString('base64');
    const result = validateUploadRequest({ ...validInput, base64: atLimit });
    expect(result.valid).toBe(true);
  });

  it('sanitizes a crafted file name before it becomes a Storage object key', () => {
    const result = validateUploadRequest({ ...validInput, fileName: '../../etc/budget.pdf' });
    expect(result.valid).toBe(true);
    expect(result.fileName).not.toMatch(/[/\\]/);
  });
});
