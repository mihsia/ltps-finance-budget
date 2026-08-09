import { useYearModule, useYearMeta, useAuditLog } from '../hooks/useYearData';
import { useFixedFieldEditor } from '../hooks/useFixedFieldEditor';
import { useAuth } from '../contexts/AuthContext';
import { runAuthorized } from '../lib/accessPolicy';
import { parseLocalDeadlineEndOfDay, validateFixedFields } from '../lib/fixedFieldEditing';
import { fmtDate } from '../lib/format';
import {
  pageTitle, pageSubtitle, sectionLabel, card, input, label,
  btnPrimary, btnSecondary, deadlineBanner, lockedBanner,
} from '../styles';

const COUNT_FIELDS = [
  'classes',
  'students',
  'staff',
  'regularTeachers',
  'substitute',
  'partTimeTeachers',
];
const AUDIT_FIELDS = [...COUNT_FIELDS, 'status'];
const FIELD_LABELS = {
  classes: '班級數',
  students: '學生人數',
  staff: '教師員額（編制內）',
  regularTeachers: '正式教師人數',
  substitute: '代理教師人數',
  partTimeTeachers: '兼任／支援教師人數',
};

function messageStyle(message) {
  return {
    maxWidth: 640,
    marginBottom: 14,
    color: message === '儲存成功。' ? '#2F7D55' : '#B5533E',
    font: "600 12.5px 'Noto Sans TC', sans-serif",
  };
}

export default function Basic({ year, hasCurrentYear = () => false }) {
  const moduleState = useYearModule(year, 'basic');
  const yearState = useYearMeta(year);
  const auditState = useAuditLog(year, { moduleKey: 'basic', max: 20 });
  const { canEditModule, authorizeModule, authorizeModuleActor } = useAuth();
  const editor = useFixedFieldEditor({
    scopeKey: `${year}\0basic`,
    data: moduleState.data,
    fields: AUDIT_FIELDS,
  });

  const deadline = yearState.meta?.deadlines?.basic;
  const parsedDeadline = parseLocalDeadlineEndOfDay(deadline);
  const deadlineInvalid = Boolean(deadline) && !parsedDeadline;
  const pastDeadline = Boolean(parsedDeadline && Date.now() > parsedDeadline.getTime());
  const writeVisible = canEditModule('basic')
    && yearState.exists
    && yearState.meta?.locked === false
    && !moduleState.loading
    && !moduleState.error
    && !pastDeadline
    && !deadlineInvalid;

  const checkInvocation = () => {
    if (!hasCurrentYear()) {
      return { allowed: false, reason: '目前選擇的年度已變更，請重新操作。' };
    }
    const yearDecision = yearState.authorizeWrite();
    if (!yearDecision.allowed) return yearDecision;
    const moduleDecision = moduleState.authorizeWrite();
    if (!moduleDecision.allowed) return moduleDecision;

    const currentDeadline = yearDecision.meta?.deadlines?.basic;
    if (!currentDeadline) return { allowed: true };
    const parsed = parseLocalDeadlineEndOfDay(currentDeadline);
    if (!parsed) {
      return { allowed: false, reason: '基本資料填報截止日格式錯誤，無法編輯。' };
    }
    if (Date.now() > parsed.getTime()) {
      return { allowed: false, reason: '已超過基本資料填報截止日，無法編輯或儲存。' };
    }
    return { allowed: true };
  };

  const applyGuardResult = (result) => {
    if (!result.executed) {
      editor.setMessage(result.reason);
      return false;
    }
    if (result.value?.allowed === false) {
      editor.setMessage(result.value.reason);
      return false;
    }
    return true;
  };

  const beginEditing = async () => {
    const result = await runAuthorized(() => authorizeModule('basic'), async () => {
      const decision = checkInvocation();
      if (!decision.allowed) return decision;
      editor.beginEditing();
      return { allowed: true };
    });
    applyGuardResult(result);
  };

  const cancelEditing = async () => {
    const result = await runAuthorized(() => authorizeModule('basic'), async () => {
      const decision = checkInvocation();
      if (!decision.allowed) return decision;
      editor.cancelEditing();
      return { allowed: true };
    });
    applyGuardResult(result);
  };

  const commit = async (status) => {
    const result = await runAuthorized(() => authorizeModuleActor('basic'), async ({ actor }) => {
      const decision = checkInvocation();
      if (!decision.allowed) return decision;
      const validation = validateFixedFields(editor.form, COUNT_FIELDS);
      if (!validation.valid) {
        return { allowed: false, reason: '所有人數與班級數都必須是非負整數。' };
      }
      const payload = { ...editor.form, status };
      const token = editor.beginSave(payload);
      if (!token) return { allowed: true };
      try {
        await moduleState.save(payload, { actor, fields: AUDIT_FIELDS });
        editor.saveSucceeded(token);
      } catch {
        editor.saveFailed(token);
      }
      return { allowed: true };
    });
    applyGuardResult(result);
  };

  if (moduleState.error || yearState.error) {
    return <div><div style={pageTitle}>學校基本資料</div><div style={lockedBanner}>無法載入學校基本資料，請稍後再試。</div></div>;
  }
  if (moduleState.loading || yearState.loading) {
    return <div><div style={pageTitle}>學校基本資料</div><div style={card}>正在載入學校基本資料…</div></div>;
  }

  const teacherTotal = Number(editor.form.regularTeachers || 0)
    + Number(editor.form.substitute || 0)
    + Number(editor.form.partTimeTeachers || 0);
  const substituteRatio = teacherTotal
    ? Math.round((Number(editor.form.substitute || 0) / teacherTotal) * 100)
    : 0;
  const studentTeacherRatio = teacherTotal
    ? (Number(editor.form.students || 0) / teacherTotal).toFixed(1)
    : '0.0';

  return (
    <div>
      <div style={pageTitle}>學校基本資料</div>
      <div style={pageSubtitle}>負責人：教務處 · {year}年度</div>

      {!yearState.exists && <div style={lockedBanner}>找不到此年度設定，無法編輯或儲存。</div>}
      {yearState.exists && yearState.meta?.locked !== false && (
        <div style={lockedBanner}>此年度未開放編輯，無法編輯或儲存。</div>
      )}
      {!canEditModule('basic') && <div style={lockedBanner}>您沒有此模組的編輯權限。</div>}
      {deadline && (
        <div style={(pastDeadline || deadlineInvalid) ? lockedBanner : deadlineBanner}>
          <span>填報截止日：{deadline}</span>
          <span>{deadlineInvalid ? '截止日格式錯誤，已停用編輯' : (pastDeadline ? '已超過填報期限' : '截止當日 23:59 前可儲存')}</span>
        </div>
      )}
      {editor.message && <div style={messageStyle(editor.message)}>{editor.message}</div>}

      <div style={sectionLabel}>班級、學生與教師概況</div>
      <div style={{ ...card, maxWidth: 640, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 16 }}>
        {COUNT_FIELDS.map((field) => (
          <div key={field}>
            <label style={label}>{FIELD_LABELS[field]}</label>
            {editor.editing ? (
              <input
                disabled={editor.pending}
                value={editor.form[field]}
                onChange={(event) => editor.updateField(field, event.target.value)}
                style={input}
              />
            ) : (
              <div style={{ font: '700 18px Inter, sans-serif', color: '#1E2420' }}>{editor.form[field] || '—'}</div>
            )}
          </div>
        ))}
        <div style={{ gridColumn: '1/3', display: 'flex', gap: 20, padding: '12px 14px', background: '#F5F3EE', borderRadius: 8 }}>
          <div>教師總數 <b>{teacherTotal}</b></div>
          <div>代理教師占比 <b>{substituteRatio}%</b></div>
          <div>生師比 <b>{studentTeacherRatio} : 1</b></div>
        </div>
        {writeVisible && !editor.editing && (
          <div style={{ gridColumn: '1/3' }}>
            <button type="button" onClick={beginEditing} style={{ ...btnPrimary, border: 0 }}>編輯資料</button>
          </div>
        )}
        {editor.editing && (
          <div style={{ gridColumn: '1/3', display: 'flex', gap: 10 }}>
            <button type="button" disabled={editor.pending} onClick={() => commit('draft')} style={{ ...btnPrimary, border: 0 }}>儲存草稿</button>
            <button type="button" disabled={editor.pending} onClick={() => commit('submitted')} style={{ ...btnPrimary, border: 0 }}>儲存並送出審核</button>
            <button type="button" disabled={editor.pending} onClick={cancelEditing} style={btnSecondary}>取消</button>
          </div>
        )}
      </div>

      <div style={sectionLabel}>資料異動稽核紀錄</div>
      <div style={{ ...card, padding: 0, maxWidth: 640 }}>
        {auditState.loading && <div style={{ padding: '11px 18px' }}>正在載入稽核紀錄…</div>}
        {auditState.error && <div style={{ padding: '11px 18px', color: '#B5533E' }}>無法載入稽核紀錄，請稍後再試。</div>}
        {!auditState.loading && !auditState.error && auditState.entries.length === 0 && (
          <div style={{ padding: '11px 18px', color: '#8A9089' }}>尚無稽核紀錄</div>
        )}
        {!auditState.loading && !auditState.error && auditState.entries.map((entry) => (
          <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 18px', borderTop: '1px solid #EEEBE2' }}>
            <span><b>{entry.actorName || '未知使用者'}</b> {entry.action === 'create' ? '新增' : '更新'}基本資料</span>
            <span style={{ color: '#8A9089' }}>{fmtDate(entry.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
