import { useEffect, useState } from 'react';
import { useYearMeta, useYearRecords } from '../hooks/useYearData';
import { useRecordCrudActions } from '../hooks/useRecordCrudActions';
import { useAuth } from '../contexts/AuthContext';
import {
  LANGUAGE_OPTIONS,
  LANGUAGE_RECORD_SCHEMAS,
  emptyRecordForm,
  recordToForm,
  validateLanguageRecord,
} from '../lib/recordSchemas';
import { deadlineExtraCheck, getDeadlineState } from '../lib/fixedFieldEditing';
import { softDeleteVerb } from '../lib/recordLifecycle';
import NoModuleAccess from '../components/NoModuleAccess';
import {
  pageTitle, pageSubtitle, card, input, btnPrimary, btnOutline, btnSecondary,
  tableHeadRow, tableRow, lockedBanner, deadlineBanner,
} from '../styles';

const CLASS_SCHEMA = LANGUAGE_RECORD_SCHEMAS.class;

function messageStyle(message) {
  return {
    maxWidth: 720,
    marginBottom: 14,
    color: /成功/.test(message) ? '#2F7D55' : '#B5533E',
    font: "600 12.5px 'Noto Sans TC', sans-serif",
  };
}

function numericInput(field) {
  return field.kind === 'integer';
}

export default function Language({
  year,
  latestYear,
  hasCurrentYear = () => false,
}) {
  const yearState = useYearMeta(year);
  const { canEditModule, authorizeModuleActor } = useAuth();
  const deadlineState = getDeadlineState(yearState.meta?.deadline);
  const deadlineInvalid = deadlineState.invalid;
  const pastDeadline = deadlineState.deadline !== null
    && Date.now() > deadlineState.deadline.getTime();
  const recoveryAllowed = canEditModule('language')
    && year === latestYear
    && yearState.exists
    && yearState.meta?.locked === false
    && !pastDeadline
    && !deadlineInvalid;
  const [showDeleted, setShowDeleted] = useState(false);
  const includeDeleted = showDeleted && recoveryAllowed;
  const recordState = useYearRecords(year, 'language', { includeDeleted });
  const [formState, setFormState] = useState(null);
  const actions = useRecordCrudActions({
    scopeKey: `${year}\0${latestYear}\0language\0${includeDeleted ? 1 : 0}`,
    moduleKey: 'language',
    hasCurrentYear,
    yearState,
    recordState,
    authorizeModuleActor,
    extraCheck: deadlineExtraCheck,
  });

  useEffect(() => {
    setFormState(null);
    if (!recoveryAllowed) setShowDeleted(false);
  }, [recoveryAllowed, year]);

  const activeRecords = recordState.data.filter((record) => !record.deletedAt);
  const classRows = activeRecords.filter((record) => record.recordType === 'class');
  const deletedRecords = includeDeleted
    ? recordState.data.filter((record) => record.deletedAt && record.recordType === 'class')
    : [];
  const writeVisible = recoveryAllowed && !recordState.loading && !recordState.error;

  const classesTotal = classRows.reduce((sum, record) => sum + record.classes, 0);

  const startAdd = () => actions.runControl(() => {
    setFormState({
      mode: 'create',
      recordId: null,
      values: emptyRecordForm(CLASS_SCHEMA.fields),
    });
  });
  const startEdit = (record) => actions.runControl(() => {
    setFormState({
      mode: 'update',
      recordId: record.id,
      values: recordToForm(record, CLASS_SCHEMA.fields),
    });
  });
  const cancel = () => actions.runControl(() => setFormState(null));
  const commit = () => actions.runMutation({
    pendingKey: 'form',
    validate: () => validateLanguageRecord('class', formState?.values || {}),
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

  if (!canEditModule('language')) {
    return <NoModuleAccess title="族語開班" />;
  }
  if (recordState.error || yearState.error) {
    return <div><div style={pageTitle}>族語開班</div><div style={lockedBanner}>無法載入族語開班資料，請稍後再試。</div></div>;
  }
  if (recordState.loading || yearState.loading) {
    return <div><div style={pageTitle}>族語開班</div><div style={card}>正在載入族語開班資料…</div></div>;
  }

  return (
    <div>
      <div style={pageTitle}>族語開班</div>
      <div style={pageSubtitle}>負責人：教務處 · {year}年度 · 本土語言（閩南語、客語）及原住民族語開班 · 開班語系及班級數總和 {classesTotal}</div>
      {!yearState.exists && <div style={lockedBanner}>找不到此年度設定，無法編輯或儲存。</div>}
      {yearState.exists && yearState.meta?.locked !== false && (
        <div style={lockedBanner}>此年度未開放編輯，無法編輯或儲存。</div>
      )}
      {deadlineState.configured && (
        <div style={(pastDeadline || deadlineInvalid) ? lockedBanner : deadlineBanner}>
          <span>填報截止日：{deadlineInvalid ? '設定無效' : yearState.meta.deadline}</span>
          <span>{deadlineInvalid ? '填報截止日格式錯誤，已停用編輯' : (pastDeadline ? '已超過填報期限' : '截止當日 23:59 前可儲存')}</span>
        </div>
      )}
      {actions.message && <div style={messageStyle(actions.message)}>{actions.message}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {writeVisible && !formState && !includeDeleted && (
          <button type="button" disabled={actions.pending} style={btnOutline} onClick={startAdd}>＋ 新增開班資料</button>
        )}
        {recoveryAllowed && (
          <button type="button" disabled={actions.pending} style={btnSecondary} onClick={toggleDeleted}>
            {includeDeleted ? '返回使用中資料' : '顯示已停用資料'}
          </button>
        )}
      </div>

      {!includeDeleted && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 720 }}>
          <div style={tableHeadRow(writeVisible ? '2fr 1fr 1fr 150px' : '2fr 1fr 1fr')}><span>語系</span><span>班級數</span><span>人數</span>{writeVisible && <span>操作</span>}</div>
          {classRows.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無開班資料</div>}
          {classRows.map((record) => (
            <div key={record.id} style={{ ...tableRow(writeVisible ? '2fr 1fr 1fr 150px' : '2fr 1fr 1fr'), alignItems: 'center' }}>
              <span>{record.lang}</span><span>{record.classes}</span><span>{record.students}</span>
              {writeVisible && <span><button type="button" disabled={actions.pending} onClick={() => startEdit(record)}>編輯開班資料</button> <button type="button" disabled={actions.pending} onClick={() => softDelete(record.id)}>{actions.isRowPending(record.id) ? `${softDeleteVerb(record)}開班資料中…` : `${softDeleteVerb(record)}開班資料`}</button></span>}
            </div>
          ))}
        </div>
      )}

      {includeDeleted && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 720 }}>
          <div style={tableHeadRow('2fr 1fr 1fr 72px')}><span>語系</span><span>班級數</span><span>人數</span><span>操作</span></div>
          {deletedRecords.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無已停用資料</div>}
          {deletedRecords.map((record) => (
            <div key={record.id} style={{ ...tableRow('2fr 1fr 1fr 72px'), opacity: 0.72 }}>
              <span>{record.lang}</span><span>{record.classes}</span><span>{record.students}</span>
              <button type="button" disabled={actions.pending} onClick={() => restore(record.id)}>{actions.isRowPending(record.id) ? '復原中…' : '復原'}</button>
            </div>
          ))}
        </div>
      )}

      {writeVisible && formState && !includeDeleted && (
        <div style={{ ...card, maxWidth: 520, marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>{formState.mode === 'create' ? '新增' : '編輯'}開班資料</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
            {CLASS_SCHEMA.fields.map((fieldSchema) => (
              <label key={fieldSchema.key}>
                {fieldSchema.label}
                {fieldSchema.key === 'lang' ? (
                  <select
                    aria-label={fieldSchema.label}
                    disabled={actions.pending}
                    style={{ ...input, marginTop: 5 }}
                    value={formState.values[fieldSchema.key]}
                    onChange={(event) => setFormState((current) => ({
                      ...current,
                      values: { ...current.values, [fieldSchema.key]: event.target.value },
                    }))}
                  >
                    <option value="">請選擇</option>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label={fieldSchema.label}
                    type={numericInput(fieldSchema) ? 'number' : 'text'}
                    min={numericInput(fieldSchema) ? 0 : undefined}
                    step={numericInput(fieldSchema) ? 1 : undefined}
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
            <button type="button" disabled={actions.pending} style={{ ...btnPrimary, border: 0 }} onClick={commit}>{formState.mode === 'create' ? '新增' : '儲存'}</button>
            <button type="button" disabled={actions.pending} style={btnSecondary} onClick={cancel}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
