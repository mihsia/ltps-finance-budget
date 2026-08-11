import { useYearModule, useYearRecords } from '../hooks/useYearData';
import { fmtNum } from '../lib/format';
import { moduleCompletionPct, completionColor } from '../lib/completion';
import { budgetRecordSummary, languageRecordSummary } from '../lib/recordDerivations';
import { pageTitle, pageSubtitle, statTile, card, sectionLabel, progressBar } from '../styles';

const COMPLETION_MODULES = [
  { key: 'basic', label: '學校基本資料' },
  { key: 'specialNeeds', label: '特生統計' },
  { key: 'budget', label: '預算數' },
  { key: 'library', label: '圖書館藏書' },
  { key: 'language', label: '本土語開班' },
  { key: 'awards', label: '獲獎紀錄' },
  { key: 'club', label: '課後社團' },
  { key: 'land', label: '土地公告現值' },
  { key: 'inquiry', label: '議會質詢答詢' },
];

export default function Dashboard({ years, latestYear }) {
  const trendYears = years.length >= 3 ? years.slice(-3) : [...Array(3 - years.length).fill(years[0]), ...years];
  const budgetA = useYearRecords(trendYears[0], 'budget');
  const budgetB = useYearRecords(trendYears[1], 'budget');
  const budgetC = useYearRecords(trendYears[2], 'budget');
  const basic = useYearModule(latestYear, 'basic');
  const library = useYearModule(latestYear, 'library');
  const language = useYearRecords(latestYear, 'language');
  const modules = {
    basic, budget: budgetC, library, language,
    awards: useYearRecords(latestYear, 'awards'),
    club: useYearRecords(latestYear, 'club'),
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

  return (
    <div>
      <div style={pageTitle}>總覽 Dashboard</div>
      <div style={pageSubtitle}>跨年度總覽，不受上方年度切換影響</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
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
        <div style={sectionLabel}>各模組填報進度（{latestYear}年度）</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 28px' }}>
          {COMPLETION_MODULES.map((c) => {
            const pct = moduleCompletionPct(c.key, modules[c.key].data);
            const { track, fill } = progressBar(pct, completionColor(pct));
            return (
              <div key={c.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', font: "500 12.5px 'Noto Sans TC', sans-serif", color: '#454B45', marginBottom: 5 }}>
                  <span>{c.label}</span><span>{pct}%</span>
                </div>
                <div style={track}><div style={fill} /></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
