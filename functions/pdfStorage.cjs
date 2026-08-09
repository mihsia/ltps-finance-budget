// Budget-book PDF upload validation. Kept free of firebase-admin imports so it
// can be unit-tested directly (mirrors accountAdmin.cjs). The frontend also
// imports MAX_PDF_BYTES from here (see src/lib/pdfUpload.js) to reject an
// oversized file before spending a round trip on it — that's safe because
// Buffer is only referenced inside functions the browser bundle never calls.

// Base64 inflates the raw file by ~33% on top of the request's other fields,
// so this stays comfortably under any callable-function payload ceiling.
const MAX_PDF_BYTES = 6 * 1024 * 1024;

/** Accepts either a bare base64 string or a `data:...;base64,` data URL. */
function decodeBase64Pdf(base64) {
  if (typeof base64 !== 'string' || !base64) return null;
  const commaIndex = base64.indexOf(',');
  const raw = base64.startsWith('data:') && commaIndex !== -1 ? base64.slice(commaIndex + 1) : base64;
  try {
    const buffer = Buffer.from(raw, 'base64');
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

// The result becomes a Cloud Storage object key (see index.js's
// `budget-books/${year}/${Date.now()}-${fileName}`), so path separators and
// control characters are stripped rather than trusted from client input.
function sanitizeFileName(name) {
  const withoutSeparators = name.replace(/[\\/]+/g, '-');
  const withoutControlChars = Array.from(withoutSeparators)
    .filter((ch) => ch.codePointAt(0) > 0x1f)
    .join('');
  const withoutLeadingDots = withoutControlChars.replace(/^\.+/, '');
  return withoutLeadingDots.slice(0, 150) || 'budget.pdf';
}

function validateUploadRequest({ year, fileName, contentType, base64 } = {}) {
  if (typeof year !== 'string' || !/^\d+$/.test(year)) return { valid: false, error: '年度格式錯誤' };

  const trimmedName = typeof fileName === 'string' ? fileName.trim() : '';
  if (!trimmedName) return { valid: false, error: '請提供檔案名稱' };

  if (contentType !== 'application/pdf') return { valid: false, error: '僅接受 PDF 檔案' };

  const buffer = decodeBase64Pdf(base64);
  if (!buffer) return { valid: false, error: '檔案內容無法解析' };
  if (buffer.length > MAX_PDF_BYTES) {
    return { valid: false, error: `檔案大小不得超過 ${MAX_PDF_BYTES / (1024 * 1024)}MB` };
  }

  return {
    valid: true, error: null, buffer, fileName: sanitizeFileName(trimmedName),
  };
}

module.exports = {
  MAX_PDF_BYTES, decodeBase64Pdf, sanitizeFileName, validateUploadRequest,
};
