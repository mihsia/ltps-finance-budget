import { useEffect, useState } from 'react';
import { useYearMeta, useYearRecords } from '../hooks/useYearData';
import { useRecordCrudActions } from '../hooks/useRecordCrudActions';
import { useAuth } from '../contexts/AuthContext';
import {
  LANGUAGE_RECORD_SCHEMAS,
  emptyRecordForm,
  recordToForm,
  validateLanguageRecord,
} from '../lib/recordSchemas';
import {
  pageTitle, pageSubtitle, card, input, btnPrimary, btnOutline, btnSecondary,
  tableHeadRow, tableRow, lockedBanner,
} from '../styles';

const TYPE_LABELS = {
  class: '開班資料',
  certification: '認證統計',
  roster: '名冊',
};
const LANG_OPTIONS = ['閩南語', '客語', '賽考利克泰雅語', '太魯閣語'];
const LEVEL_OPTIONS = ['A級（初級）', 'B級（中級）', 'C級（高級）'];

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
  const { canEditModule, authorizeModule, authorizeModuleActor } = useAuth();
  const recoveryAllowed = canEditModule('language')
    && year === latestYear
    && yearState.exists
    && yearState.meta?.locked === false;
  const [showDeleted, setShowDeleted] = useState(false);
  const includeDeleted = showDeleted && recoveryAllowed;
  const recordState = useYearRecords(year, 'language', { includeDeleted });
  const [formState, setFormState] = useState(null);
  const actions = useRecordCrudActions({
    scopeKey: `${year}\0language\0${includeDeleted ? 1 : 0}`,
    moduleKey: 'language',
    hasCurrentYear,
    yearState,
    recordState,
    authorizeModule,
    authorizeModuleActor,
  });

  useEffect(() => {
    setFormState(null);
    if (!recoveryAllowed) setShowDeleted(false);
  }, [recoveryAllowed, year]);

  const activeRecords = recordState.data.filter((record) => !record.deletedAt);
  const classRows = activeRecords.filter((record) => record.recordType === 'class');
  const certificationRows = activeRecords.filter(
    (record) => record.recordType === 'certification',
  );
  const rosterRows = activeRecords.filter((record) => record.recordType === 'roster');
  const deletedRecords = includeDeleted
    ? recordState.data.filter(
      (record) => record.deletedAt && Object.hasOwn(LANGUAGE_RECORD_SCHEMAS, record.recordType),
    )
    : [];
  const writeVisible = recoveryAllowed && !recordState.loading && !recordState.error;

  const classesTotal = classRows.reduce((sum, record) => sum + record.classes, 0);
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
    return <div><div style={pageTitle}>本土語／原住民語開班</div><div style={lockedBanner}>無法載入族語開班資料，請稍後再試。</div></div>;
  }
  if (recordState.loading || yearState.loading) {
    return <div><div style={pageTitle}>本土語／原住民語開班</div><div style={card}>正在載入族語開班資料…</div></div>;
  }

  const formSchema = formState ? LANGUAGE_RECORD_SCHEMAS[formState.recordType] : null;

  return (
    <div>
      <div style={pageTitle}>本土語／原住民語開班</div>
      <div style={pageSubtitle}>負責人：教務處 · {year}年度 · 開班語系及班級數總和 {classesTotal}</div>
      {!yearState.exists && <div style={lockedBanner}>找不到此年度設定，無法編輯或儲存。</div>}
      {yearState.exists && yearState.meta?.locked !== false && (
        <div style={lockedBanner}>此年度未開放編輯，無法編輯或儲存。</div>
      )}
      {!canEditModule('language') && <div style={lockedBanner}>您沒有此模組的編輯權限。</div>}
      {actions.message && <div style={messageStyle(actions.message)}>{actions.message}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {writeVisible && !formState && !includeDeleted && (
          <>
            <button type="button" disabled={actions.pending} style={btnOutline} onClick={() => startAdd('class')}>＋ 新增開班資料</button>
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
          <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 720, marginBottom: 20 }}>
            <div style={tableHeadRow(writeVisible ? '2fr 1fr 1fr 150px' : '2fr 1fr 1fr')}><span>語系</span><span>班級數</span><span>人數</span>{writeVisible && <span>操作</span>}</div>
            {classRows.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無開班資料</div>}
            {classRows.map((record) => (
              <div key={record.id} style={{ ...tableRow(writeVisible ? '2fr 1fr 1fr 150px' : '2fr 1fr 1fr'), alignItems: 'center' }}>
                <span>{record.lang}</span><span>{record.classes}</span><span>{record.students}</span>
                {writeVisible && <span><button type="button" disabled={actions.pending} onClick={() => startEdit(record)}>編輯開班資料</button> <button type="button" disabled={actions.isRowPending(record.id)} onClick={() => softDelete(record.id)}>停用開班資料</button></span>}
              </div>
            ))}
          </div>

          <div style={{ fontWeight: 700, marginBottom: 10 }}>師資族語能力認證與學生通過情形</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, maxWidth: 720, marginBottom: 18 }}>
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
                {writeVisible && <span><button type="button" disabled={actions.pending} onClick={() => startEdit(record)}>編輯認證統計</button> <button type="button" disabled={actions.isRowPending(record.id)} onClick={() => softDelete(record.id)}>停用認證統計</button></span>}
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
                {writeVisible && <span><button type="button" disabled={actions.pending} onClick={() => startEdit(record)}>編輯名冊</button> <button type="button" disabled={actions.isRowPending(record.id)} onClick={() => softDelete(record.id)}>停用名冊</button></span>}
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
              <span>{record.lang} · {record.name || `${record.classes ?? record.certifiedTeachers} / ${record.students ?? record.totalTeachers}`}</span>
              <button type="button" disabled={actions.isRowPending(record.id)} onClick={() => restore(record.id)}>復原</button>
            </div>
          ))}
        </div>
      )}

      {writeVisible && formState && !includeDeleted && (
        <div style={{ ...card, maxWidth: 720, marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>{formState.mode === 'create' ? '新增' : '編輯'}{TYPE_LABELS[formState.recordType]}</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(formSchema.fields.length, 3)}, minmax(0, 1fr))`, gap: 12, marginBottom: 14 }}>
            {formSchema.fields.map((fieldSchema) => (
              <label key={fieldSchema.key}>
                {fieldSchema.label}
                {fieldSchema.key === 'lang' || fieldSchema.key === 'level' ? (
                  <select
                    aria-label={fieldSchema.label}
                    disabled={actions.formPending}
                    style={{ ...input, marginTop: 5 }}
                    value={formState.values[fieldSchema.key]}
                    onChange={(event) => setFormState((current) => ({
                      ...current,
                      values: { ...current.values, [fieldSchema.key]: event.target.value },
                    }))}
                  >
                    <option value="">請選擇</option>
                    {(fieldSchema.key === 'lang' ? LANG_OPTIONS : LEVEL_OPTIONS).map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label={fieldSchema.label}
                    type={numericInput(fieldSchema) ? 'number' : 'text'}
                    min={numericInput(fieldSchema) ? 0 : undefined}
                    step={numericInput(fieldSchema) ? 1 : undefined}
                    disabled={actions.formPending}
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
            <button type="button" disabled={actions.formPending} style={{ ...btnPrimary, border: 0 }} onClick={commit}>{formState.mode === 'create' ? '新增' : '儲存'}</button>
            <button type="button" disabled={actions.pending} style={btnSecondary} onClick={cancel}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
