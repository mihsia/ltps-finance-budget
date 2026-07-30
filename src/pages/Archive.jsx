import { useRef, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { createNextYear } from '../hooks/useYearData';
import { useAuth } from '../contexts/AuthContext';
import { parseImportFile } from '../lib/importParser';
import { pageTitle, pageSubtitle, card, btnPrimary, btnSecondary, badge } from '../styles';

const PLAN_LABELS = ['國民教育計畫', '一般行政管理計畫', '建築及設備計畫'];

export default function Archive({ years, latestYear, setYear, setNav }) {
  const { isAdmin } = useAuth();
  const nextYear = String(Number(latestYear) + 1);
  const fileRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);

  const view = (y) => { setYear(y); setNav('dashboard'); };
  const exportYear = (y) => { setYear(y); setNav('report'); };

  const createYear = async () => {
    setBusy(true);
    try {
      const created = await createNextYear(latestYear);
      setYear(created);
    } finally {
      setBusy(false);
    }
  };

  const pickFile = () => fileRef.current?.click();

  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setImportFile(file.name);
    try {
      const rows = await parseImportFile(file);
      setPreview(rows);
    } catch (err) {
      setError(err.message);
      setImportFile(null);
    }
  };

  const cancelImport = () => { setImportFile(null); setPreview(null); setError(null); };

  const confirmImport = async () => {
    setBusy(true);
    try {
      await setDoc(doc(db, 'years', nextYear), { locked: false, deadlines: {}, createdAt: serverTimestamp() }, { merge: true });
      const existing = (await getDoc(doc(db, 'years', latestYear, 'modules', 'budget'))).data();
      const baseBreakdown = existing?.expense?.breakdown || PLAN_LABELS.map((label) => ({ label, formula: '', amount: 0 }));
      const updatedBreakdown = baseBreakdown.map((item) => {
        const found = preview.find((p) => p.label === item.label);
        return found ? { ...item, amount: Number(String(found.val).replace(/[^\d]/g, '')) } : item;
      });
      await setDoc(doc(db, 'years', nextYear, 'modules', 'budget'), {
        expense: { breakdown: updatedBreakdown },
        revenue: existing?.revenue || { rows: [] },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      cancelImport();
      setYear(nextYear);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={pageTitle}>歷史歸檔</div>
      <div style={pageSubtitle}>年度資料唯讀封存，僅管理者可匯入／匯出</div>

      <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 640, marginBottom: 28 }}>
        {[...years].reverse().map((y) => {
          const archived = y !== latestYear;
          return (
            <div key={y} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderTop: '1px solid #EEEBE2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>{y}年度</span>
                <span style={badge(!archived)}>{archived ? '已封存' : '編輯中'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span onClick={() => view(y)} style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#1F5F52', cursor: 'pointer' }}>檢視</span>
                <span onClick={() => exportYear(y)} style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#1F5F52', cursor: 'pointer' }}>匯出</span>
              </div>
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div style={{ ...btnPrimary, marginBottom: 32, opacity: busy ? .6 : 1, pointerEvents: busy ? 'none' : 'auto' }} onClick={createYear}>
          ＋ 建立 {nextYear} 年度（複製 {latestYear} 年度資料）
        </div>
      )}

      {isAdmin && (
        <>
          <div style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 4 }}>匯入新年度預算書（自動填入各模組）</div>
          <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 14 }}>
            上傳議會版預算書（PDF／Word），系統自動解析歲入歲出金額，直接帶入 {nextYear} 年度的「歲入歲出」與「預算書表」模組，免重複輸入
          </div>

          <div style={{ maxWidth: 640 }}>
            <input ref={fileRef} type="file" accept=".pdf,.docx" style={{ display: 'none' }} onChange={onFileSelected} />

            {!importFile && (
              <div onClick={pickFile} style={{ border: '1.5px dashed #C9832F', borderRadius: 10, background: '#FDF6EC', padding: 30, textAlign: 'center', cursor: 'pointer' }}>
                <div style={{ font: "700 13.5px 'Noto Sans TC', sans-serif", color: '#8A5A1E', marginBottom: 4 }}>點擊上傳或拖曳檔案至此</div>
                <div style={{ font: "400 12px 'Noto Sans TC', sans-serif", color: '#B08A50' }}>支援 PDF、DOCX，例如「利澤國小{nextYear}年度預算書」</div>
              </div>
            )}

            {error && <div style={{ font: "500 12.5px 'Noto Sans TC', sans-serif", color: '#B5533E', marginTop: 10 }}>⚠ {error}</div>}

            {importFile && preview && (
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ font: "700 13px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>📄 {importFile}</span>
                  <span style={{ font: '700 11px Inter, sans-serif', color: '#2F8F5B', background: '#EAF6EE', padding: '4px 10px', borderRadius: 5 }}>解析完成</span>
                </div>
                <div style={{ font: "400 12px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 10 }}>
                  已擷取以下數值，將帶入 {nextYear} 年度（可於匯入後再行修改）：
                </div>
                <div style={{ background: '#F5F3EE', borderRadius: 8, overflow: 'hidden' }}>
                  {preview.map((ip) => (
                    <div key={ip.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderTop: '1px solid #E9E5D8', font: "500 12.5px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
                      <span>{ip.label} <span style={{ color: '#B08A50' }}>→ {ip.target}</span></span>
                      <span style={{ font: '700 12.5px Inter, sans-serif', color: '#1E2420' }}>{ip.val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <div style={{ ...btnPrimary, opacity: busy ? .6 : 1, pointerEvents: busy ? 'none' : 'auto' }} onClick={confirmImport}>確認匯入 {nextYear} 年度</div>
                  <div style={btnSecondary} onClick={cancelImport}>重新選擇檔案</div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
