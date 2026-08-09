import { useEffect, useState } from 'react';
import { useYearMeta, useYearRecords } from '../hooks/useYearData';
import { useRecordCrudActions } from '../hooks/useRecordCrudActions';
import { useAuth } from '../contexts/AuthContext';
import {
  BUDGET_RECORD_SCHEMAS,
  emptyRecordForm,
  recordToForm,
  validateBudgetRecord,
} from '../lib/recordSchemas';
import { fmtNum } from '../lib/format';
import {
  pageTitle, pageSubtitle, card, btnPrimary, btnSecondary, btnOutline, input,
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

function expenseTotal(records) {
  return records
    .filter((record) => record.recordType === 'expense' && !record.deletedAt)
    .reduce((sum, record) => sum + record.amount, 0);
}

export default function Budget({
  year,
  years,
  latestYear,
  hasCurrentYear = () => false,
}) {
  const recentYears = years.length >= 3
    ? years.slice(-3)
    : [...Array(3 - years.length).fill(years[0]), ...years];
  const recentA = useYearRecords(recentYears[0], 'budget');
  const recentB = useYearRecords(recentYears[1], 'budget');
  const recentC = useYearRecords(recentYears[2], 'budget');
  const recentStates = [recentA, recentB, recentC];
  const yearState = useYearMeta(year);
  const { canEditModule, authorizeModule, authorizeModuleActor } = useAuth();
  const recoveryAllowed = canEditModule('budget')
    && year === latestYear
    && yearState.exists
    && yearState.meta?.locked === false;
  const [showDeleted, setShowDeleted] = useState(false);
  const includeDeleted = showDeleted && recoveryAllowed;
  const recordState = useYearRecords(year, 'budget', { includeDeleted });
  const [tab, setTab] = useState('expense');
  const [formState, setFormState] = useState(null);
  const actions = useRecordCrudActions({
    scopeKey: `${year}\0budget\0${includeDeleted ? 1 : 0}`,
    moduleKey: 'budget',
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
  const rows = activeRecords.filter((record) => record.recordType === tab);
  const deletedRecords = includeDeleted
    ? recordState.data.filter(
      (record) => record.deletedAt && ['expense', 'revenue'].includes(record.recordType),
    )
    : [];
  const total = rows.reduce((sum, record) => sum + record.amount, 0);
  const writeVisible = recoveryAllowed && !recordState.loading && !recordState.error;

  const startAdd = () => actions.runControl(() => {
    setFormState({
      mode: 'create',
      recordId: null,
      recordType: tab,
      values: emptyRecordForm(BUDGET_RECORD_SCHEMAS[tab].fields),
    });
  });
  const startEdit = (record) => actions.runControl(() => {
    setFormState({
      mode: 'update',
      recordId: record.id,
      recordType: record.recordType,
      values: recordToForm(record, BUDGET_RECORD_SCHEMAS[record.recordType].fields),
    });
  });
  const cancel = () => actions.runControl(() => setFormState(null));
  const commit = () => actions.runMutation({
    pendingKey: 'form',
    validate: () => validateBudgetRecord(formState?.recordType, formState?.values || {}),
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
  const switchTab = (nextTab) => {
    if (nextTab === tab) return;
    if (!formState) {
      setTab(nextTab);
      return;
    }
    actions.runControl(() => {
      setFormState(null);
      setTab(nextTab);
    });
  };

  if (recordState.error || yearState.error) {
    return <div><div style={pageTitle}>歲入歲出</div><div style={lockedBanner}>無法載入歲入歲出資料，請稍後再試。</div></div>;
  }
  if (recordState.loading || yearState.loading) {
    return <div><div style={pageTitle}>歲入歲出</div><div style={card}>正在載入歲入歲出資料…</div></div>;
  }

  const schema = BUDGET_RECORD_SCHEMAS[formState?.recordType || tab];

  return (
    <div>
      <div style={pageTitle}>歲入歲出（{recentYears[0]}–{recentYears[2]}年度）</div>
      <div style={pageSubtitle}>負責人：總務處 · 單位：千元 · 區分歲入／歲出 · 依{latestYear}年度預算書實際數</div>
      {!yearState.exists && <div style={lockedBanner}>找不到此年度設定，無法編輯或儲存。</div>}
      {yearState.exists && yearState.meta?.locked !== false && (
        <div style={lockedBanner}>此年度未開放編輯，無法編輯或儲存。</div>
      )}
      {!canEditModule('budget') && <div style={lockedBanner}>您沒有此模組的編輯權限。</div>}
      {actions.message && <div style={messageStyle(actions.message)}>{actions.message}</div>}

      <div style={{ display: 'flex', gap: 6, background: '#F5F3EE', borderRadius: 8, padding: 3, width: 'fit-content', marginBottom: 20 }}>
        {[['expense', '歲出（支出）'], ['revenue', '歲入（收入）']].map(([key, title]) => (
          <button
            type="button"
            key={key}
            disabled={actions.pending}
            onClick={() => switchTab(key)}
            style={{
              padding: '8px 16px', borderRadius: 6, cursor: 'pointer', border: 0,
              font: "700 12.5px 'Noto Sans TC', sans-serif",
              color: tab === key ? '#fff' : '#6B726A',
              background: tab === key ? '#1F5F52' : 'transparent',
            }}
          >{title}</button>
        ))}
      </div>

      {!includeDeleted && tab === 'expense' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 720, marginBottom: 20 }}>
          {[...recentYears].reverse().map((summaryYear, reversedIndex) => {
            const state = recentStates[recentYears.length - 1 - reversedIndex];
            const value = state.loading || state.error ? null : expenseTotal(state.data);
            return (
              <div key={`${summaryYear}-${reversedIndex}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', borderTop: '1px solid #EEEBE2' }}>
                <span>{summaryYear}年度歲出 · {summaryYear === latestYear ? '編輯中' : '已封存'}</span>
                <b>{value === null ? '—' : fmtNum(value)} 千元</b>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {writeVisible && !includeDeleted && !formState && (
          <button type="button" disabled={actions.pending} style={btnOutline} onClick={startAdd}>
            {tab === 'expense' ? '＋ 新增歲出' : '＋ 新增歲入'}
          </button>
        )}
        {recoveryAllowed && (
          <button type="button" disabled={actions.pending} style={btnSecondary} onClick={toggleDeleted}>
            {includeDeleted ? '返回使用中資料' : '顯示已停用資料'}
          </button>
        )}
      </div>

      {!includeDeleted && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 720 }}>
          <div style={tableHeadRow(tab === 'expense' ? '1.2fr 2fr 1fr 92px' : '2fr 1fr 92px')}>
            <span>{tab === 'expense' ? '項目名稱' : '來源項目'}</span>
            {tab === 'expense' && <span>內容說明</span>}
            <span>金額（千元）</span>
            {writeVisible && <span>操作</span>}
          </div>
          {rows.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無{tab === 'expense' ? '歲出' : '歲入'}資料</div>}
          {rows.map((record) => (
            <div key={record.id} style={{ ...tableRow(tab === 'expense' ? '1.2fr 2fr 1fr 92px' : '2fr 1fr 92px'), alignItems: 'center' }}>
              <span>{record.label}</span>
              {tab === 'expense' && <span>{record.formula}</span>}
              <b>{fmtNum(record.amount)}</b>
              {writeVisible && (
                <span style={{ display: 'flex', gap: 8 }}>
                  <button type="button" disabled={actions.pending} onClick={() => startEdit(record)}>編輯</button>
                  <button type="button" disabled={actions.isRowPending(record.id)} onClick={() => softDelete(record.id)}>停用</button>
                </span>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 18px', borderTop: '2px solid #1F5F52', color: '#1F5F52' }}>
            <b>{tab === 'expense' ? '歲出' : '歲入'}合計</b><b>{fmtNum(total)} 千元</b>
          </div>
        </div>
      )}

      {includeDeleted && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 720 }}>
          <div style={tableHeadRow('1fr 2fr 1fr 72px')}><span>類別</span><span>項目</span><span>金額</span><span>操作</span></div>
          {deletedRecords.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無已停用資料</div>}
          {deletedRecords.map((record) => (
            <div key={record.id} style={{ ...tableRow('1fr 2fr 1fr 72px'), opacity: 0.72 }}>
              <span>{record.recordType === 'expense' ? '歲出' : '歲入'}</span>
              <span>{record.label}</span>
              <span>{fmtNum(record.amount)}</span>
              <button type="button" disabled={actions.isRowPending(record.id)} onClick={() => restore(record.id)}>復原</button>
            </div>
          ))}
        </div>
      )}

      {writeVisible && formState && !includeDeleted && (
        <div style={{ ...card, maxWidth: 680, marginTop: 14 }}>
          <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
            {schema.fields.map((fieldSchema) => (
              <label key={fieldSchema.key}>
                {fieldSchema.inputLabel || fieldSchema.label}
                <input
                  aria-label={fieldSchema.inputLabel || fieldSchema.label}
                  type={fieldSchema.kind === 'number' ? 'number' : 'text'}
                  min={fieldSchema.kind === 'number' ? 0 : undefined}
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
            <button type="button" disabled={actions.formPending} style={{ ...btnPrimary, border: 0 }} onClick={commit}>{formState.mode === 'create' ? '新增' : '儲存'}</button>
            <button type="button" disabled={actions.pending} style={btnSecondary} onClick={cancel}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
