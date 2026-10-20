import { describe, expect, it } from 'vitest';

let schemas = {};
try {
  schemas = await import('./recordSchemas.js');
} catch {
  // The first RED run intentionally exercises the not-yet-created schema module.
}

describe('record CRUD schemas', () => {
  it('normalizes a budget row to stable typed fields without accepting unsafe amounts', () => {
    expect(schemas.validateBudgetRecord).toBeTypeOf('function');
    expect(schemas.validateBudgetRecord('expense', {
      label: '  國民教育計畫  ',
      formula: '  教學活動  ',
      amount: '1200.5',
    })).toEqual({
      valid: true,
      data: {
        recordType: 'expense',
        label: '國民教育計畫',
        formula: '教學活動',
        amount: 1200.5,
        actualAmount: null,
        varianceNote: null,
      },
      error: null,
    });
    for (const amount of ['', '   ', '-1', 'NaN', 'Infinity', '1e309']) {
      expect(schemas.validateBudgetRecord('revenue', {
        label: '收入',
        amount,
      })).toMatchObject({ valid: false, error: '金額必須是非負有限數值。' });
    }
  });

  it('enforces required trimmed text and sensible maximum lengths', () => {
    expect(schemas.validateBudgetRecord('expense', {
      label: ' '.repeat(3), formula: '說明', amount: '1',
    })).toMatchObject({ valid: false, error: '項目名稱不得留白。' });
    expect(schemas.validateBudgetRecord('expense', {
      label: '項'.repeat(121), formula: '說明', amount: '1',
    })).toMatchObject({ valid: false, error: '項目名稱不得超過 120 個字。' });
    expect(schemas.validateBudgetRecord('expense', {
      label: '項目', formula: '說'.repeat(301), amount: '1',
    })).toMatchObject({ valid: false, error: '內容說明不得超過 300 個字。' });
  });

  it('accepts a blank 決算/差異原因 pair (settled after year-end) but validates them once entered', () => {
    expect(schemas.validateBudgetRecord('revenue', {
      label: '租金收入', amount: '40', actualAmount: '', varianceNote: '',
    })).toEqual({
      valid: true,
      data: {
        recordType: 'revenue',
        label: '租金收入',
        amount: 40,
        actualAmount: null,
        varianceNote: null,
      },
      error: null,
    });
    expect(schemas.validateBudgetRecord('revenue', {
      label: '租金收入', amount: '40', actualAmount: '38', varianceNote: '場地租借需求較預期少',
    })).toEqual({
      valid: true,
      data: {
        recordType: 'revenue',
        label: '租金收入',
        amount: 40,
        actualAmount: 38,
        varianceNote: '場地租借需求較預期少',
      },
      error: null,
    });
    expect(schemas.validateBudgetRecord('revenue', {
      label: '租金收入', amount: '40', actualAmount: '-1', varianceNote: '',
    })).toMatchObject({ valid: false, error: '決算金額必須是非負有限數值。' });
  });

  it('normalizes language variants and rejects invalid integer or aggregate relationships', () => {
    expect(schemas.validateLanguageRecord).toBeTypeOf('function');
    expect(schemas.validateLanguageRecord('class', {
      lang: ' 客語 ', classes: '2', students: '7',
    })).toMatchObject({
      valid: true,
      data: { recordType: 'class', lang: '客語', classes: 2, students: 7 },
    });
    expect(schemas.validateLanguageRecord('class', {
      lang: '客語', classes: '1.5', students: '7',
    })).toMatchObject({ valid: false, error: '班級數必須是非負整數。' });
    expect(schemas.validateLanguageRecord('teacher', {
      lang: '客語', name: ' 黃老師 ', certified: '是',
    })).toMatchObject({
      valid: true,
      data: { recordType: 'teacher', lang: '客語', name: '黃老師', certified: '是' },
    });
    expect(schemas.validateLanguageRecord('teacher', {
      lang: '客語', name: '', certified: '是',
    })).toMatchObject({ valid: false, error: '教師姓名不得留白。' });
  });

  it('uses field-specific Generic schemas and validates real calendar dates', () => {
    expect(schemas.validateGenericRecord).toBeTypeOf('function');
    expect(schemas.genericRecordSchemas.awards.fields.map((field) => field.label))
      .toEqual(['類別', '獲獎項目', '賽事類型', '學生姓名', '等級', '日期']);
    expect(schemas.genericRecordSchemas.awards.fields[0]).toMatchObject({
      kind: 'select', options: schemas.AWARD_CATEGORIES,
    });
    expect(schemas.AWARD_CATEGORIES).toEqual(['語文類', '藝文類', '體育類', '科學類']);
    expect(schemas.validateGenericRecord('awards', {
      category: '科學類', item: ' 縣科展 ', competitionType: '團體賽', level: ' 優等 ', date: '2025-02-29',
    })).toMatchObject({ valid: false, error: '日期必須是有效的 YYYY-MM-DD。' });
    expect(schemas.validateGenericRecord('awards', {
      category: '科學類', item: ' 縣科展 ', competitionType: '團體賽', level: ' 優等 ', date: '2024-02-29',
    })).toEqual({
      valid: true,
      data: {
        recordType: 'award', category: '科學類', item: '縣科展', competitionType: '團體賽', studentName: null, level: '優等', date: '2024-02-29',
      },
      error: null,
    });
    expect(schemas.validateGenericRecord('club', {
      name: '桌球社', instructor: '陳老師', participants: '-1', schedule: '週二 16:00',
    })).toMatchObject({ valid: false, error: '人數必須是非負整數。' });
    expect(schemas.validateGenericRecord('land', {
      parcel: '五結段123地號', area: 'Infinity', announcedValue: '12800',
    })).toMatchObject({ valid: false, error: '面積(㎡)必須是非負有限數值。' });
  });

  it('requires a 學生姓名 for an 個人賽 award but lets 團體賽 leave it blank', () => {
    expect(schemas.validateGenericRecord('awards', {
      category: '體育類', item: '宜蘭縣運動會', competitionType: '個人賽', studentName: '', level: '第一名', date: '2025-05-15',
    })).toMatchObject({ valid: false, error: '個人賽請填寫得獎學生姓名。' });
    expect(schemas.validateGenericRecord('awards', {
      category: '體育類', item: '宜蘭縣運動會', competitionType: '個人賽', studentName: ' 陳○安 ', level: '第一名', date: '2025-05-15',
    })).toMatchObject({ valid: true, data: { competitionType: '個人賽', studentName: '陳○安' } });
    expect(schemas.validateGenericRecord('awards', {
      category: '體育類', item: '宜蘭縣運動會', competitionType: '團體賽', studentName: '', level: '第一名', date: '2025-05-15',
    })).toMatchObject({ valid: true, data: { competitionType: '團體賽', studentName: null } });
  });

  it('records special-needs student counts with a categorized dropdown that still allows a custom category, plus an optional note', () => {
    expect(schemas.genericRecordSchemas.specialNeeds.fields.map((field) => field.label))
      .toEqual(['類別', '人數', '說明']);
    expect(schemas.genericRecordSchemas.specialNeeds.fields[0]).toMatchObject({
      kind: 'select', options: schemas.SPECIAL_NEEDS_CATEGORIES, allowCustom: true,
    });
    expect(schemas.SPECIAL_NEEDS_CATEGORIES).toEqual(['原住民', '新住民', '低收入戶', '身障生', '單親生']);
    expect(schemas.validateGenericRecord('specialNeeds', {
      category: '原住民', count: '17', note: '',
    })).toEqual({
      valid: true,
      data: { recordType: 'specialNeeds', category: '原住民', count: 17, note: null },
      error: null,
    });
    expect(schemas.validateGenericRecord('specialNeeds', {
      category: '原住民', count: '17', note: '泰雅：11，阿美：3，太魯閣：2',
    })).toMatchObject({
      valid: true,
      data: { category: '原住民', count: 17, note: '泰雅：11，阿美：3，太魯閣：2' },
    });
    expect(schemas.validateGenericRecord('specialNeeds', {
      category: '原住民', count: '-1', note: '',
    })).toMatchObject({ valid: false, error: '人數必須是非負整數。' });
    // A category outside the fixed option list is still accepted — the
    // dropdown's "其他（自訂）" choice falls back to free text.
    expect(schemas.validateGenericRecord('specialNeeds', {
      category: '外籍配偶子女', count: '3', note: '',
    })).toMatchObject({ valid: true, data: { category: '外籍配偶子女', count: 3 } });
  });
});
