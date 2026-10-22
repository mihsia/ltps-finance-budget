import { useYearMeta, useYearModule } from '../hooks/useYearData';
import { useFixedFieldEditor } from '../hooks/useFixedFieldEditor';
import { useAuth } from '../contexts/AuthContext';
import { runAuthorized } from '../lib/accessPolicy';
import { deadlineExtraCheck, getDeadlineState, validateFixedFields } from '../lib/fixedFieldEditing';
import NoModuleAccess from '../components/NoModuleAccess';
import { pageTitle, pageSubtitle, card, input, label, btnPrimary, btnSecondary, lockedBanner, deadlineBanner } from '../styles';

const COUNT_FIELDS = ['generalBooks', 'indigenousBooks', 'libraryBudget'];
// 規劃用途是自由文字（如何運用圖書經費），不是數量，獨立於上面的整數欄位
// 驗證之外，另外檢查長度即可。
const FIELDS = [...COUNT_FIELDS, 'libraryPlan'];
const FIELD_LABELS = {
  generalBooks: '一般書籍',
  indigenousBooks: '族語書籍',
  libraryBudget: '圖書經費（千元）',
  libraryPlan: '規劃用途',
};

export default function Library({ year, hasCurrentYear = () => false }) {
  const moduleState = useYearModule(year, 'library');
  const yearState = useYearMeta(year);
  const { canEditModule, authorizeModule, authorizeModuleActor } = useAuth();
  const editor = useFixedFieldEditor({
    scopeKey: `${year}\0library`,
    data: moduleState.data,
    fields: FIELDS,
  });

  const deadlineState = getDeadlineState(yearState.meta?.deadline);
  const deadlineInvalid = deadlineState.invalid;
  const pastDeadline = deadlineState.deadline !== null
    && Date.now() > deadlineState.deadline.getTime();

  const checkInvocation = () => {
    if (!hasCurrentYear()) return { allowed: false, reason: '目前選擇的年度已變更，請重新操作。' };
    const yearDecision = yearState.authorizeWrite();
    if (!yearDecision.allowed) return yearDecision;
    const moduleDecision = moduleState.authorizeWrite();
    if (!moduleDecision.allowed) return moduleDecision;
    return deadlineExtraCheck(yearDecision);
  };
  const applyGuardResult = (result) => {
    if (!result.executed) editor.setMessage(result.reason);
    else if (result.value?.allowed === false) editor.setMessage(result.value.reason);
  };

  const beginEditing = async () => {
    const result = await runAuthorized(() => authorizeModule('library'), async () => {
      const decision = checkInvocation();
      if (!decision.allowed) return decision;
      editor.beginEditing();
      return { allowed: true };
    });
    applyGuardResult(result);
  };
  const cancelEditing = async () => {
    const result = await runAuthorized(() => authorizeModule('library'), async () => {
      const decision = checkInvocation();
      if (!decision.allowed) return decision;
      editor.cancelEditing();
      return { allowed: true };
    });
    applyGuardResult(result);
  };
  const commit = async () => {
    const result = await runAuthorized(() => authorizeModuleActor('library'), async ({ actor }) => {
      const decision = checkInvocation();
      if (!decision.allowed) return decision;
      const validation = validateFixedFields(editor.form, COUNT_FIELDS);
      if (!validation.valid) {
        const names = validation.invalidFields.map((field) => FIELD_LABELS[field]).join('、');
        return { allowed: false, reason: `「${names}」必須是非負整數，或留白。` };
      }
      if (editor.form.libraryPlan.trim().length > 500) {
        return { allowed: false, reason: '「規劃用途」不得超過 500 個字。' };
      }
      const payload = { ...editor.form, libraryPlan: editor.form.libraryPlan.trim() };
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

  if (!canEditModule('library')) {
    return <NoModuleAccess title="圖書館藏書量" />;
  }
  if (moduleState.error || yearState.error) {
    return <div><div style={pageTitle}>圖書館藏書量</div><div style={lockedBanner}>無法載入圖書館藏書資料，請稍後再試。</div></div>;
  }
  if (moduleState.loading || yearState.loading) {
    return <div><div style={pageTitle}>圖書館藏書量</div><div style={card}>正在載入圖書館藏書資料…</div></div>;
  }

  const canStartEditing = canEditModule('library')
    && yearState.exists
    && yearState.meta?.locked === false
    && !pastDeadline
    && !deadlineInvalid;

  return (
    <div>
      <div style={pageTitle}>圖書館藏書量</div>
      <div style={pageSubtitle}>負責人：圖書館 · {year}年度</div>
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
      {editor.message && <div style={{ color: editor.message === '儲存成功。' ? '#2F7D55' : '#B5533E', marginBottom: 14 }}>{editor.message}</div>}

      {!editor.editing ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, maxWidth: 520 }}>
          <div style={card}>
            <div>一般書籍</div>
            <div style={{ font: '800 26px Inter, sans-serif' }}>{editor.form.generalBooks || 0} <small>本</small></div>
          </div>
          <div style={card}>
            <div>族語書籍</div>
            <div style={{ font: '800 26px Inter, sans-serif' }}>{editor.form.indigenousBooks || 0} <small>本</small></div>
          </div>
          <div style={card}>
            <div>圖書經費</div>
            <div style={{ font: '800 26px Inter, sans-serif' }}>{editor.form.libraryBudget || 0} <small>千元</small></div>
          </div>
          <div style={{ ...card, gridColumn: '1/-1' }}>
            <div>規劃用途</div>
            <div style={{ font: "400 14px 'Noto Sans TC', sans-serif", marginTop: 6, whiteSpace: 'pre-wrap' }}>{editor.form.libraryPlan || '尚未填寫'}</div>
          </div>
          {canStartEditing && (
            <button type="button" onClick={beginEditing} style={{ ...btnPrimary, border: 0, gridColumn: '1/-1', width: 'fit-content' }}>編輯數量</button>
          )}
        </div>
      ) : (
        <div style={{ ...card, maxWidth: 520, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18 }}>
          <div><label style={label}>一般書籍</label><input disabled={editor.pending} style={input} value={editor.form.generalBooks} onChange={(event) => editor.updateField('generalBooks', event.target.value)} /></div>
          <div><label style={label}>族語書籍</label><input disabled={editor.pending} style={input} value={editor.form.indigenousBooks} onChange={(event) => editor.updateField('indigenousBooks', event.target.value)} /></div>
          <div><label style={label}>圖書經費（千元）</label><input disabled={editor.pending} style={input} value={editor.form.libraryBudget} onChange={(event) => editor.updateField('libraryBudget', event.target.value)} /></div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={label}>規劃用途</label>
            <textarea
              aria-label="規劃用途"
              disabled={editor.pending}
              value={editor.form.libraryPlan}
              onChange={(event) => editor.updateField('libraryPlan', event.target.value)}
              rows={3}
              style={{ ...input, resize: 'vertical' }}
            />
          </div>
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={editor.pending} onClick={commit} style={{ ...btnPrimary, border: 0 }}>儲存</button>
            <button type="button" disabled={editor.pending} onClick={cancelEditing} style={btnSecondary}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
