import { useRef, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { createNextYear } from '../hooks/useYearData';
import { useAuth } from '../contexts/AuthContext';
import { runAuthorized } from '../lib/accessPolicy';
import { parseImportFile, IMPORT_FIELDS } from '../lib/importParser';
import { fmtNum } from '../lib/format';
import { pageTitle, pageSubtitle, card, btnPrimary, btnSecondary, badge, input } from '../styles';

const EXPENSE_DEFAULTS = {
  eduPlan: { label: '國民教育計畫', formula: '辦理校務行政、教學活動及各項專案計畫等' },
  adminPlan: { label: '一般行政管理計畫', formula: '教職員工人事費、歷年退休金及遺屬年金業務等' },
  buildingPlan: { label: '建築及設備計畫', formula: '改善並充實學校教學及行政環境、購置設備等' },
};
const GOV_GRANT_LABEL = '政府撥入收入（公庫撥款）';

/** Builds the editable review-row state from a parse result + the prior year's saved figures (used as the starting value for anything the parser couldn't find, so nothing is left silently blank). */
function buildReview(fields, missing, prevBudget) {
  const prevExpenseByLabel = Object.fromEntries((prevBudget?.expense?.breakdown || []).map((r) => [r.label, r.amount]));
  const prevGovGrant = (prevBudget?.revenue?.rows || []).find((r) => r.label === GOV_GRANT_LABEL)?.amount;
  return IMPORT_FIELDS.map((f) => {
    const matched = f.id in fields;
    let value = matched ? fields[f.id] : '';
    if (!matched && f.expenseLabel) value = prevExpenseByLabel[f.expenseLabel] ?? '';
    if (!matched && f.id === 'govGrant') value = prevGovGrant ?? '';
    return { id: f.id, label: f.label, group: f.group, matched, value: String(value) };
  }).filter((r) => !(missing.includes(r.id) && r.group === 'info' && r.value === ''));
}

export default function Archive({ years, latestYear, setYear, setNav }) {
  const { isAdmin, authorizeAdmin } = useAuth();
  const nextYear = String(Number(latestYear) + 1);
  const fileRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [review, setReview] = useState(null);
  const [missingCount, setMissingCount] = useState(0);
  const [error, setError] = useState(null);

  const view = (y) => { setYear(y); setNav('dashboard'); };
  const exportYear = (y) => { setYear(y); setNav('report'); };

  const createYear = async () => {
    return runAuthorized(() => authorizeAdmin(), async () => {
      setBusy(true);
      try {
        const created = await createNextYear(latestYear);
        setYear(created);
      } finally {
        setBusy(false);
      }
    });
  };

  const pickFile = () => fileRef.current?.click();

  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setImportFile(file.name);
    try {
      const { fields, missing } = await parseImportFile(file);
      const prevSnap = await getDoc(doc(db, 'years', latestYear, 'modules', 'budget'));
      setReview(buildReview(fields, missing, prevSnap.data()));
      setMissingCount(missing.length);
    } catch (err) {
      setError(err.message);
      setImportFile(null);
    }
  };

  const cancelImport = () => { setImportFile(null); setReview(null); setError(null); setMissingCount(0); };

  const setReviewValue = (id, value) => {
    setReview((rows) => rows.map((r) => (r.id === id ? { ...r, value } : r)));
  };

  const reviewValue = (id) => Number(String(review.find((r) => r.id === id)?.value ?? 0).replace(/[^\d.-]/g, '')) || 0;

  const confirmImport = async () => {
    return runAuthorized(() => authorizeAdmin(), async () => {
      setBusy(true);
      try {
        await setDoc(doc(db, 'years', nextYear), { locked: false, deadlines: {}, createdAt: serverTimestamp() }, { merge: true });

        const prevSnap = await getDoc(doc(db, 'years', latestYear, 'modules', 'budget'));
        const prev = prevSnap.data();

        const expenseBreakdown = Object.entries(EXPENSE_DEFAULTS).map(([id, meta]) => ({
          label: meta.label,
          formula: meta.formula,
          amount: reviewValue(id),
        }));

        // The 3 fine-grained revenue line items (財產處分收入／租金收入／利息收入)
        // aren't reliably parseable from real-world budget-book layouts (see
        // src/lib/importParser.js) — carry the prior year's figures forward
        // instead of guessing, and rely on 財產收入合計 above as a cross-check
        // total staff can use to redistribute them in 歲入歲出 afterward.
        const carriedRevenueRows = (prev?.revenue?.rows || []).filter((r) => r.label !== GOV_GRANT_LABEL);
        const revenueRows = [...carriedRevenueRows, { label: GOV_GRANT_LABEL, amount: reviewValue('govGrant') }];

        await setDoc(doc(db, 'years', nextYear, 'modules', 'budget'), {
          expense: { breakdown: expenseBreakdown },
          revenue: { rows: revenueRows },
          updatedAt: serverTimestamp(),
        }, { merge: true });

        cancelImport();
        setYear(nextYear);
      } finally {
        setBusy(false);
      }
    });
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
            上傳議會版預算書（PDF／Word），系統自動解析歲入歲出金額並帶入 {nextYear} 年度「歲入歲出」模組 — 匯入前請核對每一項金額，必要時直接修改
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

            {importFile && review && (
              <div style={{ ...card, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ font: "700 13px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>📄 {importFile}</span>
                  <span style={{ font: '700 11px Inter, sans-serif', color: '#2F8F5B', background: '#EAF6EE', padding: '4px 10px', borderRadius: 5 }}>解析完成</span>
                </div>
                {missingCount > 0 && (
                  <div style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#8A5A1E', background: '#FDF3E7', border: '1px solid #EFD9B3', borderRadius: 6, padding: '7px 10px', marginTop: 8 }}>
                    ⚠ 有 {missingCount} 個項目未能自動辨識（已改用 {latestYear} 年度數值填入），請核對後修改再匯入
                  </div>
                )}
                <div style={{ font: "400 12px 'Noto Sans TC', sans-serif", color: '#8A9089', margin: '10px 0' }}>
                  請核對以下金額（單位：千元），確認無誤或修改後再匯入 {nextYear} 年度：
                </div>
                <div style={{ background: '#F5F3EE', borderRadius: 8, overflow: 'hidden' }}>
                  {review.map((r) => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 14px', borderTop: '1px solid #E9E5D8' }}>
                      <span style={{ font: "500 12.5px 'Noto Sans TC', sans-serif", color: '#454B45', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {r.label}
                        <span style={badge(r.matched, '#2F8F5B', '#EAF6EE', '#8A5A1E', '#FDF3E7')}>{r.matched ? '✓ 自動辨識' : '✎ 請確認'}</span>
                      </span>
                      {r.group === 'info' ? (
                        <span style={{ font: '700 12.5px Inter, sans-serif', color: '#1E2420' }}>{fmtNum(r.value)} 千元</span>
                      ) : (
                        <input
                          style={{ ...input, width: 120, padding: '6px 10px', font: '700 12.5px Inter, sans-serif', textAlign: 'right' }}
                          value={r.value}
                          onChange={(e) => setReviewValue(r.id, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ font: "400 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089', marginTop: 10 }}>
                  財產處分收入／租金收入／利息收入等細項無法穩定自動辨識，已沿用 {latestYear} 年度數值，請於匯入後至「歲入歲出」模組核對並視需要重新分配。
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
