import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { useYearModule, useYearRecords } from '../hooks/useYearData';
import { useAuth } from '../contexts/AuthContext';
import { fmtNum, fmtDate } from '../lib/format';
import { buildCouncilWorkbook } from '../lib/councilExport';
import { buildOverviewPdf, buildOverviewWorkbook } from '../lib/overviewExport';
import { buildOverviewReport, OPTIONAL_MODULE_DETAIL_FIELDS, OPTIONAL_MODULE_COLORS } from '../lib/overviewReport';
import { languageRecordSummary } from '../lib/recordDerivations';
import { summarizeByCategory, summarizeByLevel } from '../lib/awardStats';
import { summarizeSpecialNeeds } from '../lib/specialNeedsStats';
import { summarizeClubParticipation } from '../lib/clubStats';
import { runAuthorized } from '../lib/accessPolicy';
import {
  pageTitle, sectionLabel, card, statTile, btnOutline, btnPrimary, btnSecondary, chip, progressBar,
} from '../styles';

// Validated against the dataviz skill's CVD-safety checks for an all-pairs
// (every slice visually adjacent to every other) categorical context — see
// AWARD_CATEGORY_COLORS usage below. "其他" (legacy data outside the fixed
// category list) stays neutral gray rather than taking a 5th hue.
const AWARD_CATEGORY_COLORS = {
  語文類: '#2a78d6',
  藝文類: '#eda100',
  體育類: '#e87ba4',
  科學類: '#008300',
  其他: '#8A9089',
};

/** A donut chart of 獲獎紀錄 by 類別, with a direct-labeled legend (name, count, and share) so identity never rests on color alone. */
export function AwardCategoryDonut({ data }) {
  if (data.length === 0) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無獲獎資料可供統計。</div>;
  }
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const size = 160;
  const radius = 54;
  const ringWidth = 20;
  const circumference = 2 * Math.PI * radius;
  let drawn = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="獲獎項目依類別分布圓環圖">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEEBE2" strokeWidth={ringWidth} />
          {data.map((d) => {
            const length = (d.count / total) * circumference;
            // A small surface-color gap between slices reads as separation without drawing a border.
            const visibleLength = Math.max(length - 2, 0);
            const dashoffset = -drawn;
            drawn += length;
            return (
              <circle
                key={d.category}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={AWARD_CATEGORY_COLORS[d.category] || AWARD_CATEGORY_COLORS.其他}
                strokeWidth={ringWidth}
                strokeDasharray={`${visibleLength} ${circumference - visibleLength}`}
                strokeDashoffset={dashoffset}
              />
            );
          })}
        </g>
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" style={{ font: '800 20px Inter, sans-serif', fill: '#1E2420' }}>{total}</text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" style={{ font: "500 10.5px 'Noto Sans TC', sans-serif", fill: '#8A9089' }}>筆獲獎</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((d) => (
          <div key={d.category} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 3, flex: 'none',
              background: AWARD_CATEGORY_COLORS[d.category] || AWARD_CATEGORY_COLORS.其他,
            }}
            />
            <span style={{ font: "600 12.5px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>{d.category}</span>
            <span style={{ font: '700 12px Inter, sans-serif', color: '#454B45' }}>{d.count} 筆</span>
            <span style={{ font: "500 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>（{d.pct}%）</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A horizontal bar list of 獲獎紀錄 by 等級, sorted by count — levels are free-form so there's no fixed category order to preserve, magnitude order is the useful one. */
export function AwardLevelBars({ data }) {
  if (data.length === 0) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無獲獎資料可供統計。</div>;
  }
  const max = Math.max(...data.map((d) => d.count));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      {data.map((d) => (
        <div key={d.level} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 32px', alignItems: 'center', gap: 10 }}>
          <span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#454B45' }}>{d.level}</span>
          <div style={{ height: 14, background: '#F0EEE6', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(d.count / max) * 100}%`, background: '#1F5F52', borderRadius: 7 }} />
          </div>
          <span style={{ font: '700 12px Inter, sans-serif', color: '#1E2420', textAlign: 'right' }}>{d.count}</span>
        </div>
      ))}
    </div>
  );
}

// Fixed SPECIAL_NEEDS_CATEGORIES order (原住民/新住民/低收入戶/身障生/單親生);
// a ring-adjacent (not all-pairs) CVD check is the right standard here since
// the donut always renders these 5 in this same fixed order, so only true
// neighbors — including the wrap from 單親生 back to 原住民 — ever touch.
// All 5 ring-adjacent pairs, in both light and dark steps, clear the CVD and
// normal-vision floors. A category outside the fixed 5 (custom 其他自訂)
// falls back to neutral gray rather than a 6th hue.
const SPECIAL_NEEDS_CATEGORY_COLORS = {
  原住民: '#2a78d6',
  新住民: '#eb6834',
  低收入戶: '#1baf7a',
  身障生: '#eda100',
  單親生: '#e87ba4',
};
const SPECIAL_NEEDS_OTHER_COLOR = '#8A9089';

/** A donut chart of 特生統計 by 類別, sized to each category's share of the whole student body (not of the displayed counts, since a student can belong to more than one category) — the unfilled ring is the rest of the student body. */
export function SpecialNeedsDonut({ data, totalStudents }) {
  if (data.length === 0) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無特生統計資料可供統計。</div>;
  }
  if (!totalStudents) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚未填寫學生人數（基本資料），無法計算佔全體學生的百分比。</div>;
  }
  const size = 160;
  const radius = 54;
  const ringWidth = 20;
  const circumference = 2 * Math.PI * radius;
  let drawn = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="特生統計依類別佔全體學生百分比圓環圖">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEEBE2" strokeWidth={ringWidth} />
          {data.map((d) => {
            // Categories can overlap (a student may count under more than
            // one), so clamp each slice to whatever ring length remains
            // rather than letting the total run past a full circle.
            const rawLength = (d.count / totalStudents) * circumference;
            const length = Math.max(Math.min(rawLength, circumference - drawn), 0);
            const visibleLength = Math.max(length - 2, 0);
            const dashoffset = -drawn;
            drawn += length;
            return (
              <circle
                key={d.category}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={SPECIAL_NEEDS_CATEGORY_COLORS[d.category] || SPECIAL_NEEDS_OTHER_COLOR}
                strokeWidth={ringWidth}
                strokeDasharray={`${visibleLength} ${circumference - visibleLength}`}
                strokeDashoffset={dashoffset}
              />
            );
          })}
        </g>
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" style={{ font: '800 20px Inter, sans-serif', fill: '#1E2420' }}>{totalStudents}</text>
        <text x={size / 2} y={size / 2 + 14} textAnchor="middle" style={{ font: "500 10.5px 'Noto Sans TC', sans-serif", fill: '#8A9089' }}>學生總數</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((d) => (
          <div key={d.category} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 3, flex: 'none',
              background: SPECIAL_NEEDS_CATEGORY_COLORS[d.category] || SPECIAL_NEEDS_OTHER_COLOR,
            }}
            />
            <span style={{ font: "600 12.5px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>{d.category}</span>
            <span style={{ font: '700 12px Inter, sans-serif', color: '#454B45' }}>{d.count} 人</span>
            <span style={{ font: "500 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>（佔全體學生 {d.pct}%）</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A single ratio against a limit (社團參與人次 ÷ 全體學生) reads as a
 * meter, not a pie — per the dataviz skill's own guidance table, a pie of
 * 2 slices is the wrong form for this job.
 */
export function ClubParticipationMeter({ stats }) {
  const { totalParticipants, totalStudents, pct } = stats;
  if (!totalStudents) {
    return <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚未填寫學生人數（基本資料），無法計算比例。</div>;
  }
  const { track, fill } = progressBar(Math.min(pct, 100), '#4F8C3E');
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ font: "600 12.5px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
          社團參與人次 {totalParticipants} 人次／全校學生 {totalStudents} 人
        </span>
        <span style={{ font: '800 20px Inter, sans-serif', color: '#1E2420' }}>{pct}%</span>
      </div>
      <div style={track}><div style={fill} /></div>
      <div style={{ font: "400 11px 'Noto Sans TC', sans-serif", color: '#8A9089', marginTop: 6 }}>
        以社團參與人次計算；同一學生參加多個社團會重複計入，並非不重複學生人數。
      </div>
    </div>
  );
}

const OPTIONAL_MODULE_CHOICES = [
  { key: 'library', label: '圖書藏書量' },
  { key: 'language', label: '族語開班' },
  { key: 'specialNeeds', label: '特生統計' },
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
  const languageCertState = useYearRecords(year, 'languageCert');
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
  const [preview, setPreview] = useState(null);
  const selectedModules = OPTIONAL_MODULE_CHOICES.map((m) => m.key).filter((key) => selected[key]);

  const sourceStates = [
    basicState, libraryState, budgetState, languageState, languageCertState, specialNeedsState,
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
  const activeAwards = (awardsState.data || []).filter((r) => !r.deletedAt);
  const awardCategoryStats = summarizeByCategory(activeAwards);
  const awardLevelStats = summarizeByLevel(activeAwards);
  const activeSpecialNeeds = (specialNeedsState.data || []).filter((r) => !r.deletedAt);
  const totalStudents = Number(basicState.data?.students) || 0;
  const specialNeedsStats = summarizeSpecialNeeds(activeSpecialNeeds, totalStudents);
  const activeClubs = (clubState.data || []).filter((r) => !r.deletedAt);
  const clubParticipationStats = summarizeClubParticipation(activeClubs, totalStudents);
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
    language: languageRecordSummary([
      ...(languageState.data || []),
      ...(languageCertState.data || []),
    ]),
    specialNeedsRows: activeSpecialNeeds,
    awardsRows: activeAwards,
    clubRows: activeClubs,
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

  // Preview-before-download: build the same PDF/Excel a click would export,
  // show it, and only actually download (via the authorized handlers above)
  // once the user confirms — so 匯出 never fires blind.
  const closePreview = () => {
    if (preview?.kind === 'pdf' && preview.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };
  const openPdfPreview = () => runAuthorized(() => authorizeModule('report'), async () => {
    const doc = await buildOverviewPdf(report, { selectedModules });
    setPreview({ kind: 'pdf', name: `${year}年度基金總覽報表.pdf`, url: doc.output('bloburl') });
  });
  const openExcelPreview = () => runAuthorized(() => authorizeModule('report'), async () => {
    const wb = buildOverviewWorkbook(report, { selectedModules });
    const html = XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[0]]);
    setPreview({ kind: 'excel', name: `${year}年度議會報表.xlsx`, html });
  });
  const confirmPreview = async () => {
    const kind = preview?.kind;
    closePreview();
    if (kind === 'excel') await exportExcel(false);
    else if (kind === 'pdf') await exportPdf();
  };

  return (
    <div>
      <div style={pageTitle}>議會報表匯出</div>
      <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 18 }}>{year}年度 · 利澤國小基金總覽（議會用）</div>

      <div style={sectionLabel}>關鍵指標</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20, maxWidth: 900 }}>
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
      <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 640, marginBottom: 20 }} className="table-scroll">
        <div style={{ minWidth: 420 }}>
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
      </div>

      <div style={sectionLabel}>業務計畫別預算與決算（千元）</div>
      <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 900, marginBottom: 8 }} className="table-scroll">
        <div style={{ minWidth: 620 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 24, maxWidth: 900 }}>
        {OPTIONAL_MODULE_CHOICES.filter((m) => selected[m.key] && report.modules[m.key]).map((m) => {
          const color = OPTIONAL_MODULE_COLORS[m.key] || '#1F5F52';
          const fields = OPTIONAL_MODULE_DETAIL_FIELDS[m.key] || [];
          const detailRows = report.modules[m.key].rows || [];
          const columns = fields.map(() => '1fr').join(' ');
          return (
            <div key={m.key} style={{ border: '1px solid #E3DFD3', borderLeft: `4px solid ${color}`, borderRadius: 9, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px' }}>
                <div style={{ font: "600 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>{m.label}</div>
                <div style={{ font: '800 17px Inter, sans-serif' }}>{moduleValueText(m.key)}</div>
              </div>
              {detailRows.length > 0 && (
                <div style={{ borderTop: '1px solid #EEEBE2' }} className="table-scroll">
                  <div style={{ minWidth: fields.length * 110 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: columns, padding: '6px 14px', background: '#F5F3EE', font: "700 10.5px 'Noto Sans TC', sans-serif", color: '#6B726A' }}>
                      {fields.map((field) => <span key={field.key}>{field.label}</span>)}
                    </div>
                    {detailRows.map((row, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: columns, padding: '6px 14px', borderTop: '1px solid #EEEBE2', font: "500 11.5px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
                        {fields.map((field) => <span key={field.key}>{row[field.key] == null || row[field.key] === '' ? '—' : row[field.key]}</span>)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={sectionLabel}>獲獎項目統計分析</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24, maxWidth: 900 }}>
        <div style={card}>
          <div style={{ font: "700 12.5px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 14 }}>依類別分布</div>
          <AwardCategoryDonut data={awardCategoryStats} />
        </div>
        <div style={card}>
          <div style={{ font: "700 12.5px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 14 }}>依等級分布</div>
          <AwardLevelBars data={awardLevelStats} />
        </div>
      </div>

      <div style={sectionLabel}>特生統計分析</div>
      <div style={{ ...card, marginBottom: 24, maxWidth: 900 }}>
        <SpecialNeedsDonut data={specialNeedsStats} totalStudents={totalStudents} />
      </div>

      <div style={sectionLabel}>社團參與比例</div>
      <div style={{ ...card, marginBottom: 24, maxWidth: 900 }}>
        <ClubParticipationMeter stats={clubParticipationStats} />
      </div>

      <div style={sectionLabel}>匯出格式</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={btnOutline} onClick={openExcelPreview}>匯出 Excel（全貌總覽）</div>
        <div style={btnOutline} onClick={() => exportExcel(true)}>對齊議會既有格式（.xls 範本）</div>
        <div style={btnPrimary} onClick={openPdfPreview}>匯出 PDF（全貌總覽）</div>
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

      {preview && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(20,20,16,.45)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
        >
          <div style={{
            background: '#fff', borderRadius: 12, width: 'min(920px, 100%)', maxHeight: '88vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '14px 18px', borderBottom: '1px solid #E3DFD3' }}>
              <div style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>預覽：{preview.name}</div>
              <div style={{ font: "400 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>確認內容無誤後再下載</div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: '#F5F3EE' }} className="table-scroll">
              {preview.kind === 'pdf' ? (
                <iframe title="PDF 預覽" src={preview.url} style={{ width: '100%', height: '70vh', border: 0, display: 'block' }} />
              ) : (
                <div
                  style={{ padding: 16, font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#1E2420' }}
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '14px 18px', borderTop: '1px solid #E3DFD3' }}>
              <div style={btnPrimary} onClick={confirmPreview}>確認下載</div>
              <div style={btnSecondary} onClick={closePreview}>取消</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
