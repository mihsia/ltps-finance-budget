import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useYearMeta, useYearModule, useYearRecords } from '../hooks/useYearData';
import { useFixedFieldEditor } from '../hooks/useFixedFieldEditor';
import { useAuth } from '../contexts/AuthContext';
import { functions } from '../firebase';
import { runAuthorized } from '../lib/accessPolicy';
import { deadlineExtraCheck, getDeadlineState } from '../lib/fixedFieldEditing';
import { validateBudgetRecord } from '../lib/recordSchemas';
import { fmtNum } from '../lib/format';
import { budgetRecordSummary } from '../lib/recordDerivations';
import { fileToBase64, validatePdfFile } from '../lib/pdfUpload';
import NoModuleAccess from '../components/NoModuleAccess';
import { pageTitle, pageSubtitle, card, btnOutline, btnPrimary, btnSecondary, input, label, lockedBanner, deadlineBanner, progressBar } from '../styles';

const checkBudgetbookDeadline = deadlineExtraCheck('budgetbook', '預算書表');
const checkBudgetDeadline = deadlineExtraCheck('budget', '歲入歲出');

const FIELDS = ['fundName', 'reviewAuthority', 'description'];

export default function BudgetBook({ year, hasCurrentYear = () => false }) {
  const budgetState = useYearRecords(year, 'budget');
  const moduleState = useYearModule(year, 'budgetbook');
  const yearState = useYearMeta(year);
  const { canEditModule, authorizeModule, authorizeModuleActor } = useAuth();
  const editor = useFixedFieldEditor({
    scopeKey: `${year}\0budgetbook`,
    data: moduleState.data,
    fields: FIELDS,
  });
  const [pdfPending, setPdfPending] = useState(false);
  const [pdfStatus, setPdfStatus] = useState(null);
  const [expenseEditId, setExpenseEditId] = useState(null);
  const [expenseAmountDraft, setExpenseAmountDraft] = useState('');
  const [expensePending, setExpensePending] = useState(false);
  const [expenseStatus, setExpenseStatus] = useState(null);

  const deadlineState = getDeadlineState(yearState.meta?.deadlines, 'budgetbook');
  const deadlineInvalid = deadlineState.invalid;
  const pastDeadline = deadlineState.deadline !== null
    && Date.now() > deadlineState.deadline.getTime();
  // 業務計畫別金額其實是歲入歲出模組的 expense 紀錄，直接在這裡編輯會立即
  // 反映在該模組，所以沿用歲入歲出自己的權限與填報期限，而不是預算書表的。
  const budgetDeadlineState = getDeadlineState(yearState.meta?.deadlines, 'budget');
  const budgetPastDeadline = budgetDeadlineState.deadline !== null
    && Date.now() > budgetDeadlineState.deadline.getTime();
  const canEditExpenseAmounts = canEditModule('budget')
    && yearState.exists
    && yearState.meta?.locked === false
    && !budgetPastDeadline
    && !budgetDeadlineState.invalid;

  const checkInvocation = () => {
    if (!hasCurrentYear()) return { allowed: false, reason: '目前選擇的年度已變更，請重新操作。' };
    const yearDecision = yearState.authorizeWrite();
    if (!yearDecision.allowed) return yearDecision;
    const moduleDecision = moduleState.authorizeWrite();
    if (!moduleDecision.allowed) return moduleDecision;
    return checkBudgetbookDeadline(yearDecision);
  };
  const applyGuardResult = (result) => {
    if (!result.executed) editor.setMessage(result.reason);
    else if (result.value?.allowed === false) editor.setMessage(result.value.reason);
  };
  const applyPdfGuardResult = (result) => {
    if (!result.executed) setPdfStatus(result.reason);
    else if (result.value?.allowed === false) setPdfStatus(result.value.reason);
  };

  const beginEditing = async () => {
    const result = await runAuthorized(() => authorizeModule('budgetbook'), async () => {
      const decision = checkInvocation();
      if (!decision.allowed) return decision;
      editor.beginEditing();
      return { allowed: true };
    });
    applyGuardResult(result);
  };
  const cancelEditing = async () => {
    const result = await runAuthorized(() => authorizeModule('budgetbook'), async () => {
      const decision = checkInvocation();
      if (!decision.allowed) return decision;
      editor.cancelEditing();
      return { allowed: true };
    });
    applyGuardResult(result);
  };
  const commit = async () => {
    const result = await runAuthorized(() => authorizeModuleActor('budgetbook'), async ({ actor }) => {
      const decision = checkInvocation();
      if (!decision.allowed) return decision;
      const payload = {
        fundName: editor.form.fundName.trim(),
        reviewAuthority: editor.form.reviewAuthority.trim(),
        description: editor.form.description.trim(),
      };
      if (!payload.fundName || !payload.reviewAuthority) {
        return { allowed: false, reason: '基金別與審議機關不得留白。' };
      }
      if (payload.fundName.length > 100 || payload.reviewAuthority.length > 100) {
        return { allowed: false, reason: '基金別與審議機關不得超過 100 個字。' };
      }
      if (payload.description.length > 2000) {
        return { allowed: false, reason: '預算書說明不得超過 2000 個字。' };
      }
      const token = editor.beginSave(payload);
      if (!token) return { allowed: true };
      try {
        await moduleState.save(payload, { actor, fields: FIELDS });
        editor.saveSucceeded(token);
      } catch {
        editor.saveFailed(token);
      }
      return { allowed: true };
    });
    applyGuardResult(result);
  };

  const uploadPdf = async (file) => {
    if (pdfPending) return;
    const result = await runAuthorized(() => authorizeModule('budgetbook'), async () => {
      const decision = checkInvocation();
      if (!decision.allowed) return decision;
      const validation = validatePdfFile(file);
      if (!validation.valid) return { allowed: false, reason: validation.error };

      const isReplace = Boolean(moduleState.data?.pdfUrl);
      setPdfStatus(null);
      setPdfPending(true);
      try {
        const base64 = await fileToBase64(file);
        const uploadBudgetBookPdf = httpsCallable(functions, 'uploadBudgetBookPdf');
        await uploadBudgetBookPdf({
          year, fileName: file.name, contentType: file.type, base64,
        });
        setPdfStatus(isReplace ? '已更換 PDF 全文。' : '已上傳 PDF 全文。');
      } catch (e) {
        setPdfStatus(e.message || '上傳失敗，請稍後再試。');
      } finally {
        setPdfPending(false);
      }
      return { allowed: true };
    });
    applyPdfGuardResult(result);
  };
  const handlePdfFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (file) uploadPdf(file);
  };

  const checkExpenseInvocation = () => {
    if (!hasCurrentYear()) return { allowed: false, reason: '目前選擇的年度已變更，請重新操作。' };
    const yearDecision = yearState.authorizeWrite();
    if (!yearDecision.allowed) return yearDecision;
    const budgetDecision = budgetState.authorizeWrite();
    if (!budgetDecision.allowed) return budgetDecision;
    return checkBudgetDeadline(yearDecision);
  };
  const startEditExpense = (row) => {
    setExpenseStatus(null);
    setExpenseEditId(row.id);
    setExpenseAmountDraft(String(row.amount));
  };
  const cancelEditExpense = () => setExpenseEditId(null);
  const saveExpenseAmount = async (row) => {
    const result = await runAuthorized(() => authorizeModuleActor('budget'), async ({ actor }) => {
      const decision = checkExpenseInvocation();
      if (!decision.allowed) return decision;
      const validation = validateBudgetRecord('expense', { ...row, amount: expenseAmountDraft });
      if (!validation.valid) return { allowed: false, reason: validation.error };
      const { recordType: _recordType, ...editableFields } = validation.data;
      setExpensePending(true);
      try {
        await budgetState.update(row.id, editableFields, actor);
        setExpenseEditId(null);
        setExpenseStatus('業務計畫別金額已更新。');
      } catch {
        setExpenseStatus('更新失敗，請稍後再試。');
      } finally {
        setExpensePending(false);
      }
      return { allowed: true };
    });
    if (!result.executed) setExpenseStatus(result.reason);
    else if (result.value?.allowed === false) setExpenseStatus(result.value.reason);
  };

  if (!canEditModule('budgetbook')) {
    return <NoModuleAccess title={`${year}年度預算書`} />;
  }
  if (moduleState.error || yearState.error) {
    return <div><div style={pageTitle}>{year}年度預算書</div><div style={lockedBanner}>無法載入預算書基本資料，請稍後再試。</div></div>;
  }
  if (moduleState.loading || yearState.loading) {
    return <div><div style={pageTitle}>{year}年度預算書</div><div style={card}>正在載入預算書基本資料…</div></div>;
  }

  const {
    expenseRows,
    revenueTotal,
    expenseTotal,
  } = budgetRecordSummary(budgetState.data);
  const budgetReady = !budgetState.loading && !budgetState.error;
  const shortfall = revenueTotal - expenseTotal;
  const canStartEditing = canEditModule('budgetbook')
    && yearState.exists
    && yearState.meta?.locked === false
    && !pastDeadline
    && !deadlineInvalid;

  return (
    <div>
      <div style={pageTitle}>{year}年度預算書</div>
      <div style={pageSubtitle}>依原始預算書內容摘要呈現，供議會對照全文 PDF</div>
      {!yearState.exists && <div style={lockedBanner}>找不到此年度設定，無法編輯或儲存。</div>}
      {yearState.exists && yearState.meta?.locked !== false && (
        <div style={lockedBanner}>此年度未開放編輯，無法編輯或儲存。</div>
      )}
      {deadlineState.configured && (
        <div style={(pastDeadline || deadlineInvalid) ? lockedBanner : deadlineBanner}>
          <span>填報截止日：{deadlineInvalid ? '設定無效' : yearState.meta.deadlines.budgetbook}</span>
          <span>{deadlineInvalid ? '預算書表填報截止日格式錯誤，已停用編輯' : (pastDeadline ? '已超過填報期限' : '截止當日 23:59 前可儲存')}</span>
        </div>
      )}
      {editor.message && <div style={{ color: editor.message === '儲存成功。' ? '#2F7D55' : '#B5533E', marginBottom: 14 }}>{editor.message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, maxWidth: 720, marginBottom: 20 }}>
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>收支平衡表</div>
          <div>基金來源合計（歲入） <b>{budgetReady ? fmtNum(revenueTotal) : '—'} 千元</b></div>
          <div>基金用途合計（歲出） <b>{budgetReady ? fmtNum(expenseTotal) : '—'} 千元</b></div>
          <div>本期{budgetReady && shortfall < 0 ? '短絀' : '賸餘'} <b>{budgetReady ? fmtNum(shortfall) : '—'}</b></div>
        </div>
        <div style={card}>
          {editor.editing ? (
            <>
              <label style={label}>基金別</label>
              <input disabled={editor.pending} value={editor.form.fundName} onChange={(event) => editor.updateField('fundName', event.target.value)} style={{ ...input, marginBottom: 12 }} />
              <label style={label}>審議機關</label>
              <input disabled={editor.pending} value={editor.form.reviewAuthority} onChange={(event) => editor.updateField('reviewAuthority', event.target.value)} style={{ ...input, marginBottom: 12 }} />
              <label style={label}>預算書說明（手動輸入，無 PDF 時可用來記錄重點內容）</label>
              <textarea
                aria-label="預算書說明"
                disabled={editor.pending}
                value={editor.form.description}
                onChange={(event) => editor.updateField('description', event.target.value)}
                rows={5}
                style={{ ...input, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button type="button" disabled={editor.pending} onClick={commit} style={{ ...btnPrimary, border: 0 }}>儲存</button>
                <button type="button" disabled={editor.pending} onClick={cancelEditing} style={btnSecondary}>取消</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700 }}>基金別</div>
              <div style={{ marginBottom: 10 }}>{editor.form.fundName || '尚未填寫'}</div>
              <div style={{ fontWeight: 700 }}>審議機關</div>
              <div style={{ marginBottom: 10 }}>{editor.form.reviewAuthority || '尚未填寫'}</div>
              <div style={{ fontWeight: 700 }}>預算書說明</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{editor.form.description || '尚未填寫'}</div>
              {canStartEditing && (
                <button type="button" onClick={beginEditing} style={{ ...btnPrimary, border: 0, marginTop: 14 }}>編輯基金資料</button>
              )}
            </>
          )}
        </div>
      </div>

      {budgetState.loading && <div style={{ ...card, maxWidth: 640, marginBottom: 20 }}>正在載入預算摘要…</div>}
      {budgetState.error && <div style={{ ...lockedBanner, maxWidth: 640 }}>無法載入預算摘要。</div>}
      {!budgetState.loading && !budgetState.error && (
        <div style={{ ...card, maxWidth: 640, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontWeight: 700 }}>業務計畫別預算金額</div>
            {canEditExpenseAmounts && (
              <div style={{ font: "400 11px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>金額與歲入歲出模組共用，異動會同步反映於該模組</div>
            )}
          </div>
          {expenseStatus && (
            <div style={{ marginBottom: 10, font: "500 12px 'Noto Sans TC', sans-serif", color: /已更新/.test(expenseStatus) ? '#2F7D55' : '#B5533E' }}>
              {expenseStatus}
            </div>
          )}
          {expenseRows.length === 0 && <div>尚無資料</div>}
          {expenseRows.map((row) => {
            const percentage = expenseTotal ? Math.round((Number(row.amount || 0) / expenseTotal) * 100) : 0;
            const { track, fill } = progressBar(percentage, '#1F5F52');
            const isEditingRow = expenseEditId === row.id;
            return (
              <div key={row.id} style={{ marginBottom: 10 }}>
                {isEditingRow ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ flex: 'none' }}>{row.label}</span>
                    <input
                      aria-label={`${row.label} 金額`}
                      type="number"
                      min={0}
                      disabled={expensePending}
                      value={expenseAmountDraft}
                      onChange={(event) => setExpenseAmountDraft(event.target.value)}
                      style={{ ...input, width: 110 }}
                    />
                    <button type="button" disabled={expensePending} onClick={() => saveExpenseAmount(row)} style={{ ...btnPrimary, border: 0, padding: '6px 12px' }}>
                      {expensePending ? '儲存中…' : '儲存'}
                    </button>
                    <button type="button" disabled={expensePending} onClick={cancelEditExpense} style={{ ...btnSecondary, padding: '6px 12px' }}>取消</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span>{row.label} {fmtNum(row.amount)} 千元</span>
                    {canEditExpenseAmounts && (
                      <button type="button" onClick={() => startEditExpense(row)} style={{ border: 0, background: 'transparent', color: '#1F5F52', cursor: 'pointer', font: "600 12px 'Noto Sans TC', sans-serif" }}>編輯</button>
                    )}
                  </div>
                )}
                <div style={track}><div style={fill} /></div>
              </div>
            );
          })}
        </div>
      )}

      {pdfStatus && (
        <div style={{ maxWidth: 640, marginBottom: 12, color: /^已(上傳|更換)/.test(pdfStatus) ? '#2F7D55' : '#B5533E' }}>{pdfStatus}</div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {moduleState.data?.pdfUrl ? (
          <a href={moduleState.data.pdfUrl} target="_blank" rel="noreferrer" style={btnOutline}>下載原始預算書 PDF 全文</a>
        ) : (
          <div style={{ ...btnOutline, opacity: 0.6, cursor: 'not-allowed' }} title="尚未上傳 PDF 全文">下載原始預算書 PDF 全文</div>
        )}
        {canStartEditing && (
          <label style={{ ...btnSecondary, opacity: pdfPending ? .6 : 1, cursor: pdfPending ? 'wait' : 'pointer' }}>
            {pdfPending ? '上傳中…' : (moduleState.data?.pdfUrl ? '更換 PDF 全文' : '上傳 PDF 全文')}
            <input
              type="file"
              accept="application/pdf"
              aria-label={moduleState.data?.pdfUrl ? '更換 PDF 全文' : '上傳 PDF 全文'}
              disabled={pdfPending}
              onChange={handlePdfFileChange}
              style={{ display: 'none' }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
