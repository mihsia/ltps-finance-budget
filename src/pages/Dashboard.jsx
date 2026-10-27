import { useYearModule, useYearRecords } from '../hooks/useYearData';
import { fmtNum } from '../lib/format';
import { activeTypedRecords, budgetRecordSummary, languageRecordSummary } from '../lib/recordDerivations';
import { summarizeInquiryResolution } from '../lib/inquiryStats';
import { OPTIONAL_MODULE_TILE_COLORS, moduleValueText } from '../lib/overviewReport';
import { pageTitle, pageSubtitle, statTile, card, sectionLabel, progressBar } from '../styles';

// 族語認證 isn't one of the 選填模組 report cards (no OPTIONAL_MODULE_TILE_COLORS
// entry / moduleValueText case), so it carries its own tile colour here —
// the same soft/ink pair as its sidebar icon (src/lib/nav.js).
const LANGUAGE_CERT_TILE = { soft: '#E3F2F1', ink: '#1C5C5A' };

// 各模組現況: the 7 選填模組 not already covered by a dashboard KPI tile or
// chart (圖書藏書量 and 族語開班 have their own spot above), each paired
// with the module key its headline number is keyed under in `moduleValueText`.
const MODULE_SUMMARY_KEYS = ['specialNeeds', 'awards', 'club', 'careSupport', 'land', 'inquiry'];

export default function Dashboard({ years, latestYear }) {
  const trendYears = years.length >= 3 ? years.slice(-3) : [...Array(3 - years.length).fill(years[0]), ...years];
  const budgetA = useYearRecords(trendYears[0], 'budget');
  const budgetB = useYearRecords(trendYears[1], 'budget');
  const budgetC = useYearRecords(trendYears[2], 'budget');
  const basic = useYearModule(latestYear, 'basic');
  const library = useYearModule(latestYear, 'library');
  const language = useYearRecords(latestYear, 'language');
  const modules = {
    languageCert: useYearRecords(latestYear, 'languageCert'),
    awards: useYearRecords(latestYear, 'awards'),
    club: useYearRecords(latestYear, 'club'),
    careSupport: useYearRecords(latestYear, 'careSupport'),
    land: useYearRecords(latestYear, 'land'),
    inquiry: useYearRecords(latestYear, 'inquiry'),
    specialNeeds: useYearRecords(latestYear, 'specialNeeds'),
  };

  const expenseTotalOf = (state) => (
    state.loading || state.error ? null : budgetRecordSummary(state.data).expenseTotal
  );
  const trendData = [
    { year: trendYears[0], state: budgetA },
    { year: trendYears[1], state: budgetB },
    { year: trendYears[2], state: budgetC },
  ];
  const budgetByYear = Object.fromEntries(trendData.map((t) => [t.year, expenseTotalOf(t.state)]));
  const budgetMax = Math.max(...trendYears.map((y) => budgetByYear[y] || 0), 1);
  const totalLatest = budgetByYear[latestYear];
  const totalPrev = budgetByYear[trendYears[trendYears.length - 2]];
  const pctChange = (totalLatest != null && totalPrev) ? (((totalLatest - totalPrev) / totalPrev) * 100).toFixed(2) : null;

  const staff = basic.data || {};
  const substituteTotal = Number(staff.substituteVacancy || 0) + Number(staff.substituteAdditional || 0);
  const teacherTotal = Number(staff.regularTeachers || 0) + substituteTotal + Number(staff.partTimeTeachers || 0);
  const substituteRatio = teacherTotal ? Math.round((substituteTotal / teacherTotal) * 100) : null;

  const langClasses = language.loading || language.error
    ? []
    : languageRecordSummary(language.data).classRows;
  const langMax = Math.max(...langClasses.map((l) => Number(l.students || 0)), 1);

  // 各模組現況 + 待辦／需留意: every number below is derived straight from
  // this year's active (non-deleted) records, the same way Report.jsx and
  // overviewReport.js's buildOverviewReport() do it — so these never drift
  // from what the 報表匯出頁／PDF show for the same module (2026-10-27 設計定案).
  const activeOf = (key) => activeTypedRecords(modules[key].data);

  const specialNeedsRows = activeOf('specialNeeds');
  const specialNeedsTotal = specialNeedsRows.reduce((sum, r) => sum + Number(r.count || 0), 0);
  const specialNeedsPct = staff.students ? ((specialNeedsTotal / Number(staff.students)) * 100).toFixed(1) : null;

  const awardsRows = activeOf('awards');
  const awardsByCategory = awardsRows.reduce((acc, r) => {
    if (!r.category) return acc;
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {});
  const topAwardCategory = Object.entries(awardsByCategory).sort((a, b) => b[1] - a[1])[0];

  const clubRows = activeOf('club');
  const clubParticipants = clubRows.reduce((sum, r) => sum + Number(r.participants || 0), 0);

  const careSupportRows = activeOf('careSupport');
  const careSupportParticipants = careSupportRows.reduce((sum, r) => sum + Number(r.participants || 0), 0);

  const landRows = activeOf('land');
  const landAreaTotal = landRows.reduce((sum, r) => sum + Number(r.area || 0), 0);

  const inquiryRows = activeOf('inquiry');
  const inquiryResolution = summarizeInquiryResolution(inquiryRows);
  const inquiryUnresolved = inquiryResolution.total - inquiryResolution.resolved;

  const certRosterRows = activeTypedRecords(modules.languageCert.data, 'roster');
  const certLangCount = new Set(certRosterRows.map((r) => r.lang).filter(Boolean)).size;

  const moduleSummaries = {
    specialNeeds: { total: specialNeedsTotal },
    awards: { count: awardsRows.length },
    club: { count: clubRows.length },
    careSupport: { count: careSupportRows.length },
    land: { count: landRows.length },
    inquiry: inquiryResolution,
  };
  const moduleSubtext = {
    specialNeeds: specialNeedsPct != null ? `占全體學生 ${specialNeedsPct}%` : null,
    awards: topAwardCategory ? `${topAwardCategory[0]}最多・${topAwardCategory[1]}筆` : null,
    club: clubParticipants ? `參與 ${fmtNum(clubParticipants)} 人` : null,
    careSupport: careSupportParticipants ? `共 ${fmtNum(careSupportParticipants)} 人` : null,
    land: landAreaTotal ? `總面積 ${fmtNum(landAreaTotal)} ㎡` : null,
    inquiry: inquiryResolution.total === 0 ? null : (inquiryUnresolved > 0 ? `尚有 ${inquiryUnresolved} 筆待回覆` : '本年度已全部結案'),
  };
  const moduleLabels = {
    specialNeeds: '特生統計', awards: '獲獎紀錄', club: '課後社團',
    careSupport: '課照學扶', land: '校地概況', inquiry: '議會質詢',
  };

  const revenueTotal = budgetC.loading || budgetC.error ? null : budgetRecordSummary(budgetC.data).revenueTotal;
  const shortfall = (totalLatest != null && revenueTotal != null) ? revenueTotal - totalLatest : null;

  // 待辦／需留意: only real, actionable states — never a routine "一切正常"
  // confirmation — so the whole block disappears on a normal day instead of
  // permanently occupying space (使用者 2026-10-27 回饋：填報進度 100% 長期
  // 不具意義，希望改成「現在該注意什麼」).
  const alertItems = [];
  if (inquiryUnresolved > 0) {
    alertItems.push({
      tone: 'warn',
      title: `議會質詢尚有 ${inquiryUnresolved} 筆未結案`,
    });
  }
  if (shortfall != null && shortfall < 0) {
    alertItems.push({
      tone: 'danger',
      title: `本期短絀 ${fmtNum(Math.abs(shortfall))} 千元，請留意`,
      detail: `${latestYear}年度歲入 ${revenueTotal != null ? fmtNum(revenueTotal) : '—'} 千元・歲出 ${fmtNum(totalLatest)} 千元`,
    });
  }

  return (
    <div>
      <div style={pageTitle}>總覽 Dashboard</div>
      <div style={pageSubtitle}>跨年度總覽，不受上方年度切換影響</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={statTile}>
          <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 8 }}>{latestYear}年度預算</div>
          <div style={{ font: '800 24px Inter, sans-serif', color: '#1E2420' }}>
            {totalLatest != null ? fmtNum(totalLatest) : '—'}<span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#8A9089' }}> 千元</span>
          </div>
          <div style={{ font: '600 11.5px Inter, sans-serif', color: pctChange < 0 ? '#B5533E' : '#2F8F5B', marginTop: 4 }}>
            {pctChange != null ? `${pctChange < 0 ? '▼' : '▲'} ${Math.abs(pctChange)}% 較${trendYears[trendYears.length - 2]}年度` : '尚無比較資料'}
          </div>
        </div>
        <div style={statTile}>
          <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 8 }}>學生人數</div>
          <div style={{ font: '800 24px Inter, sans-serif', color: '#1E2420' }}>
            {staff.students ? fmtNum(staff.students) : '—'}<span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#8A9089' }}> 人 · {staff.classes || '—'}班</span>
          </div>
          <div style={{ font: '600 11.5px Inter, sans-serif', color: '#8A9089', marginTop: 4 }}>員額 {staff.staff || '—'} 人</div>
        </div>
        <div style={statTile}>
          <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 8 }}>代理教師占比</div>
          <div style={{ font: '800 24px Inter, sans-serif', color: '#1E2420' }}>
            {substituteRatio != null ? substituteRatio : '—'}<span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>%</span>
          </div>
          <div style={{ font: '600 11.5px Inter, sans-serif', color: '#8A9089', marginTop: 4 }}>{substituteTotal || 0} / {teacherTotal || 0} 人</div>
        </div>
        <div style={statTile}>
          <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 8 }}>圖書藏書量</div>
          <div style={{ font: '800 24px Inter, sans-serif', color: '#1E2420' }}>
            {library.data ? fmtNum(Number(library.data.generalBooks || 0) + Number(library.data.indigenousBooks || 0)) : '—'}<span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#8A9089' }}> 冊</span>
          </div>
          <div style={{ font: '600 11.5px Inter, sans-serif', color: '#2F8F5B', marginTop: 4 }}>
            {library.data ? `含族語書籍 ${fmtNum(library.data.indigenousBooks || 0)} 冊` : ''}
          </div>
        </div>
      </div>

      {alertItems.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionLabel}>待辦／需留意</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {alertItems.map((a) => {
              const tone = a.tone === 'danger'
                ? { bg: '#FBEAE2', border: '#F0C3A8', dot: '#B5533E', title: '#7A3A1E', detail: '#8A5A3E' }
                : { bg: '#FDF6DC', border: '#F0E3A8', dot: '#B8860B', title: '#6B5A0A', detail: '#8A7A2E' };
              return (
                <div key={a.title} style={{ display: 'flex', alignItems: 'center', gap: 10, background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 9, padding: '10px 14px', flex: '1 1 280px' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: tone.dot, flex: 'none' }} />
                  <div>
                    <div style={{ font: "700 12.5px 'Noto Sans TC', sans-serif", color: tone.title }}>{a.title}</div>
                    {a.detail && <div style={{ font: "400 11px 'Noto Sans TC', sans-serif", color: tone.detail, marginTop: 1 }}>{a.detail}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div style={card}>
          <div style={{ font: "700 13.5px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 16 }}>年度預算趨勢（千元）</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, height: 140, padding: '0 8px' }}>
            {trendYears.map((y) => {
              const val = budgetByYear[y];
              const h = val ? Math.round((val / budgetMax) * 100) : 4;
              const active = y === latestYear;
              return (
                <div key={y} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
                  <div style={{ font: '700 12px Inter, sans-serif', color: '#1E2420' }}>{val != null ? fmtNum(val) : '—'}</div>
                  <div style={{ width: 44, height: h, borderRadius: '6px 6px 2px 2px', background: active ? '#1F5F52' : '#CFE0D8' }} />
                  <div style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>{y}年</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={card}>
          <div style={{ font: "700 13.5px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 14 }}>本土語開班人數分布</div>
          {langClasses.length === 0 && <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無資料</div>}
          {langClasses.map((l) => {
            const { track, fill } = progressBar(Math.round((Number(l.students || 0) / langMax) * 100), '#1F5F52');
            return (
              <div key={l.lang} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', font: "500 12px 'Noto Sans TC', sans-serif", color: '#454B45', marginBottom: 5 }}>
                  <span>{l.lang}</span><span>{l.students} 人</span>
                </div>
                <div style={track}><div style={fill} /></div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <div style={sectionLabel}>各模組現況（{latestYear}年度）</div>
          <div style={{ font: "400 10.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>沿用報表頁／PDF 匯出同一組數字</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {MODULE_SUMMARY_KEYS.map((key) => {
            const tile = OPTIONAL_MODULE_TILE_COLORS[key] || { soft: '#E9F1EE', ink: '#0F3A30' };
            const sub = moduleSubtext[key];
            return (
              <div key={key} style={{ background: tile.soft, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ font: "600 10.5px 'Noto Sans TC', sans-serif", color: tile.ink, opacity: 0.85, marginBottom: 5 }}>{moduleLabels[key]}</div>
                <div style={{ font: '800 17px Inter, sans-serif', color: tile.ink }}>{moduleValueText(key, moduleSummaries[key])}</div>
                {sub && <div style={{ font: "500 10px 'Noto Sans TC', sans-serif", color: tile.ink, opacity: 0.75, marginTop: 2 }}>{sub}</div>}
              </div>
            );
          })}
          <div style={{ background: LANGUAGE_CERT_TILE.soft, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ font: "600 10.5px 'Noto Sans TC', sans-serif", color: LANGUAGE_CERT_TILE.ink, opacity: 0.85, marginBottom: 5 }}>族語認證</div>
            <div style={{ font: '800 17px Inter, sans-serif', color: LANGUAGE_CERT_TILE.ink }}>{certRosterRows.length} 人</div>
            {certLangCount > 0 && <div style={{ font: "500 10px 'Noto Sans TC', sans-serif", color: LANGUAGE_CERT_TILE.ink, opacity: 0.75, marginTop: 2 }}>涵蓋 {certLangCount} 語系</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
