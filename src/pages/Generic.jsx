import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useYearMeta, useYearRecords } from '../hooks/useYearData';
import { useRecordCrudActions } from '../hooks/useRecordCrudActions';
import { useAuth } from '../contexts/AuthContext';
import { genericModuleMeta } from '../lib/nav';
import {
  emptyRecordForm,
  genericRecordSchemas,
  recordToForm,
  validateGenericRecord,
} from '../lib/recordSchemas';
import { deadlineExtraCheck, getDeadlineState } from '../lib/fixedFieldEditing';
import { softDeleteVerb } from '../lib/recordLifecycle';
import { buildAwardExportWorkbook, buildAwardImportTemplateWorkbook, parseAwardImportFile } from '../lib/awardImport';
import { buildInquiryExportWorkbook, buildInquiryImportTemplateWorkbook, parseInquiryImportFile } from '../lib/inquiryImport';
import NoModuleAccess from '../components/NoModuleAccess';
import {
  pageTitle, pageSubtitle, card, input, btnPrimary, btnOutline, btnSecondary,
  tableHeadRow, tableRow, lockedBanner, deadlineBanner, badge,
} from '../styles';

function messageStyle(message) {
  return {
    maxWidth: 720,
    marginBottom: 14,
    color: /成功/.test(message) ? '#2F7D55' : '#B5533E',
    font: "600 12.5px 'Noto Sans TC', sans-serif",
  };
}

function inputType(kind) {
  if (kind === 'date') return 'date';
  if (kind === 'time') return 'time';
  if (kind === 'integer' || kind === 'number') return 'number';
  return 'text';
}

const CUSTOM_OPTION = '__custom__';

// Modules with their own standalone Excel export/import, separate from the
// all-module 議會報表 exports in Report.jsx. Keyed by moduleKey so adding a
// module here is the only wiring needed — no more hardcoded `moduleKey ===
// 'awards'` branches scattered through the component.
const IMPORT_EXPORT = {
  awards: {
    exportFileName: (year) => `${year}年度獲獎紀錄.xlsx`,
    templateFileName: '獲獎紀錄匯入範本.xlsx',
    buildExportWorkbook: buildAwardExportWorkbook,
    buildTemplateWorkbook: buildAwardImportTemplateWorkbook,
    parseImportFile: parseAwardImportFile,
    importItemLabel: (row) => row.item,
  },
  inquiry: {
    exportFileName: (year) => `${year}年度議會質詢答詢紀錄.xlsx`,
    templateFileName: '議會質詢答詢匯入範本.xlsx',
    buildExportWorkbook: buildInquiryExportWorkbook,
    buildTemplateWorkbook: buildInquiryImportTemplateWorkbook,
    parseImportFile: parseInquiryImportFile,
    importItemLabel: (row) => row.subject,
  },
};

// The custom-entry text box is tracked by its own marker key (rather than
// derived purely from the field's current value) so picking "其他（自訂）"
// keeps the text box visible even while its value is still blank. Editing an
// existing record whose stored category isn't one of the fixed options also
// counts as custom mode, with no marker needed.
function customMarkerKey(fieldSchema) {
  return `${fieldSchema.key}__custom`;
}

// A field can list its options directly (`options`) or, like 獲獎項目, depend
// on another field's current value (`optionsKey` + `optionsMap`) so the list
// only offers items that make sense for the category already picked.
function resolveOptions(fieldSchema, values) {
  if (fieldSchema.optionsKey) return fieldSchema.optionsMap[values[fieldSchema.optionsKey]] || [];
  return fieldSchema.options;
}

function isCustomSelected(fieldSchema, values) {
  if (!fieldSchema.allowCustom) return false;
  if (values[customMarkerKey(fieldSchema)]) return true;
  const value = values[fieldSchema.key];
  return Boolean(value) && !resolveOptions(fieldSchema, values).includes(value);
}

function selectValue(fieldSchema, values) {
  const value = values[fieldSchema.key];
  if (resolveOptions(fieldSchema, values).includes(value)) return value;
  if (isCustomSelected(fieldSchema, values)) return CUSTOM_OPTION;
  return '';
}

export default function Generic({
  year,
  latestYear,
  moduleKey,
  hasCurrentYear = () => false,
}) {
  const meta = genericModuleMeta[moduleKey];
  const schema = genericRecordSchemas[moduleKey];
  const yearState = useYearMeta(year);
  const { canEditModule, authorizeModuleActor } = useAuth();
  const deadlineState = getDeadlineState(yearState.meta?.deadlines, moduleKey);
  const deadlineInvalid = deadlineState.invalid;
  const pastDeadline = deadlineState.deadline !== null
    && Date.now() > deadlineState.deadline.getTime();
  const recoveryAllowed = canEditModule(moduleKey)
    && year === latestYear
    && yearState.exists
    && yearState.meta?.locked === false
    && !pastDeadline
    && !deadlineInvalid;
  const [showDeleted, setShowDeleted] = useState(false);
  const includeDeleted = showDeleted && recoveryAllowed;
  const recordState = useYearRecords(year, moduleKey, { includeDeleted });
  const [formState, setFormState] = useState(null);
  const importFileRef = useRef(null);
  const [importState, setImportState] = useState(null);
  const actions = useRecordCrudActions({
    scopeKey: `${year}\0${latestYear}\0${moduleKey}\0${includeDeleted ? 1 : 0}`,
    moduleKey,
    hasCurrentYear,
    yearState,
    recordState,
    authorizeModuleActor,
    extraCheck: deadlineExtraCheck(moduleKey, meta.title),
  });

  useEffect(() => {
    setFormState(null);
    if (!recoveryAllowed) setShowDeleted(false);
  }, [moduleKey, recoveryAllowed, year]);

  const activeRecords = recordState.data.filter(
    (record) => record.recordType === schema.recordType && !record.deletedAt,
  );
  const deletedRecords = includeDeleted
    ? recordState.data.filter(
      (record) => record.recordType === schema.recordType && record.deletedAt,
    )
    : [];
  const writeVisible = recoveryAllowed && !recordState.loading && !recordState.error;

  // Export is read-only so it's offered whenever the module is viewable;
  // import creates records, so it needs the same year-unlocked/current-year
  // eligibility as 新增一筆. Which modules get this at all, and the Excel
  // shape each one reads/writes, is declared in IMPORT_EXPORT above.
  const importExport = IMPORT_EXPORT[moduleKey];
  const exportVisible = Boolean(importExport) && canEditModule(moduleKey)
    && !recordState.loading && !recordState.error;
  const importVisible = Boolean(importExport) && writeVisible;

  const downloadImportTemplate = () => {
    XLSX.writeFile(importExport.buildTemplateWorkbook(), importExport.templateFileName);
  };
  const exportRecords = () => {
    XLSX.writeFile(importExport.buildExportWorkbook(activeRecords), importExport.exportFileName(year));
  };
  const openImportPicker = () => importFileRef.current?.click();
  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImportState({ status: 'parsing' });
    let rows;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const parsed = importExport.parseImportFile(workbook);
      if (parsed.error) {
        setImportState({ status: 'error', error: parsed.error });
        return;
      }
      rows = parsed.rows;
    } catch {
      setImportState({ status: 'error', error: '無法讀取檔案，請確認是有效的 .xlsx 檔案。' });
      return;
    }

    setImportState({ status: 'uploading' });
    const ok = await actions.runMutation({
      pendingKey: 'import',
      validate: () => ({ valid: true, data: null, error: null }),
      mutate: async (actor) => {
        const results = [];
        for (let i = 0; i < rows.length; i += 1) {
          const row = rows[i];
          const validation = validateGenericRecord(moduleKey, row);
          if (!validation.valid) {
            results.push({ row: i + 2, ok: false, item: importExport.importItemLabel(row), error: validation.error });
            continue;
          }
          try {
            await recordState.create(validation.data, actor);
            results.push({ row: i + 2, ok: true, item: importExport.importItemLabel(validation.data) });
          } catch {
            results.push({ row: i + 2, ok: false, item: importExport.importItemLabel(validation.data), error: '新增失敗，請稍後再試。' });
          }
        }
        setImportState({ status: 'done', results });
      },
      successMessage: null,
    });
    if (!ok) {
      setImportState((current) => (current?.status === 'done' ? current : { status: 'error', error: actions.message }));
    }
  };

  const startAdd = () => actions.runControl(() => {
    setFormState({ mode: 'create', recordId: null, values: emptyRecordForm(schema.fields) });
  });
  const startEdit = (record) => actions.runControl(() => {
    setFormState({
      mode: 'update',
      recordId: record.id,
      values: recordToForm(record, schema.fields),
    });
  });
  const cancel = () => actions.runControl(() => setFormState(null));
  const commit = () => actions.runMutation({
    pendingKey: 'form',
    validate: () => validateGenericRecord(moduleKey, formState?.values || {}),
    mutate: (actor, payload) => {
      if (formState.mode === 'create') return recordState.create(payload, actor);
      const { recordType: _recordType, ...editableFields } = payload;
      return recordState.update(formState.recordId, editableFields, actor);
    },
    onSuccess: () => setFormState(null),
    successMessage: formState?.mode === 'create' ? '新增成功。' : '更新成功。',
  });
  const softDelete = (recordId) => actions.runMutation({
    pendingKey: `row:${recordId}`,
    validate: () => ({ valid: true, data: null, error: null }),
    mutate: (actor) => recordState.delete(recordId, actor),
    successMessage: '停用成功。',
  });
  const restore = (recordId) => actions.runMutation({
    pendingKey: `row:${recordId}`,
    validate: () => ({ valid: true, data: null, error: null }),
    mutate: (actor) => recordState.restore(recordId, actor),
    successMessage: '復原成功。',
  });
  const toggleDeleted = () => actions.runControl(() => {
    setFormState(null);
    setShowDeleted((current) => !current);
  });

  if (!canEditModule(moduleKey)) {
    return <NoModuleAccess title={meta.title} />;
  }
  if (recordState.error || yearState.error) {
    return <div><div style={pageTitle}>{meta.title}</div><div style={lockedBanner}>無法載入{meta.title}資料，請稍後再試。</div></div>;
  }
  if (recordState.loading || yearState.loading) {
    return <div><div style={pageTitle}>{meta.title}</div><div style={card}>正在載入{meta.title}資料…</div></div>;
  }

  const columns = `${schema.fields.map(() => '1fr').join(' ')}${writeVisible ? ' 92px' : ''}`;
  const tableMinWidth = schema.fields.length * 130 + (writeVisible ? 92 : 0);

  return (
    <div>
      <div style={pageTitle}>{meta.title}</div>
      <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 6 }}>{meta.desc}</div>
      <div style={pageSubtitle}>{year}年度</div>

      {!yearState.exists && <div style={lockedBanner}>找不到此年度設定，無法編輯或儲存。</div>}
      {yearState.exists && yearState.meta?.locked !== false && (
        <div style={lockedBanner}>此年度未開放編輯，無法編輯或儲存。</div>
      )}
      {deadlineState.configured && (
        <div style={(pastDeadline || deadlineInvalid) ? lockedBanner : deadlineBanner}>
          <span>填報截止日：{deadlineInvalid ? '設定無效' : yearState.meta.deadlines[moduleKey]}</span>
          <span>{deadlineInvalid ? `${meta.title}填報截止日格式錯誤，已停用編輯` : (pastDeadline ? '已超過填報期限' : '截止當日 23:59 前可儲存')}</span>
        </div>
      )}
      {actions.message && <div style={messageStyle(actions.message)}>{actions.message}</div>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {writeVisible && !formState && !includeDeleted && (
          <button type="button" disabled={actions.pending} style={btnOutline} onClick={startAdd}>＋ 新增一筆</button>
        )}
        {recoveryAllowed && (
          <button type="button" disabled={actions.pending} style={btnSecondary} onClick={toggleDeleted}>
            {includeDeleted ? '返回使用中資料' : '顯示已停用資料'}
          </button>
        )}
        {exportVisible && (
          <button type="button" disabled={actions.pending} style={btnOutline} onClick={exportRecords}>⬇ 匯出 Excel</button>
        )}
        {importVisible && (
          <>
            <button type="button" disabled={actions.pending} style={btnOutline} onClick={downloadImportTemplate}>⬇ 下載範本</button>
            <button
              type="button"
              disabled={actions.pending || importState?.status === 'parsing' || importState?.status === 'uploading'}
              style={{ ...btnOutline, opacity: importState?.status === 'parsing' || importState?.status === 'uploading' ? .6 : 1 }}
              onClick={openImportPicker}
            >
              {importState?.status === 'parsing' || importState?.status === 'uploading' ? '匯入中…' : '⬆ 匯入 Excel'}
            </button>
            <input ref={importFileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleImportFile} />
          </>
        )}
      </div>

      {importExport && importState?.status === 'error' && (
        <div style={{ maxWidth: 820, marginBottom: 14, color: '#B5533E', font: "600 12.5px 'Noto Sans TC', sans-serif" }}>{importState.error}</div>
      )}

      {importExport && importState?.status === 'done' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 820, marginBottom: 18 }} className="table-scroll">
          <div style={{ minWidth: 560 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 18px', background: '#F5F3EE',
            }}
            >
              <span style={{ font: "700 12.5px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>
                匯入結果：成功 {importState.results.filter((r) => r.ok).length} 筆／失敗 {importState.results.filter((r) => !r.ok).length} 筆
              </span>
              <span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#1F5F52', cursor: 'pointer' }} onClick={() => setImportState(null)}>關閉</span>
            </div>
            {importState.results.map((r) => (
              <div key={r.row} style={{ padding: '10px 18px', borderTop: '1px solid #EEEBE2', font: "500 12.5px 'Noto Sans TC', sans-serif" }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={badge(r.ok, '#2F8F5B', '#E9F5EE', '#B5533E', '#FBEAE6')}>{r.ok ? '成功' : '失敗'}</span>
                  <span>第 {r.row} 列</span>
                  <span style={{ color: '#454B45' }}>{r.item || '—'}</span>
                </div>
                {!r.ok && <div style={{ color: '#B5533E', marginTop: 4 }}>{r.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!includeDeleted && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 860 }} className="table-scroll">
          <div style={{ minWidth: tableMinWidth }}>
            <div style={tableHeadRow(columns)}>
              {schema.fields.map((field) => <span key={field.key}>{field.label}</span>)}
              {writeVisible && <span>操作</span>}
            </div>
            {activeRecords.length === 0 && (
              <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無資料</div>
            )}
            {activeRecords.map((record) => (
              <div key={record.id} style={{ ...tableRow(columns), alignItems: 'center' }}>
                {schema.fields.map((field) => <span key={field.key}>{record[field.key]}</span>)}
                {writeVisible && (
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button type="button" disabled={actions.pending} onClick={() => startEdit(record)}>編輯</button>
                    <button type="button" disabled={actions.pending} onClick={() => softDelete(record.id)}>{actions.isRowPending(record.id) ? `${softDeleteVerb(record)}中…` : softDeleteVerb(record)}</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {includeDeleted && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 860 }} className="table-scroll">
          <div style={{ minWidth: tableMinWidth }}>
            <div style={tableHeadRow(columns)}>
              {schema.fields.map((field) => <span key={field.key}>{field.label}</span>)}
              <span>操作</span>
            </div>
            {deletedRecords.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無已停用資料</div>}
            {deletedRecords.map((record) => (
              <div key={record.id} style={{ ...tableRow(columns), opacity: 0.72 }}>
                {schema.fields.map((field) => <span key={field.key}>{record[field.key]}</span>)}
                <button type="button" disabled={actions.pending} onClick={() => restore(record.id)}>{actions.isRowPending(record.id) ? '復原中…' : '復原'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {writeVisible && formState && !includeDeleted && (
        <div style={{ ...card, maxWidth: 760, marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
            {schema.fields.map((fieldSchema) => (
              <label key={fieldSchema.key} style={{ font: "600 11.5px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
                {fieldSchema.label}
                {fieldSchema.kind === 'select' ? (
                  <>
                    <select
                      aria-label={fieldSchema.label}
                      disabled={actions.pending}
                      style={{ ...input, marginTop: 5 }}
                      value={selectValue(fieldSchema, formState.values)}
                      onChange={(event) => {
                        const next = event.target.value;
                        setFormState((current) => ({
                          ...current,
                          values: {
                            ...current.values,
                            [fieldSchema.key]: next === CUSTOM_OPTION ? '' : next,
                            [customMarkerKey(fieldSchema)]: next === CUSTOM_OPTION ? '1' : '',
                          },
                        }));
                      }}
                    >
                      <option value="">請選擇</option>
                      {resolveOptions(fieldSchema, formState.values).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      {fieldSchema.allowCustom && <option value={CUSTOM_OPTION}>其他（自訂）</option>}
                    </select>
                    {isCustomSelected(fieldSchema, formState.values) && (
                      <input
                        aria-label={`${fieldSchema.label}（自訂）`}
                        type="text"
                        placeholder="請輸入自訂類別"
                        disabled={actions.pending}
                        style={{ ...input, marginTop: 6 }}
                        value={formState.values[fieldSchema.key]}
                        onChange={(event) => setFormState((current) => ({
                          ...current,
                          values: { ...current.values, [fieldSchema.key]: event.target.value },
                        }))}
                      />
                    )}
                  </>
                ) : (
                  <input
                    aria-label={fieldSchema.label}
                    type={inputType(fieldSchema.kind)}
                    min={fieldSchema.kind === 'number' || fieldSchema.kind === 'integer' ? 0 : undefined}
                    step={fieldSchema.kind === 'integer' ? 1 : undefined}
                    disabled={actions.pending}
                    style={{ ...input, marginTop: 5 }}
                    value={formState.values[fieldSchema.key]}
                    onChange={(event) => setFormState((current) => ({
                      ...current,
                      values: { ...current.values, [fieldSchema.key]: event.target.value },
                    }))}
                  />
                )}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" disabled={actions.pending} style={{ ...btnPrimary, border: 0 }} onClick={commit}>
              {formState.mode === 'create' ? '新增' : '儲存'}
            </button>
            <button type="button" disabled={actions.pending} style={btnSecondary} onClick={cancel}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
