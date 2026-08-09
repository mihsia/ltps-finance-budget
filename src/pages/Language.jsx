import { useState } from 'react';
import { useYearModule } from '../hooks/useYearData';
import { useAuth } from '../contexts/AuthContext';
import { runAuthorized } from '../lib/accessPolicy';
import { pageTitle, pageSubtitle, card, input, label, btnPrimary, chip, emptyState, tableHeadRow, tableRow } from '../styles';

const LANG_OPTIONS = ['閩南語', '客語', '賽考利克泰雅語', '太魯閣語'];
const LEVEL_OPTIONS = ['A級（初級）', 'B級（中級）', 'C級（高級）'];

export default function Language({ year, latestYear }) {
  const { data, save, copyFrom } = useYearModule(year, 'language');
  const { canEditModule, authorizeModule } = useAuth();
  const isEditableYear = year === latestYear;
  const canEdit = canEditModule('language') && isEditableYear;

  const classes = data?.classes || [];
  const cert = data?.cert || [];
  const certRecords = data?.certRecords || [];
  const [certForm, setCertForm] = useState({ lang: LANG_OPTIONS[0], level: LEVEL_OPTIONS[0], name: '' });

  const classesTotal = classes.reduce((s, c) => s + Number(c.classes || 0) + 0, 0);
  const certifiedTeachers = cert.reduce((s, c) => s + Number(c.certifiedTeachers || 0), 0);
  const totalTeachers = cert.reduce((s, c) => s + Number(c.totalTeachers || 0), 0);
  const tested = cert.reduce((s, c) => s + Number(c.tested || 0), 0);
  const passed = cert.reduce((s, c) => s + Number(c.passed || 0), 0);
  const passRate = tested ? ((passed / tested) * 100).toFixed(1) : '0.0';

  const addCertRecord = async () => {
    if (!certForm.name.trim()) return;
    return runAuthorized(() => authorizeModule('language'), async () => {
      const next = [...certRecords, { id: Date.now(), ...certForm }];
      await save({ certRecords: next });
      setCertForm((s) => ({ ...s, name: '' }));
    });
  };
  const removeCertRecord = (id) => runAuthorized(
    () => authorizeModule('language'),
    () => save({ certRecords: certRecords.filter((r) => r.id !== id) }),
  );
  const copyLatestYear = () => runAuthorized(
    () => authorizeModule('language'),
    () => copyFrom(latestYear),
  );

  if (!isEditableYear && !data) {
    return (
      <div>
        <div style={pageTitle}>本土語／原住民語開班</div>
        <div style={pageSubtitle}>負責人：教務處 · {year}年度</div>
        <div style={emptyState}>
          <div style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 6 }}>{year}年度尚未建立此模組資料</div>
          <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 16 }}>可從 {latestYear} 年度複製資料後再修改，或手動新增</div>
          <div style={btnPrimary} onClick={copyLatestYear}>從 {latestYear} 年度複製資料</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={pageTitle}>本土語／原住民語開班</div>
      <div style={pageSubtitle}>負責人：教務處 · {year}年度 · 開班語系及班級數總和 {classesTotal}</div>

      <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 640, marginBottom: 20 }}>
        <div style={tableHeadRow('2fr 1fr 1fr')}><span>語系</span><span>班級數</span><span>人數</span></div>
        {classes.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089', font: "400 13px 'Noto Sans TC', sans-serif" }}>尚無資料</div>}
        {classes.map((l) => (
          <div key={l.lang} style={tableRow('2fr 1fr 1fr')}><span>{l.lang}</span><span>{l.classes}</span><span>{l.students}</span></div>
        ))}
      </div>

      <div style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 10 }}>師資族語能力認證與學生通過情形</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, maxWidth: 640, marginBottom: 18 }}>
        <div style={{ background: '#F5F3EE', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ font: "400 12px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 6 }}>授課教師取得認證比例</div>
          <div style={{ font: '800 22px Inter, sans-serif', color: '#1E2420' }}>
            {certifiedTeachers}<span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#8A9089' }}> / {totalTeachers} 人（{totalTeachers ? Math.round((certifiedTeachers / totalTeachers) * 100) : 0}%）</span>
          </div>
        </div>
        <div style={{ background: '#F5F3EE', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ font: "400 12px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 6 }}>學生族語認證通過人數</div>
          <div style={{ font: '800 22px Inter, sans-serif', color: '#1E2420' }}>{passed}<span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#8A9089' }}> 人</span></div>
        </div>
        <div style={{ background: '#F5F3EE', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ font: "400 12px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 6 }}>學生認證通過率</div>
          <div style={{ font: '800 22px Inter, sans-serif', color: '#2F8F5B' }}>{passRate}%</div>
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 640, marginBottom: 24 }}>
        <div style={tableHeadRow('1.4fr 1fr 1fr 1fr')}><span>語系</span><span>授課教師認證</span><span>應考人數</span><span>通過人數</span></div>
        {cert.map((lc) => (
          <div key={lc.lang} style={{ ...tableRow('1.4fr 1fr 1fr 1fr'), font: "500 13px 'Noto Sans TC', sans-serif" }}>
            <span>{lc.lang}</span><span>{lc.certifiedTeachers} / {lc.totalTeachers}</span><span>{lc.tested}</span>
            <span style={{ font: '700 13px Inter, sans-serif', color: '#2F8F5B' }}>{lc.passed}</span>
          </div>
        ))}
      </div>

      <div style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 10 }}>學生族語認證通過名冊登錄</div>
      {canEdit && (
        <div style={{ ...card, padding: '18px 20px', maxWidth: 640, marginBottom: 14 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ ...label, fontSize: 11.5 }}>語系</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {LANG_OPTIONS.map((v) => (
                <div key={v} onClick={() => setCertForm((s) => ({ ...s, lang: v }))} style={chip(certForm.lang === v)}>{v}</div>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ ...label, fontSize: 11.5 }}>通過級別</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {LEVEL_OPTIONS.map((v) => (
                <div key={v} onClick={() => setCertForm((s) => ({ ...s, level: v }))} style={chip(certForm.level === v)}>{v}</div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ ...label, fontSize: 11.5, marginBottom: 5 }}>學生姓名</label>
              <input
                value={certForm.name}
                onChange={(e) => setCertForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="例：陳小明"
                style={{ ...input, padding: '9px 10px', font: "500 13px 'Noto Sans TC', sans-serif" }}
              />
            </div>
            <div onClick={addCertRecord} style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>＋ 新增</div>
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 640 }}>
        <div style={tableHeadRow('1.2fr 1fr 1fr auto')}><span>語系</span><span>級別</span><span>學生姓名</span><span /></div>
        {certRecords.map((cr) => (
          <div key={cr.id} style={{ ...tableRow('1.2fr 1fr 1fr auto'), alignItems: 'center' }}>
            <span>{cr.lang}</span><span>{cr.level}</span><span>{cr.name}</span>
            {canEdit ? (
              <span onClick={() => removeCertRecord(cr.id)} style={{ color: '#B5533E', font: "600 12px 'Noto Sans TC', sans-serif", cursor: 'pointer', justifySelf: 'end' }}>刪除</span>
            ) : <span />}
          </div>
        ))}
      </div>
    </div>
  );
}
