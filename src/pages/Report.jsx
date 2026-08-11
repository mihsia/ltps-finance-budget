import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { useYearModule, useYearRecords } from '../hooks/useYearData';
import { useAuth } from '../contexts/AuthContext';
import { fmtNum, fmtDate } from '../lib/format';
import { buildCouncilWorkbook } from '../lib/councilExport';
import { buildOverviewPdf, buildOverviewWorkbook } from '../lib/overviewExport';
import { buildOverviewReport } from '../lib/overviewReport';
import { languageRecordSummary } from '../lib/recordDerivations';
import { runAuthorized } from '../lib/accessPolicy';
import {
  pageTitle, sectionLabel, card, statTile, btnOutline, btnPrimary, chip,
} from '../styles';

const OPTIONAL_MODULE_CHOICES = [
  { key: 'library', label: '圖書藏書量' },
  { key: 'language', label: '族語開班' },
  { key: 'specialNeeds', label: '特殊生統計' },
  { key: 'awards', label: '獲獎紀錄' },
  { key: 'club', label: '課後社團' },
  { key: 'land', label: '土地現值' },
  { key: 'inquiry', label: '議會質詢答詢' },
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
  downloadOverviewExcel,
  downloadPdf,
  logExport,
}) {
  return {
    exportExcel: (aligned) => runAuthorized(
      () => authorizeModule('report'),
      async () => {
        const name = `${year}年度議會報表${aligned ? '（議會格式）' : ''}.xlsx`;
        if (aligned) await downloadExcel(name);
        else await downloadOverviewExcel(name);
        await logExport(name, who);
      },
    ),
    exportPdf: () => runAuthorized(
      () => authorizeModule('report'),
      async () => {
        const name = `${year}年度基金總覽報表.pdf`;
        await downloadPdf(name);
        await logExport(name, who);
      },
    ),
  };
}

export default function Report({ year, years }) {
  const basicState = useYearModule(year, 'basic');
  const libraryState = useYearModule(year, 'library');
  const budgetState = useYearRecords(year, 'budget');
  const languageState = useYearRecords(year, 'language');
  const specialNeedsState = useYearRecords(year, 'specialNeeds');
  const awardsState = useYearRecords(year, 'awards');
  const clubState = useYearRecords(year, 'club');
  const landState = useYearRecords(year, 'land');
  const inquiryState = useYearRecords(year, 'inquiry');
  const { entries, logExport } = useExportHistory(year);
  const { profile, user, authorizeModule } = useAuth();
  const who = profile?.name || user?.email || '未知使用者';

  // Recent 3 fiscal years for the 歲出三年比較 trend and the 基金用途明細表
  // comparison columns (fixed number of hook calls, same pattern as
  // Budget.jsx's rA/rB/rC).
  const recentYears = years.length >= 3 ? years.slice(-3) : [...Array(3 - years.length).fill(years[0]), ...years];
  const yA = useYearRecords(recentYears[0], 'budget');
  const yB = useYearRecords(recentYears[1], 'budget');
  const yC = useYearRecords(recentYears[2], 'budget');
  const trendStates = [
    { year: recentYears[0], state: yA },
    { year: recentYears[1], state: yB },
    { year: recentYears[2], state: yC },
  ];
  const budgetRecordsByYear = {
    [recentYears[0]]: yA.data,
    [recentYears[1]]: yB.data,
    [recentYears[2]]: yC.data,
    [year]: budgetState.data,
  };

  const [selected, setSelected] = useState(
    () => Object.fromEntries(OPTIONAL_MODULE_CHOICES.map((m) => [m.key, true])),
  );
  const selectedModules = OPTIONAL_MODULE_CHOICES.map((m) => m.key).filter((key) => selected[key]);

  const sourceStates = [
    basicState, libraryState, budgetState, languageState, specialNeedsState,
    awardsState, clubState, landState, inquiryState, yA, yB, yC,
  ];
  if (sourceStates.some((state) => state.error)) {
    return <div><div style={pageTitle}>議會報表匯出</div><div style={card}>無法載入議會報表資料，請稍後再試。</div></div>;
  }
  if (sourceStates.some((state) => state.loading)) {
    return <div><div style={pageTitle}>議會報表匯出</div><div style={card}>正在載入議會報表資料…</div></div>;
  }

  const activeExpense = (budgetState.data || []).filter((r) => r.recordType === 'expense' && !r.deletedAt);
  const activeRevenue = (budgetState.data || []).filter((r) => r.recordType === 'revenue' && !r.deletedAt);
  const trend = trendStates.map(({ year: y, state }) => ({
    year: y,
    expenseTotal: (state.data || [])
      .filter((r) => r.recordType === 'expense' && !r.deletedAt)
      .reduce((sum, r) => sum + Number(r.amount || 0), 0),
  }));

  const report = buildOverviewReport({
    year,
    who,
    basic: basicState.data,
    library: libraryState.data,
    expenseRows: activeExpense,
    revenueRows: activeRevenue,
    trend,
    language: languageRecordSummary(languageState.data),
    specialNeedsRows: (specialNeedsState.data || []).filter((r) => !r.deletedAt),
    awardsRows: (awardsState.data || []).filter((r) => !r.deletedAt),
    clubRows: (clubState.data || []).filter((r) => !r.deletedAt),
    landRows: (landState.data || []).filter((r) => !r.deletedAt),
    inquiryRows: (inquiryState.data || []).filter((r) => !r.deletedAt),
  });

  const moduleValueText = (key) => {
    const summary = report.modules[key];
    if (!summary) return null;
    if (key === 'library') return `${fmtNum(summary.total)} 冊`;
    if (key === 'language') return `${summary.classTotal} 班`;
    if (key === 'specialNeeds') return `${summary.total} 人`;
    if (key === 'awards') return `${summary.count} 筆`;
    if (key === 'club') return `${summary.count} 個`;
    if (key === 'land') return `${summary.count} 筆`;
    if (key === 'inquiry') return `${summary.resolved} / ${summary.total} 已結案`;
    return null;
  };

  const downloadCouncilExcel = async (name) => {
    XLSX.writeFile(buildCouncilWorkbook({ year, years: recentYears, budgetRecordsByYear }), name);
  };
  const downloadOverviewExcel = async (name) => {
    XLSX.writeFile(buildOverviewWorkbook(report, { selectedModules }), name);
  };
  const downloadPdf = async (name) => {
    const doc = await buildOverviewPdf(report, { selectedModules });
    doc.save(name);
  };

  const { exportExcel, exportPdf } = createReportExportHandlers({
    year,
    who,
    authorizeModule,
    downloadExcel: downloadCouncilExcel,
    downloadOverviewExcel,
    downloadPdf,
    logExport,
  });

  return (
    <div>
      <div style={pageTitle}>議會報表匯出</div>
      <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 18 }}>{year}年度 · 利澤國小基金總覽（議會用）</div>

      <div style={sectionLabel}>關鍵指標</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20, maxWidth: 900 }}>
        <div style={statTile}>
          <div style={{ font: "400 12px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 6 }}>{year}年度歲出預算</div>
          <div style={{ font: '800 20px Inter, sans-serif' }}>{fmtNum(report.kpi.expenseTotal)}<span style={{ font: "600 11px 'Noto Sans TC', sans-serif", color: '#8A9089' }}> 千元</span></div>
        </div>
        <div style={statTile}>
          <div style={{ font: "400 12px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 6 }}>{year}年度歲入預算</div>
          <div style={{ font: '800 20px Inter, sans-serif' }}>{fmtNum(report.kpi.revenueTotal)}<span style={{ font: "600 11px 'Noto Sans TC', sans-serif", color: '#8A9089' }}> 千元</span></div>
        </div>
        <div style={statTile}>
          <div style={{ font: "400 12px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 6 }}>本期{report.kpi.shortfall < 0 ? '短絀' : '賸餘'}</div>
          <div style={{ font: '800 20px Inter, sans-serif', color: report.kpi.shortfall < 0 ? '#B5533E' : '#2F8F5B' }}>{fmtNum(report.kpi.shortfall)}<span style={{ font: "600 11px 'Noto Sans TC', sans-serif", color: '#8A9089' }}> 千元</span></div>
        </div>
        <div style={statTile}>
          <div style={{ font: "400 12px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 6 }}>學生人數</div>
          <div style={{ font: '800 20px Inter, sans-serif' }}>{report.kpi.students ?? '—'}<span style={{ font: "600 11px 'Noto Sans TC', sans-serif", color: '#8A9089' }}> 人 · {report.kpi.classes ?? '—'}班</span></div>
        </div>
      </div>

      <div style={sectionLabel}>歲出三年比較（千元）</div>
      <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 640, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 18px', background: '#F5F3EE', font: "700 12px 'Noto Sans TC', sans-serif", color: '#6B726A' }}>
          <span>年度</span><span>金額</span><span>較上年增減</span>
        </div>
        {report.trend.map((entry) => (
          <div key={entry.year} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 18px', borderTop: '1px solid #EEEBE2', font: "500 13px 'Noto Sans TC', sans-serif" }}>
            <span>{entry.year}年度</span>
            <span style={{ font: '700 13px Inter, sans-serif' }}>{fmtNum(entry.expenseTotal)}</span>
            <span style={{ font: '700 12px Inter, sans-serif', color: entry.deltaPct == null ? '#8A9089' : (entry.deltaPct < 0 ? '#B5533E' : '#2F8F5B') }}>
              {entry.deltaPct == null ? '—' : `${entry.deltaPct < 0 ? '▼' : '▲'} ${Math.abs(entry.deltaPct).toFixed(2)}%`}
            </span>
          </div>
        ))}
      </div>

      <div style={sectionLabel}>業務計畫別預算與決算（千元）</div>
      <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 900, marginBottom: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.6fr', padding: '10px 18px', background: '#F5F3EE', font: "700 12px 'Noto Sans TC', sans-serif", color: '#6B726A' }}>
          <span>項目</span><span>預算金額</span><span>決算金額</span><span>差異原因說明</span>
        </div>
        {report.expenseVariance.rows.length === 0 && <div style={{ padding: '12px 18px', color: '#8A9089' }}>尚無歲出資料</div>}
        {report.expenseVariance.rows.map((row) => (
          <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.6fr', padding: '10px 18px', borderTop: '1px solid #EEEBE2', font: "500 13px 'Noto Sans TC', sans-serif" }}>
            <span>{row.label}</span>
            <span style={{ font: '700 13px Inter, sans-serif' }}>{fmtNum(row.budgetAmount)}</span>
            <span>{row.actualAmount == null ? '—' : fmtNum(row.actualAmount)}</span>
            <span style={{ color: '#8A9089' }}>{row.note || '—'}</span>
          </div>
        ))}
      </div>
      {!report.expenseVariance.complete && (
        <div style={{ font: "400 12px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 20, maxWidth: 900 }}>
          ＊決算數為年度結束後陸續填報，尚未全數到齊前不列入決算合計。
        </div>
      )}

      <div style={sectionLabel}>選擇涵蓋模組（各模組現況）</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, maxWidth: 900 }}>
        {OPTIONAL_MODULE_CHOICES.map((m) => (
          <div
            key={m.key}
            onClick={() => setSelected((s) => ({ ...s, [m.key]: !s[m.key] }))}
            style={{ ...chip(selected[m.key]), display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}
          >
            {selected[m.key] ? '☑' : '☐'} {m.label}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 24, maxWidth: 900 }}>
        {OPTIONAL_MODULE_CHOICES.filter((m) => selected[m.key] && report.modules[m.key]).map((m) => (
          <div key={m.key} style={{ border: '1px solid #E3DFD3', borderRadius: 9, padding: '12px 14px' }}>
            <div style={{ font: "600 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 5 }}>{m.label}</div>
            <div style={{ font: '800 17px Inter, sans-serif' }}>{moduleValueText(m.key)}</div>
          </div>
        ))}
      </div>

      <div style={sectionLabel}>匯出格式</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={btnOutline} onClick={() => exportExcel(false)}>匯出 Excel（全貌總覽）</div>
        <div style={btnOutline} onClick={() => exportExcel(true)}>對齊議會既有格式（.xls 範本）</div>
        <div style={btnPrimary} onClick={exportPdf}>匯出 PDF（全貌總覽）</div>
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
