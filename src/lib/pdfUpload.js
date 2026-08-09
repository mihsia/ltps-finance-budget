// Client-side half of the budget-book PDF upload flow. Rejecting an obviously
// bad file here saves a slow base64 round trip — functions/pdfStorage.cjs
// re-checks everything server-side since this is presentation-only.
import pdfStorage from '../../functions/pdfStorage.cjs';

export const { MAX_PDF_BYTES } = pdfStorage;

export function validatePdfFile(file) {
  if (!file) return { valid: false, error: '請選擇檔案' };
  if (file.type !== 'application/pdf') return { valid: false, error: '僅接受 PDF 檔案' };
  if (file.size > MAX_PDF_BYTES) {
    return { valid: false, error: `檔案大小不得超過 ${Math.floor(MAX_PDF_BYTES / (1024 * 1024))}MB` };
  }
  return { valid: true, error: null };
}

/** Encodes a File/Blob as a bare base64 string, chunked to avoid a call-stack blowout on large files. */
export async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
