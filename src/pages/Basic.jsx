import { useEffect, useState } from 'react';
import { useYearModule, useYearMeta, useChangeLog } from '../hooks/useYearData';
import { useAuth } from '../contexts/AuthContext';
import { fmtDate } from '../lib/format';
import {
  pageTitle, pageSubtitle, sectionLabel, card, input, label,
  btnPrimary, btnSecondary, deadlineBanner, lockedBanner, emptyState,
} from '../styles';

const FIELD_LABELS = {
  classes: '班級數', students: '學生人數', staff: '教師員額',
  regularTeachers: '正式教師人數', substitute: '代理教師人數', partTimeTeachers: '兼任／支援教師人數',
};

export default function Basic({ year, latestYear }) {
  const { data, loading, save, copyFrom } = useYearModule(year, 'basic');
  const { meta } = useYearMeta(year);
  const { entries, appendChange } = useChangeLog(year, { moduleKey: 'basic' });
  const { profile, user, canEditModule } = useAuth();
  const isEditableYear = year === latestYear;
  const canEdit = canEditModule('basic');

  const [form, setForm] = useState(null);
  useEffect(() => {
    if (data) setForm(data);
    else if (!loading) setForm({ classes: '', students: '', staff: '', regularTeachers: '', substitute: '', partTimeTeachers: '' });
  }, [data, loading]);

  if (!form) return null;

  const deadline = meta?.deadlines?.basic;
  const daysLeft = deadline ? Math.ceil((new Date(deadline) - new Date()) / 86400000) : null;
  const pastDeadline = daysLeft != null && daysLeft < 0;
  const locked = !isEditableYear || pastDeadline || !canEdit;

  const hasStudentsError = form.students !== '' && !/^\d+$/.test(String(form.students).trim());
  const teacherTotal = Number(form.regularTeachers || 0) + Number(form.substitute || 0) + Number(form.partTimeTeachers || 0);
  const substituteRatio = teacherTotal ? Math.round((Number(form.substitute || 0) / teacherTotal) * 100) : 0;
  const studentTeacherRatio = teacherTotal ? (Number(form.students || 0) / teacherTotal).toFixed(1) : '0.0';

  const update = (field, val) => setForm((s) => ({ ...s, [field]: val }));

  const commit = async (status) => {
    if (hasStudentsError) return;
    const who = profile?.name || user?.email || '未知使用者';
    const changed = Object.keys(FIELD_LABELS).filter((f) => String(data?.[f] ?? '') !== String(form[f] ?? ''));
    await save({ ...form, status });
    for (const f of changed) {
      await appendChange('basic', who, FIELD_LABELS[f], data?.[f] ?? '（空白）', form[f]);
    }
  };

  if (!isEditableYear && !data) {
    return (
      <div>
        <div style={pageTitle}>學校基本資料</div>
        <div style={pageSubtitle}>負責人：教務處 · {year}年度</div>
        <div style={emptyState}>
          <div style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 6 }}>{year}年度尚未建立此模組資料</div>
          <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 16 }}>可從 {latestYear} 年度複製資料後再修改，或手動新增</div>
          <div style={btnPrimary} onClick={() => copyFrom(latestYear)}>從 {latestYear} 年度複製資料</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={pageTitle}>學校基本資料</div>
      <div style={pageSubtitle}>負責人：教務處 · {year}年度</div>

      {deadline && (
        <div style={pastDeadline ? lockedBanner : deadlineBanner}>
          <span>{pastDeadline ? '🔒 已鎖定' : '⏱'} 填報截止日：{deadline}</span>
          <span style={{ opacity: .85 }}>
            {pastDeadline ? '已逾期，欄位鎖定，如需修改請由管理者開放' : `距截止尚有 ${daysLeft} 天，逾期將自動鎖定該欄位`}
          </span>
        </div>
      )}

      <div style={sectionLabel}>班級與學生概況</div>
      <div style={{ ...card, maxWidth: 640, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 24 }}>
        <div>
          <label style={label}>班級數</label>
          <input disabled={locked} value={form.classes} onChange={(e) => update('classes', e.target.value)} style={input} />
        </div>
        <div>
          <label style={label}>學生人數</label>
          <input
            disabled={locked}
            value={form.students}
            onChange={(e) => update('students', e.target.value)}
            style={{ ...input, border: `1px solid ${hasStudentsError ? '#B5533E' : '#D8D3C4'}` }}
          />
          {hasStudentsError && (
            <div style={{ font: "500 11.5px 'Noto Sans TC', sans-serif", color: '#B5533E', marginTop: 5 }}>
              ⚠ 學生人數需為正整數，請確認填寫格式
            </div>
          )}
        </div>
        {!locked && (
          <div style={{ gridColumn: '1/3', display: 'flex', gap: 10, marginTop: 6 }}>
            <div style={btnPrimary} onClick={() => commit('draft')}>儲存</div>
            <div style={btnSecondary} onClick={() => commit('submitted')}>儲存並送出審核</div>
          </div>
        )}
      </div>

      <div style={sectionLabel}>教師人力概況</div>
      <div style={{ ...card, maxWidth: 640, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 16 }}>
        <div>
          <label style={label}>教師員額（編制內）</label>
          <input disabled={locked} value={form.staff} onChange={(e) => update('staff', e.target.value)} style={input} />
        </div>
        <div>
          <label style={label}>正式教師人數</label>
          <input disabled={locked} value={form.regularTeachers} onChange={(e) => update('regularTeachers', e.target.value)} style={input} />
        </div>
        <div>
          <label style={label}>代理教師人數</label>
          <input disabled={locked} value={form.substitute} onChange={(e) => update('substitute', e.target.value)} style={input} />
        </div>
        <div>
          <label style={label}>兼任／支援教師人數</label>
          <input disabled={locked} value={form.partTimeTeachers} onChange={(e) => update('partTimeTeachers', e.target.value)} style={input} />
        </div>
        <div style={{ gridColumn: '1/3', display: 'flex', gap: 20, padding: '12px 14px', background: '#F5F3EE', borderRadius: 8 }}>
          <div><span style={{ font: "400 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>教師總數</span><div style={{ font: '800 16px Inter, sans-serif', color: '#1E2420' }}>{teacherTotal} 人</div></div>
          <div><span style={{ font: "400 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>代理教師占比</span><div style={{ font: '800 16px Inter, sans-serif', color: '#1E2420' }}>{substituteRatio}%</div></div>
          <div><span style={{ font: "400 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>生師比</span><div style={{ font: '800 16px Inter, sans-serif', color: '#1E2420' }}>{studentTeacherRatio} : 1</div></div>
        </div>
      </div>

      <div style={sectionLabel}>資料異動歷程</div>
      <div style={{ ...card, padding: 0, maxWidth: 640 }}>
        {entries.length === 0 && (
          <div style={{ padding: '11px 18px', font: "500 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無異動紀錄</div>
        )}
        {entries.map((cl) => (
          <div key={cl.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', borderTop: '1px solid #EEEBE2', font: "500 12.5px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
            <span><b style={{ color: '#1E2420' }}>{cl.user}</b> 將「{cl.field}」由 {cl.from} 改為 {cl.to}</span>
            <span style={{ color: '#8A9089', font: '400 11.5px Inter, sans-serif' }}>{fmtDate(cl.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
