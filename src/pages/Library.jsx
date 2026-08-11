import { useYearMeta, useYearModule } from '../hooks/useYearData';
import { useFixedFieldEditor } from '../hooks/useFixedFieldEditor';
import { useAuth } from '../contexts/AuthContext';
import { runAuthorized } from '../lib/accessPolicy';
import { validateFixedFields } from '../lib/fixedFieldEditing';
import { pageTitle, pageSubtitle, card, input, label, btnPrimary, btnSecondary, lockedBanner } from '../styles';

const FIELDS = ['generalBooks', 'indigenousBooks'];

export default function Library({ year, hasCurrentYear = () => false }) {
  const moduleState = useYearModule(year, 'library');
  const yearState = useYearMeta(year);
  const { canEditModule, authorizeModule, authorizeModuleActor } = useAuth();
  const editor = useFixedFieldEditor({
    scopeKey: `${year}\0library`,
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
      if (!validateFixedFields(editor.form, FIELDS).valid) {
        return { allowed: false, reason: '所有藏書數量都必須是非負整數。' };
      }
      const payload = { ...editor.form };
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
    return <div><div style={pageTitle}>圖書館藏書量</div><div style={lockedBanner}>無法載入圖書館藏書資料，請稍後再試。</div></div>;
  }
  if (moduleState.loading || yearState.loading) {
    return <div><div style={pageTitle}>圖書館藏書量</div><div style={card}>正在載入圖書館藏書資料…</div></div>;
  }

  const canStartEditing = canEditModule('library')
    && yearState.exists
    && yearState.meta?.locked === false;

  return (
    <div>
      <div style={pageTitle}>圖書館藏書量</div>
      <div style={pageSubtitle}>負責人：圖書館 · {year}年度</div>
      {!yearState.exists && <div style={lockedBanner}>找不到此年度設定，無法編輯或儲存。</div>}
      {yearState.exists && yearState.meta?.locked !== false && (
        <div style={lockedBanner}>此年度未開放編輯，無法編輯或儲存。</div>
      )}
      {!canEditModule('library') && <div style={lockedBanner}>您沒有此模組的編輯權限。</div>}
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
          {canStartEditing && (
            <button type="button" onClick={beginEditing} style={{ ...btnPrimary, border: 0, gridColumn: '1/-1', width: 'fit-content' }}>編輯數量</button>
          )}
        </div>
      ) : (
        <div style={{ ...card, maxWidth: 520, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18 }}>
          <div><label style={label}>一般書籍</label><input disabled={editor.pending} style={input} value={editor.form.generalBooks} onChange={(event) => editor.updateField('generalBooks', event.target.value)} /></div>
          <div><label style={label}>族語書籍</label><input disabled={editor.pending} style={input} value={editor.form.indigenousBooks} onChange={(event) => editor.updateField('indigenousBooks', event.target.value)} /></div>
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={editor.pending} onClick={commit} style={{ ...btnPrimary, border: 0 }}>儲存</button>
            <button type="button" disabled={editor.pending} onClick={cancelEditing} style={btnSecondary}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
