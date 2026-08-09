import { useYearMeta, useYearModule, useYearRecords } from '../hooks/useYearData';
import { useFixedFieldEditor } from '../hooks/useFixedFieldEditor';
import { useAuth } from '../contexts/AuthContext';
import { runAuthorized } from '../lib/accessPolicy';
import { fmtNum } from '../lib/format';
import { budgetRecordSummary } from '../lib/recordDerivations';
import { pageTitle, pageSubtitle, card, btnOutline, btnPrimary, btnSecondary, input, label, lockedBanner, progressBar } from '../styles';

const FIELDS = ['fundName', 'reviewAuthority'];

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

  const checkInvocation = () => {
    if (!hasCurrentYear()) return { allowed: false, reason: '目前選擇的年度已變更，請重新操作。' };
    const yearDecision = yearState.authorizeWrite();
    if (!yearDecision.allowed) return yearDecision;
    return moduleState.authorizeWrite();
  };
  const applyGuardResult = (result) => {
    if (!result.executed) editor.setMessage(result.reason);
    else if (result.value?.allowed === false) editor.setMessage(result.value.reason);
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
      };
      if (!payload.fundName || !payload.reviewAuthority) {
        return { allowed: false, reason: '基金別與審議機關不得留白。' };
      }
      if (payload.fundName.length > 100 || payload.reviewAuthority.length > 100) {
        return { allowed: false, reason: '基金別與審議機關不得超過 100 個字。' };
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
    && yearState.meta?.locked === false;

  return (
    <div>
      <div style={pageTitle}>{year}年度預算書</div>
      <div style={pageSubtitle}>依原始預算書內容摘要呈現，供議會對照全文 PDF</div>
      {!yearState.exists && <div style={lockedBanner}>找不到此年度設定，無法編輯或儲存。</div>}
      {yearState.exists && yearState.meta?.locked !== false && (
        <div style={lockedBanner}>此年度未開放編輯，無法編輯或儲存。</div>
      )}
      {!canEditModule('budgetbook') && <div style={lockedBanner}>您沒有此模組的編輯權限。</div>}
      {editor.message && <div style={{ color: editor.message === '儲存成功。' ? '#2F7D55' : '#B5533E', marginBottom: 14 }}>{editor.message}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 720, marginBottom: 20 }}>
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
              <input disabled={editor.pending} value={editor.form.reviewAuthority} onChange={(event) => editor.updateField('reviewAuthority', event.target.value)} style={input} />
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
              <div>{editor.form.reviewAuthority || '尚未填寫'}</div>
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
          {expenseRows.length === 0 && <div>尚無資料</div>}
          {expenseRows.map((row) => {
            const percentage = expenseTotal ? Math.round((Number(row.amount || 0) / expenseTotal) * 100) : 0;
            const { track, fill } = progressBar(percentage, '#1F5F52');
            return <div key={row.label}><span>{row.label} {fmtNum(row.amount)} 千元</span><div style={track}><div style={fill} /></div></div>;
          })}
        </div>
      )}

      {moduleState.data?.pdfUrl ? (
        <a href={moduleState.data.pdfUrl} target="_blank" rel="noreferrer" style={btnOutline}>下載原始預算書 PDF 全文</a>
      ) : (
        <div style={{ ...btnOutline, opacity: 0.6, cursor: 'not-allowed' }} title="尚未上傳 PDF 全文">下載原始預算書 PDF 全文</div>
      )}
    </div>
  );
}
