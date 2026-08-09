import { useEffect, useState } from 'react';
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
import {
  pageTitle, pageSubtitle, card, input, btnPrimary, btnOutline, btnSecondary,
  tableHeadRow, tableRow, lockedBanner,
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
  if (kind === 'integer' || kind === 'number') return 'number';
  return 'text';
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
  const { canEditModule, authorizeModule, authorizeModuleActor } = useAuth();
  const recoveryAllowed = canEditModule(moduleKey)
    && year === latestYear
    && yearState.exists
    && yearState.meta?.locked === false;
  const [showDeleted, setShowDeleted] = useState(false);
  const includeDeleted = showDeleted && recoveryAllowed;
  const recordState = useYearRecords(year, moduleKey, { includeDeleted });
  const [formState, setFormState] = useState(null);
  const actions = useRecordCrudActions({
    scopeKey: `${year}\0${moduleKey}\0${includeDeleted ? 1 : 0}`,
    moduleKey,
    hasCurrentYear,
    yearState,
    recordState,
    authorizeModule,
    authorizeModuleActor,
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
    mutate: (actor, payload) => formState.mode === 'create'
      ? recordState.create(payload, actor)
      : recordState.update(formState.recordId, payload, actor),
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

  if (recordState.error || yearState.error) {
    return <div><div style={pageTitle}>{meta.title}</div><div style={lockedBanner}>無法載入{meta.title}資料，請稍後再試。</div></div>;
  }
  if (recordState.loading || yearState.loading) {
    return <div><div style={pageTitle}>{meta.title}</div><div style={card}>正在載入{meta.title}資料…</div></div>;
  }

  const columns = `${schema.fields.map(() => '1fr').join(' ')}${writeVisible ? ' 92px' : ''}`;

  return (
    <div>
      <div style={pageTitle}>{meta.title}</div>
      <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 6 }}>{meta.desc}</div>
      <div style={pageSubtitle}>{year}年度</div>

      {!yearState.exists && <div style={lockedBanner}>找不到此年度設定，無法編輯或儲存。</div>}
      {yearState.exists && yearState.meta?.locked !== false && (
        <div style={lockedBanner}>此年度未開放編輯，無法編輯或儲存。</div>
      )}
      {!canEditModule(moduleKey) && <div style={lockedBanner}>您沒有此模組的編輯權限。</div>}
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
      </div>

      {!includeDeleted && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 860 }}>
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
                  <button type="button" disabled={actions.isRowPending(record.id)} onClick={() => softDelete(record.id)}>停用</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {includeDeleted && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 860 }}>
          <div style={tableHeadRow(columns)}>
            {schema.fields.map((field) => <span key={field.key}>{field.label}</span>)}
            <span>操作</span>
          </div>
          {deletedRecords.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無已停用資料</div>}
          {deletedRecords.map((record) => (
            <div key={record.id} style={{ ...tableRow(columns), opacity: 0.72 }}>
              {schema.fields.map((field) => <span key={field.key}>{record[field.key]}</span>)}
              <button type="button" disabled={actions.isRowPending(record.id)} onClick={() => restore(record.id)}>復原</button>
            </div>
          ))}
        </div>
      )}

      {writeVisible && formState && !includeDeleted && (
        <div style={{ ...card, maxWidth: 760, marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${schema.fields.length}, minmax(0, 1fr))`, gap: 12, marginBottom: 14 }}>
            {schema.fields.map((fieldSchema) => (
              <label key={fieldSchema.key} style={{ font: "600 11.5px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
                {fieldSchema.label}
                <input
                  aria-label={fieldSchema.label}
                  type={inputType(fieldSchema.kind)}
                  min={fieldSchema.kind === 'number' || fieldSchema.kind === 'integer' ? 0 : undefined}
                  step={fieldSchema.kind === 'integer' ? 1 : undefined}
                  disabled={actions.formPending}
                  style={{ ...input, marginTop: 5 }}
                  value={formState.values[fieldSchema.key]}
                  onChange={(event) => setFormState((current) => ({
                    ...current,
                    values: { ...current.values, [fieldSchema.key]: event.target.value },
                  }))}
                />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" disabled={actions.formPending} style={{ ...btnPrimary, border: 0 }} onClick={commit}>
              {formState.mode === 'create' ? '新增' : '儲存'}
            </button>
            <button type="button" disabled={actions.pending} style={btnSecondary} onClick={cancel}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
