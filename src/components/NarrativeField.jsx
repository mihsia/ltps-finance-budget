import { useState } from 'react';
import { card, input, btnPrimary, btnSecondary, btnOutline } from '../styles';

/**
 * One editable paragraph of PDF narrative text (議會報表匯出 PDF's
 * 文字說明) — shows the currently effective text (an admin's saved override
 * when there is one, otherwise the system's auto-generated draft), and, for
 * an admin, an inline edit/save/restore-to-default flow. `onSave`/`onReset`
 * are async and resolve to { ok: true } or { ok: false, reason }, the same
 * shape runAuthorized() produces, so the caller can wrap a Firestore write
 * behind an admin check without this component knowing anything about auth.
 */
export default function NarrativeField({ label, color, defaultText, savedText, canEdit, onSave, onReset }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isCustom = Boolean(savedText);
  const effectiveText = isCustom ? savedText : defaultText;

  const beginEditing = () => {
    setDraft(effectiveText);
    setError(null);
    setEditing(true);
  };
  const cancelEditing = () => {
    setEditing(false);
    setError(null);
  };
  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await onSave(draft);
    setSaving(false);
    if (result.ok) setEditing(false);
    else setError(result.reason);
  };
  const resetToDefault = async () => {
    setSaving(true);
    setError(null);
    const result = await onReset();
    setSaving(false);
    if (result.ok) setEditing(false);
    else setError(result.reason);
  };

  return (
    <div style={{ ...card, borderLeft: `4px solid ${color}`, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ font: "700 13px 'Noto Sans TC', sans-serif" }}>{label}</div>
        <div style={{ font: "400 11px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>{isCustom ? '已自訂' : '系統自動產生'}</div>
      </div>
      {editing ? (
        <>
          <textarea
            aria-label={`${label} 文字說明`}
            disabled={saving}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            style={{ ...input, resize: 'vertical' }}
          />
          {error && <div style={{ color: '#B5533E', marginTop: 8, font: "400 12px 'Noto Sans TC', sans-serif" }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={saving} onClick={save} style={{ ...btnPrimary, border: 0 }}>儲存</button>
            <button type="button" disabled={saving} onClick={cancelEditing} style={btnSecondary}>取消</button>
            {isCustom && <button type="button" disabled={saving} onClick={resetToDefault} style={btnOutline}>還原為自動產生</button>}
          </div>
        </>
      ) : (
        <>
          <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#454B45', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {effectiveText || '（目前資料不足，尚無法產生文字說明）'}
          </div>
          {canEdit && (
            <button type="button" onClick={beginEditing} style={{ ...btnOutline, marginTop: 10 }}>編輯</button>
          )}
        </>
      )}
    </div>
  );
}
