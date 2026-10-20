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

// "select" fields validate identically to free text (any non-blank string up
// to maxLength) — `options` and `allowCustom` are UI hints consumed by
// Generic.jsx to render a dropdown, optionally with a custom-entry fallback.
export const AWARD_CATEGORIES = ['語文類', '藝文類', '體育類', '科學類'];
export const SPECIAL_NEEDS_CATEGORIES = ['原住民', '新住民', '低收入戶', '身障生', '單親生'];

// 獲獎項目 options, grouped by 類別 so the dropdown only offers items that make
// sense for whichever category was picked. Kept to 宜蘭縣／全縣層級賽事 —
// students place in those far more often than at the national level, so a
// 全國賽 preset would mostly go unused; anything outside this list (national
// or otherwise) still works via 其他（自訂）.
export const AWARD_ITEM_OPTIONS_BY_CATEGORY = {
  語文類: [
    '宜蘭縣語文競賽－朗讀', '宜蘭縣語文競賽－演說', '宜蘭縣語文競賽－作文', '宜蘭縣語文競賽－寫字',
    '宜蘭縣語文競賽－字音字形', '宜蘭縣學生閱讀心得寫作比賽',
  ],
  藝文類: [
    '宜蘭縣學生美術比賽', '宜蘭縣學生音樂比賽', '宜蘭縣直笛比賽', '宜蘭縣合唱比賽', '宜蘭縣書法比賽',
  ],
  體育類: [
    '宜蘭縣運動會', '宜蘭縣游泳錦標賽', '宜蘭縣躲避球錦標賽', '宜蘭縣跳繩比賽', '宜蘭縣直排輪競賽',
  ],
  科學類: [
    '宜蘭縣科學展覽會', '宜蘭縣創意機器人競賽', '宜蘭縣科技創作競賽', '宜蘭縣小論文寫作比賽',
  ],
};

export const AWARD_LEVELS = [
  '特優', '優等', '甲等', '第一名', '第二名', '第三名', '第四名', '第五名', '第六名', '佳作',
];

export const AWARD_COMPETITION_TYPES = ['個人賽', '團體賽'];

// 課後社團通常固定在放學後的某個時段上課；列出常見的平日放學後與週六上午時
// 段供快速選取，其餘時段仍可透過「其他（自訂）」輸入。
export const CLUB_SCHEDULE_OPTIONS = [
  '週一 16:00', '週二 16:00', '週三 16:00', '週四 16:00', '週五 16:00', '週六 09:00', '週六 10:00',
];

export const genericRecordSchemas = {
  awards: {
    recordType: 'award',
    fields: [
      {
        key: 'category', label: '類別', kind: 'select', options: AWARD_CATEGORIES, maxLength: 20,
      },
      {
        key: 'item',
        label: '獲獎項目',
        kind: 'select',
        optionsKey: 'category',
        optionsMap: AWARD_ITEM_OPTIONS_BY_CATEGORY,
        allowCustom: true,
        maxLength: 160,
      },
      {
        key: 'competitionType', label: '賽事類型', kind: 'select', options: AWARD_COMPETITION_TYPES, maxLength: 10,
      },
      {
        key: 'studentName', label: '學生姓名', kind: 'text', maxLength: 60, optional: true,
      },
      {
        key: 'level', label: '等級', kind: 'select', options: AWARD_LEVELS, allowCustom: true, maxLength: 80,
      },
      { key: 'date', label: '日期', kind: 'date' },
    ],
  },
  club: {
    recordType: 'club',
    fields: [
      { key: 'name', label: '社團名稱', kind: 'text', maxLength: 100 },
      { key: 'instructor', label: '指導老師', kind: 'text', maxLength: 80 },
      { key: 'participants', label: '人數', kind: 'integer' },
      {
        key: 'schedule', label: '上課時間', kind: 'select', options: CLUB_SCHEDULE_OPTIONS, allowCustom: true, maxLength: 100,
      },
      { key: 'venue', label: '上課場地', kind: 'text', maxLength: 60 },
      { key: 'feePerStudent', label: '每生費用（元）', kind: 'integer' },
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
      {
        key: 'category',
        label: '類別',
        kind: 'select',
        options: SPECIAL_NEEDS_CATEGORIES,
        allowCustom: true,
        maxLength: 60,
      },
      { key: 'count', label: '人數', kind: 'integer' },
      { key: 'note', label: '說明', kind: 'text', maxLength: 200, optional: true },
    ],
  },
};

export function validateGenericRecord(moduleKey, source) {
  const schema = genericRecordSchemas[moduleKey];
  if (!schema) return invalid('資料模組類型不正確。');
  const result = collect(schema.fields, source);
  if (!result.valid) return result;
  // 團體賽沒有單一得獎人，姓名留空即可；個人賽則需要知道是哪位學生得獎。
  if (moduleKey === 'awards' && result.data.competitionType === '個人賽' && !result.data.studentName) {
    return invalid('個人賽請填寫得獎學生姓名。');
  }
  return valid({ recordType: schema.recordType, ...result.data });
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
