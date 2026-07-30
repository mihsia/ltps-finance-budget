import { useState } from 'react';
import { useYearModule } from '../hooks/useYearData';
import { useAuth } from '../contexts/AuthContext';
import { genericModuleMeta } from '../lib/nav';
import { pageTitle, pageSubtitle, card, input, btnPrimary, btnOutline, emptyState, tableHeadRow, tableRow } from '../styles';

export default function Generic({ year, latestYear, moduleKey }) {
  const meta = genericModuleMeta[moduleKey];
  const { data, save, copyFrom } = useYearModule(year, moduleKey);
  const { canEditModule } = useAuth();
  const isEditableYear = year === latestYear;
  const canEdit = canEditModule(moduleKey) && isEditableYear;

  // Rows are stored as { cells: [...] } rather than bare arrays because
  // Firestore rejects an array nested directly inside another array.
  const rows = data?.rows || [];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(() => meta.columns.map(() => ''));

  const startAdd = () => { setDraft(meta.columns.map(() => '')); setAdding(true); };
  const commitAdd = async () => {
    if (draft.every((c) => !c.trim())) return;
    await save({ rows: [...rows, { cells: draft }] });
    setAdding(false);
  };
  const removeRow = async (idx) => {
    await save({ rows: rows.filter((_, i) => i !== idx) });
  };

  if (!isEditableYear && !data) {
    return (
      <div>
        <div style={pageTitle}>{meta.title}</div>
        <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 6 }}>{meta.desc}</div>
        <div style={pageSubtitle}>{year}年度</div>
        <div style={emptyState}>
          <div style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 6 }}>{year}年度尚未建立此模組資料</div>
          <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 16 }}>可從 {latestYear} 年度複製資料後再修改，或手動新增</div>
          <div style={btnPrimary} onClick={() => copyFrom(latestYear)}>從 {latestYear} 年度複製資料</div>
        </div>
      </div>
    );
  }

  const cols = `repeat(${meta.columns.length}, 1fr)${canEdit ? ' auto' : ''}`;

  return (
    <div>
      <div style={pageTitle}>{meta.title}</div>
      <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 6 }}>{meta.desc}</div>
      <div style={pageSubtitle}>{year}年度</div>

      <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 720 }}>
        <div style={{ ...tableHeadRow(cols), display: 'flex' }}>
          {meta.columns.map((c) => <span key={c} style={{ flex: 1 }}>{c}</span>)}
          {canEdit && <span style={{ width: 40 }} />}
        </div>
        {rows.length === 0 && (
          <div style={{ padding: '12px 18px', color: '#8A9089', font: "400 13px 'Noto Sans TC', sans-serif" }}>尚無資料</div>
        )}
        {rows.map((row, i) => (
          <div key={i} style={{ ...tableRow(cols), display: 'flex' }}>
            {row.cells.map((cell, j) => <span key={j} style={{ flex: 1 }}>{cell}</span>)}
            {canEdit && (
              <span onClick={() => removeRow(i)} style={{ width: 40, color: '#B5533E', font: "600 12px 'Noto Sans TC', sans-serif", cursor: 'pointer' }}>刪除</span>
            )}
          </div>
        ))}
      </div>

      {canEdit && !adding && (
        <div style={{ ...btnOutline, marginTop: 14 }} onClick={startAdd}>＋ 新增一筆</div>
      )}
      {canEdit && adding && (
        <div style={{ ...card, maxWidth: 640, marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${meta.columns.length}, 1fr)`, gap: 12, marginBottom: 14 }}>
            {meta.columns.map((c, i) => (
              <div key={c}>
                <label style={{ font: "600 11.5px 'Noto Sans TC', sans-serif", color: '#454B45', display: 'block', marginBottom: 5 }}>{c}</label>
                <input style={input} value={draft[i]} onChange={(e) => setDraft((d) => d.map((v, j) => j === i ? e.target.value : v))} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={btnPrimary} onClick={commitAdd}>新增</div>
            <div style={{ ...btnOutline }} onClick={() => setAdding(false)}>取消</div>
          </div>
        </div>
      )}
    </div>
  );
}
