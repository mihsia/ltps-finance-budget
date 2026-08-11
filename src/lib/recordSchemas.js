const MAX_NUMBER = 1_000_000_000_000;

function valid(data) {
  return { valid: true, data, error: null };
}

function invalid(error) {
  return { valid: false, data: null, error };
}

function isBlank(value) {
  return value === '' || value === null || value === undefined
    || (typeof value === 'string' && value.trim() === '');
}

function textValue(value, label, maxLength, optional) {
  if (optional && isBlank(value)) return valid(null);
  if (typeof value !== 'string') return invalid(`${label}格式不正確。`);
  const normalized = value.trim();
  if (!normalized) return invalid(`${label}不得留白。`);
  if (normalized.length > maxLength) return invalid(`${label}不得超過 ${maxLength} 個字。`);
  return valid(normalized);
}

function numericValue(value, label, integer, optional) {
  if (optional && isBlank(value)) return valid(null);
  const text = typeof value === 'number' ? String(value) : value;
  const pattern = integer ? /^\d+$/ : /^(?:\d+(?:\.\d*)?|\.\d+)$/;
  const kind = integer ? '非負整數' : '非負有限數值';
  if (typeof text !== 'string' || !pattern.test(text.trim())) {
    return invalid(`${label}必須是${kind}。`);
  }
  const normalized = Number(text.trim());
  if (
    !Number.isFinite(normalized)
    || normalized < 0
    || normalized > MAX_NUMBER
    || (integer && !Number.isSafeInteger(normalized))
  ) return invalid(`${label}必須是${kind}。`);
  return valid(normalized);
}

function dateValue(value, label) {
  if (typeof value !== 'string') return invalid(`${label}必須是有效的 YYYY-MM-DD。`);
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return invalid(`${label}必須是有效的 YYYY-MM-DD。`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return invalid(`${label}必須是有效的 YYYY-MM-DD。`);
  return valid(normalized);
}

function collect(fields, source) {
  const data = {};
  for (const field of fields) {
    let result;
    if (field.kind === 'integer') result = numericValue(source[field.key], field.label, true, field.optional);
    else if (field.kind === 'number') result = numericValue(source[field.key], field.label, false, field.optional);
    else if (field.kind === 'date') result = dateValue(source[field.key], field.label);
    else result = textValue(source[field.key], field.label, field.maxLength, field.optional);
    if (!result.valid) return result;
    data[field.key] = result.data;
  }
  return valid(data);
}

// actualAmount (決算) and varianceNote (差異原因) are both optional: the
// budgeted amount is known up front, but the settled/actual figure is only
// known after the fiscal year closes and gets filled in later via an edit.
const BUDGET_VARIANCE_FIELDS = [
  { key: 'actualAmount', label: '決算金額', inputLabel: '決算金額（千元，年度結束後填寫）', kind: 'number', optional: true },
  { key: 'varianceNote', label: '差異原因說明', kind: 'text', maxLength: 300, optional: true },
];

export const BUDGET_RECORD_SCHEMAS = {
  expense: {
    recordType: 'expense',
    fields: [
      { key: 'label', label: '項目名稱', kind: 'text', maxLength: 120 },
      { key: 'formula', label: '內容說明', kind: 'text', maxLength: 300 },
      { key: 'amount', label: '金額', inputLabel: '預算金額（千元）', kind: 'number' },
      ...BUDGET_VARIANCE_FIELDS,
    ],
  },
  revenue: {
    recordType: 'revenue',
    fields: [
      { key: 'label', label: '來源項目', kind: 'text', maxLength: 120 },
      { key: 'amount', label: '金額', inputLabel: '預算金額（千元）', kind: 'number' },
      ...BUDGET_VARIANCE_FIELDS,
    ],
  },
};

export function validateBudgetRecord(recordType, source) {
  const schema = BUDGET_RECORD_SCHEMAS[recordType];
  if (!schema) return invalid('預算資料類型不正確。');
  const result = collect(schema.fields, source);
  return result.valid ? valid({ recordType: schema.recordType, ...result.data }) : result;
}

export const LANGUAGE_RECORD_SCHEMAS = {
  class: {
    label: '開班資料',
    fields: [
      { key: 'lang', label: '語系', kind: 'text', maxLength: 60 },
      { key: 'classes', label: '班級數', kind: 'integer' },
      { key: 'students', label: '學生人數', kind: 'integer' },
    ],
  },
  certification: {
    label: '認證統計',
    fields: [
      { key: 'lang', label: '語系', kind: 'text', maxLength: 60 },
      { key: 'certifiedTeachers', label: '已認證教師', kind: 'integer' },
      { key: 'totalTeachers', label: '授課教師總數', kind: 'integer' },
      { key: 'tested', label: '應考人數', kind: 'integer' },
      { key: 'passed', label: '通過人數', kind: 'integer' },
    ],
  },
  roster: {
    label: '名冊',
    fields: [
      { key: 'lang', label: '語系', kind: 'text', maxLength: 60 },
      { key: 'level', label: '通過級別', kind: 'text', maxLength: 40 },
      { key: 'name', label: '學生姓名', kind: 'text', maxLength: 60 },
    ],
  },
};

export function validateLanguageRecord(recordType, source) {
  const schema = LANGUAGE_RECORD_SCHEMAS[recordType];
  if (!schema) return invalid('族語資料類型不正確。');
  const result = collect(schema.fields, source);
  if (!result.valid) return result;
  if (
    recordType === 'certification'
    && result.data.certifiedTeachers > result.data.totalTeachers
  ) return invalid('已認證教師不可超過授課教師總數。');
  if (recordType === 'certification' && result.data.passed > result.data.tested) {
    return invalid('通過人數不可超過應考人數。');
  }
  return valid({ recordType, ...result.data });
}

export const genericRecordSchemas = {
  awards: {
    recordType: 'award',
    fields: [
      { key: 'item', label: '獲獎項目', kind: 'text', maxLength: 160 },
      { key: 'level', label: '等級', kind: 'text', maxLength: 80 },
      { key: 'date', label: '日期', kind: 'date' },
    ],
  },
  club: {
    recordType: 'club',
    fields: [
      { key: 'name', label: '社團名稱', kind: 'text', maxLength: 100 },
      { key: 'instructor', label: '指導老師', kind: 'text', maxLength: 80 },
      { key: 'participants', label: '人數', kind: 'integer' },
      { key: 'schedule', label: '上課時間', kind: 'text', maxLength: 100 },
    ],
  },
  land: {
    recordType: 'land',
    fields: [
      { key: 'parcel', label: '地號', kind: 'text', maxLength: 120 },
      { key: 'area', label: '面積(㎡)', kind: 'number' },
      { key: 'announcedValue', label: '公告現值(元/㎡)', kind: 'number' },
    ],
  },
  inquiry: {
    recordType: 'inquiry',
    fields: [
      { key: 'date', label: '日期', kind: 'date' },
      { key: 'subject', label: '議員/題目', kind: 'text', maxLength: 240 },
      { key: 'status', label: '答詢狀態', kind: 'text', maxLength: 60 },
    ],
  },
  specialNeeds: {
    recordType: 'specialNeeds',
    fields: [
      { key: 'category', label: '類別', kind: 'text', maxLength: 60 },
      { key: 'count', label: '人數', kind: 'integer' },
      { key: 'note', label: '說明', kind: 'text', maxLength: 200, optional: true },
    ],
  },
};

export function validateGenericRecord(moduleKey, source) {
  const schema = genericRecordSchemas[moduleKey];
  if (!schema) return invalid('資料模組類型不正確。');
  const result = collect(schema.fields, source);
  return result.valid ? valid({ recordType: schema.recordType, ...result.data }) : result;
}

export function emptyRecordForm(fields) {
  return Object.fromEntries(fields.map((field) => [field.key, '']));
}

export function recordToForm(record, fields) {
  return Object.fromEntries(fields.map((field) => [
    field.key,
    record?.[field.key] == null ? '' : String(record[field.key]),
  ]));
}
