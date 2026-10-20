import { useEffect, useState } from 'react';
import { useYearMeta, useYearRecords } from '../hooks/useYearData';
import { useRecordCrudActions } from '../hooks/useRecordCrudActions';
import { useAuth } from '../contexts/AuthContext';
import {
  LANGUAGE_CERT_LEVELS,
  LANGUAGE_OPTIONS,
  LANGUAGE_RECORD_SCHEMAS,
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
  certification: '認證統計',
  roster: '名冊',
};

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
  const certificationRows = activeRecords.filter(
    (record) => record.recordType === 'certification',
  );
  const rosterRows = activeRecords.filter((record) => record.recordType === 'roster');
  const deletedRecords = includeDeleted
    ? recordState.data.filter(
      (record) => record.deletedAt && Object.hasOwn(TYPE_LABELS, record.recordType),
    )
    : [];
  const writeVisible = recoveryAllowed && !recordState.loading && !recordState.error;

  const certifiedTeachers = certificationRows.reduce(
    (sum, record) => sum + record.certifiedTeachers,
    0,
  );
  const totalTeachers = certificationRows.reduce(
    (sum, record) => sum + record.totalTeachers,
    0,
  );
  const tested = certificationRows.reduce((sum, record) => sum + record.tested, 0);
  const passed = certificationRows.reduce((sum, record) => sum + record.passed, 0);
  const passRate = tested ? ((passed / tested) * 100).toFixed(1) : '0.0';

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
      <div style={pageSubtitle}>負責人：教務處 · {year}年度 · 師資與學生族語能力認證統計、通過名冊</div>
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
            <button type="button" disabled={actions.pending} style={btnOutline} onClick={() => startAdd('certification')}>＋ 新增認證統計</button>
            <button type="button" disabled={actions.pending} style={btnOutline} onClick={() => startAdd('roster')}>＋ 新增名冊</button>
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
          <div style={{ fontWeight: 700, marginBottom: 10 }}>師資族語能力認證與學生通過情形</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, maxWidth: 720, marginBottom: 18 }}>
            <div style={{ background: '#F5F3EE', borderRadius: 10, padding: 16 }}>授課教師取得認證比例<br /><b>{certifiedTeachers} / {totalTeachers} 人（{totalTeachers ? Math.round((certifiedTeachers / totalTeachers) * 100) : 0}%）</b></div>
            <div style={{ background: '#F5F3EE', borderRadius: 10, padding: 16 }}>學生族語認證通過人數<br /><b>{passed} 人</b></div>
            <div style={{ background: '#F5F3EE', borderRadius: 10, padding: 16 }}>學生認證通過率<br /><b>{passRate}%</b></div>
          </div>
          <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 720, marginBottom: 24 }}>
            <div style={tableHeadRow(writeVisible ? '1.3fr 1fr 1fr 1fr 160px' : '1.3fr 1fr 1fr 1fr')}><span>語系</span><span>授課教師認證</span><span>應考人數</span><span>通過人數</span>{writeVisible && <span>操作</span>}</div>
            {certificationRows.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無認證統計</div>}
            {certificationRows.map((record) => (
              <div key={record.id} style={{ ...tableRow(writeVisible ? '1.3fr 1fr 1fr 1fr 160px' : '1.3fr 1fr 1fr 1fr'), alignItems: 'center' }}>
                <span>{record.lang}</span><span>{record.certifiedTeachers} / {record.totalTeachers}</span><span>{record.tested}</span><span>{record.passed}</span>
                {writeVisible && <span><button type="button" disabled={actions.pending} onClick={() => startEdit(record)}>編輯認證統計</button> <button type="button" disabled={actions.pending} onClick={() => softDelete(record.id)}>{actions.isRowPending(record.id) ? '停用認證統計中…' : '停用認證統計'}</button></span>}
              </div>
            ))}
          </div>

          <div style={{ fontWeight: 700, marginBottom: 10 }}>學生族語認證通過名冊登錄</div>
          <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 720 }}>
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
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 720 }}>
          <div style={tableHeadRow('1fr 2fr 72px')}><span>類別</span><span>資料</span><span>操作</span></div>
          {deletedRecords.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無已停用資料</div>}
          {deletedRecords.map((record) => (
            <div key={record.id} style={{ ...tableRow('1fr 2fr 72px'), opacity: 0.72 }}>
              <span>{TYPE_LABELS[record.recordType]}</span>
              <span>{record.lang} · {record.name || `${record.certifiedTeachers} / ${record.totalTeachers}`}</span>
              <button type="button" disabled={actions.pending} onClick={() => restore(record.id)}>{actions.isRowPending(record.id) ? '復原中…' : '復原'}</button>
            </div>
          ))}
        </div>
      )}

      {writeVisible && formState && !includeDeleted && (
        <div style={{ ...card, maxWidth: 720, marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>{formState.mode === 'create' ? '新增' : '編輯'}{TYPE_LABELS[formState.recordType]}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
            {formSchema.fields.map((fieldSchema) => (
              <label key={fieldSchema.key}>
                {fieldSchema.label}
                {fieldSchema.key === 'lang' || fieldSchema.key === 'level' ? (
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
                    {(fieldSchema.key === 'lang' ? LANGUAGE_OPTIONS : LANGUAGE_CERT_LEVELS).map((option) => (
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
