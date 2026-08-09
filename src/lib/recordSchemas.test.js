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
    expect(schemas.validateLanguageRecord('certification', {
      lang: '客語', certifiedTeachers: '3', totalTeachers: '2', tested: '4', passed: '2',
    })).toMatchObject({ valid: false, error: '已認證教師不可超過授課教師總數。' });
    expect(schemas.validateLanguageRecord('certification', {
      lang: '客語', certifiedTeachers: '2', totalTeachers: '2', tested: '4', passed: '5',
    })).toMatchObject({ valid: false, error: '通過人數不可超過應考人數。' });
  });

  it('uses field-specific Generic schemas and validates real calendar dates', () => {
    expect(schemas.validateGenericRecord).toBeTypeOf('function');
    expect(schemas.genericRecordSchemas.awards.fields.map((field) => field.label))
      .toEqual(['獲獎項目', '等級', '日期']);
    expect(schemas.validateGenericRecord('awards', {
      item: ' 縣科展 ', level: ' 優等 ', date: '2025-02-29',
    })).toMatchObject({ valid: false, error: '日期必須是有效的 YYYY-MM-DD。' });
    expect(schemas.validateGenericRecord('awards', {
      item: ' 縣科展 ', level: ' 優等 ', date: '2024-02-29',
    })).toEqual({
      valid: true,
      data: { recordType: 'award', item: '縣科展', level: '優等', date: '2024-02-29' },
      error: null,
    });
    expect(schemas.validateGenericRecord('club', {
      name: '桌球社', instructor: '陳老師', participants: '-1', schedule: '週二 16:00',
    })).toMatchObject({ valid: false, error: '人數必須是非負整數。' });
    expect(schemas.validateGenericRecord('land', {
      parcel: '五結段123地號', area: 'Infinity', announcedValue: '12800',
    })).toMatchObject({ valid: false, error: '面積(㎡)必須是非負有限數值。' });
  });
});
