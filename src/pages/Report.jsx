import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { useYearModule, useYearRecords } from '../hooks/useYearData';
import { useAuth } from '../contexts/AuthContext';
import { fmtNum, fmtDate } from '../lib/format';
import { buildCouncilWorkbook } from '../lib/councilExport';
import { budgetRecordSummary, languageRecordSummary } from '../lib/recordDerivations';
import { runAuthorized } from '../lib/accessPolicy';
import { pageTitle, sectionLabel, card, btnOutline, btnPrimary, chip } from '../styles';

const MODULE_CHOICES = [
  { key: 'basic', label: '學校基本資料' },
  { key: 'budget', label: '歲入歲出' },
  { key: 'library', label: '圖書藏書量' },
  { key: 'language', label: '族語開班' },
  { key: 'awards', label: '獲獎紀錄' },
  { key: 'club', label: '課後社團' },
];

function useExportHistory(year) {
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const q = query(collection(db, 'years', year, 'exports'), orderBy('time', 'desc'), limit(10));
    return onSnapshot(q, (snap) => setEntries(snap.docs.map((d) => d.data())));
  }, [year]);
  const logExport = async (name, user) => {
    await addDoc(collection(db, 'years', year, 'exports'), { name, user, time: serverTimestamp() });
  };
  return { entries, logExport };
}

export function createReportExportHandlers({
  year,
  who,
  authorizeModule,
  downloadExcel,
  downloadPdf,
  logExport,
}) {
  return {
    exportExcel: (aligned) => runAuthorized(
      () => authorizeModule('report'),
      async () => {
        const name = `${year}年度議會報表${aligned ? '（議會格式）' : ''}.xlsx`;
        await downloadExcel(aligned, name);
        await logExport(name, who);
      },
    ),
    exportPdf: () => runAuthorized(
      () => authorizeModule('report'),
      async () => {
        const name = `${year}年度議會報表.pdf`;
        await downloadPdf(name);
        await logExport(name, who);
      },
    ),
  };
}

export default function Report({ year, years }) {
  const basicState = useYearModule(year, 'basic');
  const budgetState = useYearRecords(year, 'budget');
  const languageState = useYearRecords(year, 'language');
  const { entries, logExport } = useExportHistory(year);
  const { profile, user, authorizeModule } = useAuth();
  const who = profile?.name || user?.email || '未知使用者';

  // Recent 3 fiscal years for the 基金用途明細表 comparison columns (fixed number
  // of hook calls, same pattern as Budget.jsx's rA/rB/rC).
  const recentYears = years.length >= 3 ? years.slice(-3) : [...Array(3 - years.length).fill(years[0]), ...years];
  const yA = useYearRecords(recentYears[0], 'budget');
  const yB = useYearRecords(recentYears[1], 'budget');
  const yC = useYearRecords(recentYears[2], 'budget');
  const budgetRecordsByYear = {
    [recentYears[0]]: yA.data,
    [recentYears[1]]: yB.data,
    [recentYears[2]]: yC.data,
    [year]: budgetState.data,
  };

  const [selected, setSelected] = useState(() => Object.fromEntries(MODULE_CHOICES.map((m) => [m.key, true])));

  const basic = basicState.data;
  const expenseTotal = budgetRecordSummary(budgetState.data).expenseTotal;
  const langTotal = languageRecordSummary(languageState.data).classRows
    .reduce((sum, record) => sum + Number(record.classes || 0), 0);

  const reportRows = [
    { label: `${year}年度預算數（千元）`, val: fmtNum(expenseTotal) },
    { label: '班級數', val: basic?.classes ?? '—' },
    { label: '學生人數', val: basic?.students ?? '—' },
    { label: '員額數', val: basic?.staff ?? '—' },
    { label: '代理教師人數', val: basic?.substitute ?? '—' },
    { label: '本土語開班語系及班級數總和', val: langTotal || '—' },
  ];

  const downloadExcel = async (aligned, name) => {
    const wb = aligned
      ? buildCouncilWorkbook({ year, years: recentYears, budgetRecordsByYear })
      : (() => {
        const book = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([['項目', '五結鄉 · 利澤國小'], ...reportRows.map((r) => [r.label, r.val])]);
        XLSX.utils.book_append_sheet(book, ws, '議會報表');
        return book;
      })();
    XLSX.writeFile(wb, name);
  };

  const downloadPdf = async (name) => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`${year}年度 利澤國小基金預算（議會用）`, 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [['項目', '五結鄉 · 利澤國小']],
      body: reportRows.map((r) => [r.label, String(r.val)]),
      headStyles: { fillColor: [31, 95, 82] },
    });
    doc.save(name);
  };

  const { exportExcel, exportPdf } = createReportExportHandlers({
    year,
    who,
    authorizeModule,
    downloadExcel,
    downloadPdf,
    logExport,
  });

  const sourceStates = [basicState, budgetState, languageState, yA, yB, yC];
  if (sourceStates.some((state) => state.error)) {
    return <div><div style={pageTitle}>議會報表匯出</div><div style={card}>無法載入議會報表資料，請稍後再試。</div></div>;
  }
  if (sourceStates.some((state) => state.loading)) {
    return <div><div style={pageTitle}>議會報表匯出</div><div style={card}>正在載入議會報表資料…</div></div>;
  }

  return (
    <div>
      <div style={pageTitle}>議會報表匯出</div>
      <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 18 }}>{year}年度 · 利澤國小基金預算（議會用）</div>

      <div style={sectionLabel}>1. 選擇涵蓋模組</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, maxWidth: 760 }}>
        {MODULE_CHOICES.map((m) => (
          <div
            key={m.key}
            onClick={() => setSelected((s) => ({ ...s, [m.key]: !s[m.key] }))}
            style={{ ...chip(selected[m.key]), display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}
          >
            {selected[m.key] ? '☑' : '☐'} {m.label}
          </div>
        ))}
      </div>

      <div style={sectionLabel}>2. 預覽（依議會既有格式對齊）</div>
      <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 760, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', background: '#1F5F52', color: '#fff', font: "700 12.5px 'Noto Sans TC', sans-serif", padding: '12px 18px' }}>
          <span>項目</span><span>五結鄉 · 利澤國小</span>
        </div>
        {reportRows.map((rr) => (
          <div key={rr.label} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', padding: '12px 18px', borderTop: '1px solid #EEEBE2', font: "500 13px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>
            <span style={{ color: '#454B45' }}>{rr.label}</span><span style={{ font: '700 13px Inter, sans-serif' }}>{rr.val}</span>
          </div>
        ))}
      </div>

      <div style={sectionLabel}>3. 匯出格式</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <div style={btnOutline} onClick={() => exportExcel(false)}>匯出 Excel</div>
        <div style={btnOutline} onClick={() => exportExcel(true)}>對齊議會既有格式（.xls 範本）</div>
        <div style={btnPrimary} onClick={exportPdf}>匯出 PDF</div>
      </div>

      <div style={sectionLabel}>匯出紀錄</div>
      <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 640 }}>
        {entries.length === 0 && <div style={{ padding: '11px 18px', font: "500 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無匯出紀錄</div>}
        {entries.map((eh, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 18px', borderTop: '1px solid #EEEBE2', font: "500 12.5px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
            <span>{eh.name}</span><span style={{ color: '#8A9089' }}>{fmtDate(eh.time)} · {eh.user}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
