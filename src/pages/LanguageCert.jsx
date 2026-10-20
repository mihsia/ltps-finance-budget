import { useEffect, useState } from 'react';
import { useYearMeta, useYearRecords } from '../hooks/useYearData';
import { useRecordCrudActions } from '../hooks/useRecordCrudActions';
import { useAuth } from '../contexts/AuthContext';
import {
  LANGUAGE_CERT_LEVELS,
  LANGUAGE_OPTIONS,
  LANGUAGE_RECORD_SCHEMAS,
  TEACHER_CERTIFIED_OPTIONS,
  emptyRecordForm,
  recordToForm,
  validateLanguageRecord,
} from '../lib/recordSchemas';
import { deadlineExtraCheck, getDeadlineState } from '../lib/fixedFieldEditing';
import NoModuleAccess from '../components/NoModuleAccess';
import {
  pageTitle, pageSubtitle, card, input, btnPrimary, btnOutline, btnSecondary,
  tableHeadRow, tableRow, lockedBanner, deadlineBanner,
} from '../styles';

const TYPE_LABELS = {
  teacher: '師資名冊',
  roster: '學生通過名冊',
};

// 語系／級別／是否已通過認證 are all dropdowns; everything else is free text.
const SELECT_FIELD_OPTIONS = {
  lang: LANGUAGE_OPTIONS,
  level: LANGUAGE_CERT_LEVELS,
  certified: TEACHER_CERTIFIED_OPTIONS,
};

function messageStyle(message) {
  return {
    maxWidth: 720,
    marginBottom: 14,
    color: /成功/.test(message) ? '#2F7D55' : '#B5533E',
    font: "600 12.5px 'Noto Sans TC', sans-serif",
  };
}

export default function LanguageCert({
  year,
  latestYear,
  hasCurrentYear = () => false,
}) {
  const yearState = useYearMeta(year);
  const { canEditModule, authorizeModuleActor } = useAuth();
  const deadlineState = getDeadlineState(yearState.meta?.deadlines, 'languageCert');
  const deadlineInvalid = deadlineState.invalid;
  const pastDeadline = deadlineState.deadline !== null
    && Date.now() > deadlineState.deadline.getTime();
  const recoveryAllowed = canEditModule('languageCert')
    && year === latestYear
    && yearState.exists
    && yearState.meta?.locked === false
    && !pastDeadline
    && !deadlineInvalid;
  const [showDeleted, setShowDeleted] = useState(false);
  const includeDeleted = showDeleted && recoveryAllowed;
  const recordState = useYearRecords(year, 'languageCert', { includeDeleted });
  const [formState, setFormState] = useState(null);
  const actions = useRecordCrudActions({
    scopeKey: `${year}\0${latestYear}\0languageCert\0${includeDeleted ? 1 : 0}`,
    moduleKey: 'languageCert',
    hasCurrentYear,
    yearState,
    recordState,
    authorizeModuleActor,
    extraCheck: deadlineExtraCheck('languageCert', '族語認證'),
  });

  useEffect(() => {
    setFormState(null);
    if (!recoveryAllowed) setShowDeleted(false);
  }, [recoveryAllowed, year]);

  const activeRecords = recordState.data.filter((record) => !record.deletedAt);
  const teacherRows = activeRecords.filter((record) => record.recordType === 'teacher');
  const rosterRows = activeRecords.filter((record) => record.recordType === 'roster');
  const deletedRecords = includeDeleted
    ? recordState.data.filter(
      (record) => record.deletedAt && Object.hasOwn(TYPE_LABELS, record.recordType),
    )
    : [];
  const writeVisible = recoveryAllowed && !recordState.loading && !recordState.error;

  // Both figures are counted straight from the roster rows below, not typed
  // in separately — there is only ever one place to edit "who", so the
  // ratio/total here can never drift out of sync with the actual list.
  const totalTeachers = teacherRows.length;
  const certifiedTeachers = teacherRows.filter((record) => record.certified === '是').length;
  const passedStudents = rosterRows.length;

  const startAdd = (recordType) => actions.runControl(() => {
    setFormState({
      mode: 'create',
      recordId: null,
      recordType,
      values: emptyRecordForm(LANGUAGE_RECORD_SCHEMAS[recordType].fields),
    });
  });
  const startEdit = (record) => actions.runControl(() => {
    setFormState({
      mode: 'update',
      recordId: record.id,
      recordType: record.recordType,
      values: recordToForm(record, LANGUAGE_RECORD_SCHEMAS[record.recordType].fields),
    });
  });
  const cancel = () => actions.runControl(() => setFormState(null));
  const commit = () => actions.runMutation({
    pendingKey: 'form',
    validate: () => validateLanguageRecord(formState?.recordType, formState?.values || {}),
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

  if (!canEditModule('languageCert')) {
    return <NoModuleAccess title="族語認證" />;
  }
  if (recordState.error || yearState.error) {
    return <div><div style={pageTitle}>族語認證</div><div style={lockedBanner}>無法載入族語認證資料，請稍後再試。</div></div>;
  }
  if (recordState.loading || yearState.loading) {
    return <div><div style={pageTitle}>族語認證</div><div style={card}>正在載入族語認證資料…</div></div>;
  }

  const formSchema = formState ? LANGUAGE_RECORD_SCHEMAS[formState.recordType] : null;

  return (
    <div>
      <div style={pageTitle}>族語認證</div>
      <div style={pageSubtitle}>負責人：教務處 · {year}年度 · 族語師資名冊與學生認證通過名冊</div>
      {!yearState.exists && <div style={lockedBanner}>找不到此年度設定，無法編輯或儲存。</div>}
      {yearState.exists && yearState.meta?.locked !== false && (
        <div style={lockedBanner}>此年度未開放編輯，無法編輯或儲存。</div>
      )}
      {deadlineState.configured && (
        <div style={(pastDeadline || deadlineInvalid) ? lockedBanner : deadlineBanner}>
          <span>填報截止日：{deadlineInvalid ? '設定無效' : yearState.meta.deadlines.languageCert}</span>
          <span>{deadlineInvalid ? '族語認證填報截止日格式錯誤，已停用編輯' : (pastDeadline ? '已超過填報期限' : '截止當日 23:59 前可儲存')}</span>
        </div>
      )}
      {actions.message && <div style={messageStyle(actions.message)}>{actions.message}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {writeVisible && !formState && !includeDeleted && (
          <>
            <button type="button" disabled={actions.pending} style={btnOutline} onClick={() => startAdd('teacher')}>＋ 新增師資名冊</button>
            <button type="button" disabled={actions.pending} style={btnOutline} onClick={() => startAdd('roster')}>＋ 新增學生通過名冊</button>
          </>
        )}
        {recoveryAllowed && (
          <button type="button" disabled={actions.pending} style={btnSecondary} onClick={toggleDeleted}>
            {includeDeleted ? '返回使用中資料' : '顯示已停用資料'}
          </button>
        )}
      </div>

      {!includeDeleted && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, maxWidth: 520, marginBottom: 18 }}>
            <div style={{ background: '#F5F3EE', borderRadius: 10, padding: 16 }}>授課教師取得認證比例<br /><b>{certifiedTeachers} / {totalTeachers} 人（{totalTeachers ? Math.round((certifiedTeachers / totalTeachers) * 100) : 0}%）</b></div>
            <div style={{ background: '#F5F3EE', borderRadius: 10, padding: 16 }}>學生族語認證通過人數<br /><b>{passedStudents} 人</b></div>
          </div>

          <div style={{ fontWeight: 700, marginBottom: 10 }}>族語師資名冊</div>
          <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 620, marginBottom: 24 }}>
            <div style={tableHeadRow(writeVisible ? '1.3fr 1.3fr 1fr 160px' : '1.3fr 1.3fr 1fr')}><span>語系</span><span>教師姓名</span><span>是否已通過認證</span>{writeVisible && <span>操作</span>}</div>
            {teacherRows.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無師資名冊資料</div>}
            {teacherRows.map((record) => (
              <div key={record.id} style={{ ...tableRow(writeVisible ? '1.3fr 1.3fr 1fr 160px' : '1.3fr 1.3fr 1fr'), alignItems: 'center' }}>
                <span>{record.lang}</span><span>{record.name}</span><span>{record.certified}</span>
                {writeVisible && <span><button type="button" disabled={actions.pending} onClick={() => startEdit(record)}>編輯師資名冊</button> <button type="button" disabled={actions.pending} onClick={() => softDelete(record.id)}>{actions.isRowPending(record.id) ? '停用師資名冊中…' : '停用師資名冊'}</button></span>}
              </div>
            ))}
          </div>

          <div style={{ fontWeight: 700, marginBottom: 10 }}>學生族語認證通過名冊</div>
          <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 620 }}>
            <div style={tableHeadRow(writeVisible ? '1.2fr 1fr 1fr 140px' : '1.2fr 1fr 1fr')}><span>語系</span><span>級別</span><span>學生姓名</span>{writeVisible && <span>操作</span>}</div>
            {rosterRows.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無名冊資料</div>}
            {rosterRows.map((record) => (
              <div key={record.id} style={{ ...tableRow(writeVisible ? '1.2fr 1fr 1fr 140px' : '1.2fr 1fr 1fr'), alignItems: 'center' }}>
                <span>{record.lang}</span><span>{record.level}</span><span>{record.name}</span>
                {writeVisible && <span><button type="button" disabled={actions.pending} onClick={() => startEdit(record)}>編輯名冊</button> <button type="button" disabled={actions.pending} onClick={() => softDelete(record.id)}>{actions.isRowPending(record.id) ? '停用名冊中…' : '停用名冊'}</button></span>}
              </div>
            ))}
          </div>
        </>
      )}

      {includeDeleted && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 620 }}>
          <div style={tableHeadRow('1fr 2fr 72px')}><span>類別</span><span>資料</span><span>操作</span></div>
          {deletedRecords.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無已停用資料</div>}
          {deletedRecords.map((record) => (
            <div key={record.id} style={{ ...tableRow('1fr 2fr 72px'), opacity: 0.72 }}>
              <span>{TYPE_LABELS[record.recordType]}</span>
              <span>{record.lang} · {record.name}</span>
              <button type="button" disabled={actions.pending} onClick={() => restore(record.id)}>{actions.isRowPending(record.id) ? '復原中…' : '復原'}</button>
            </div>
          ))}
        </div>
      )}

      {writeVisible && formState && !includeDeleted && (
        <div style={{ ...card, maxWidth: 620, marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>{formState.mode === 'create' ? '新增' : '編輯'}{TYPE_LABELS[formState.recordType]}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
            {formSchema.fields.map((fieldSchema) => (
              <label key={fieldSchema.key}>
                {fieldSchema.label}
                {SELECT_FIELD_OPTIONS[fieldSchema.key] ? (
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
                    {SELECT_FIELD_OPTIONS[fieldSchema.key].map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label={fieldSchema.label}
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
