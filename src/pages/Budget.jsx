import { useEffect, useState } from 'react';
import { useYearModule } from '../hooks/useYearData';
import { useAuth } from '../contexts/AuthContext';
import { fmtNum } from '../lib/format';
import { pageTitle, pageSubtitle, card, btnPrimary, btnSecondary, input } from '../styles';

const EXPENSE_DEFAULT = [
  { label: '國民教育計畫', formula: '辦理校務行政、教學活動及各項專案計畫等', amount: 0 },
  { label: '一般行政管理計畫', formula: '教職員工人事費、歷年退休金及遺屬年金業務等', amount: 0 },
  { label: '建築及設備計畫', formula: '改善並充實學校教學及行政環境、購置設備等', amount: 0 },
];
const REVENUE_DEFAULT = [
  { label: '財產處分收入（財產報廢變賣）', amount: 0 },
  { label: '租金收入（場地使用及水電清潔費等）', amount: 0 },
  { label: '利息收入', amount: 0 },
  { label: '政府撥入收入（公庫撥款）', amount: 0 },
];

export default function Budget({ year, years, latestYear }) {
  const { data, save } = useYearModule(year, 'budget');
  // Fixed number of hook calls (rules of hooks) — shows the most recent 3 fiscal years.
  const recentYears = years.length >= 3 ? years.slice(-3) : [...Array(3 - years.length).fill(years[0]), ...years];
  const rA = useYearModule(recentYears[0], 'budget');
  const rB = useYearModule(recentYears[1], 'budget');
  const rC = useYearModule(recentYears[2], 'budget');
  const budgetByYear = { [recentYears[0]]: rA.data, [recentYears[1]]: rB.data, [recentYears[2]]: rC.data };
  const { canEditModule } = useAuth();
  const canEdit = canEditModule('budget') && year === latestYear;

  const [tab, setTab] = useState('expense');
  const [editing, setEditing] = useState(false);
  const [expenseRows, setExpenseRows] = useState(EXPENSE_DEFAULT);
  const [revenueRows, setRevenueRows] = useState(REVENUE_DEFAULT);

  useEffect(() => {
    setExpenseRows(data?.expense?.breakdown || EXPENSE_DEFAULT);
    setRevenueRows(data?.revenue?.rows || REVENUE_DEFAULT);
    setEditing(false);
  }, [data]);

  const expenseTotal = expenseRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const revenueTotal = revenueRows.reduce((s, r) => s + Number(r.amount || 0), 0);

  const yearTotal = (y) => {
    const d = budgetByYear[y];
    return d?.expense?.breakdown?.reduce((s, r) => s + Number(r.amount || 0), 0);
  };

  const commit = async () => {
    await save({ expense: { breakdown: expenseRows }, revenue: { rows: revenueRows } });
    setEditing(false);
  };

  return (
    <div>
      <div style={pageTitle}>歲入歲出（{recentYears[0]}–{recentYears[2]}年度）</div>
      <div style={pageSubtitle}>負責人：總務處 · 單位：千元 · 區分歲入／歲出 · 依{latestYear}年度預算書實際數</div>

      <div style={{ display: 'flex', gap: 6, background: '#F5F3EE', borderRadius: 8, padding: 3, width: 'fit-content', marginBottom: 20 }}>
        {[['expense', '歲出（支出）'], ['revenue', '歲入（收入）']].map(([key, lbl]) => (
          <div
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
              font: "700 12.5px 'Noto Sans TC', sans-serif",
              color: tab === key ? '#fff' : '#6B726A',
              background: tab === key ? '#1F5F52' : 'transparent',
            }}
          >
            {lbl}
          </div>
        ))}
      </div>

      {tab === 'expense' && (
        <>
          <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 640, marginBottom: 20 }}>
            {[...recentYears].reverse().map((y) => {
              const archived = y !== latestYear;
              const val = yearTotal(y);
              return (
                <div key={y} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderTop: '1px solid #EEEBE2' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>{y}年度歲出</span>
                    <span style={{ font: '700 10.5px Inter, sans-serif', padding: '3px 8px', borderRadius: 5, background: archived ? '#EDEAE2' : '#E9F1EE', color: archived ? '#8A9089' : '#1F5F52' }}>
                      {archived ? '已封存' : '編輯中'}
                    </span>
                  </div>
                  <span style={{ font: '700 16px Inter, sans-serif', color: '#1E2420' }}>{val != null ? fmtNum(val) : '—'} 千元</span>
                </div>
              );
            })}
          </div>

          <div style={{ ...card, maxWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>{year}年度業務計畫別經費分配</div>
              {canEdit && !editing && <span onClick={() => setEditing(true)} style={{ font: "600 11.5px 'Noto Sans TC', sans-serif", color: '#1F5F52', cursor: 'pointer' }}>編輯金額</span>}
            </div>
            <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 16 }}>原始預算書依「業務計畫」分三大類編列，各計畫內容如下：</div>
            {expenseRows.map((f, i) => (
              <div key={f.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderTop: '1px solid #EEEBE2' }}>
                <div>
                  <div style={{ font: "600 13px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>{f.label}</div>
                  <div style={{ font: '400 11.5px Inter, sans-serif', color: '#8A9089', marginTop: 2 }}>{f.formula}</div>
                </div>
                {editing ? (
                  <input
                    style={{ ...input, width: 120, textAlign: 'right' }}
                    value={f.amount}
                    onChange={(e) => setExpenseRows((rows) => rows.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))}
                  />
                ) : (
                  <span style={{ font: '700 14px Inter, sans-serif', color: '#1E2420' }}>{fmtNum(f.amount)}</span>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0 0', marginTop: 6, borderTop: '2px solid #1F5F52' }}>
              <span style={{ font: "800 14px 'Noto Sans TC', sans-serif", color: '#1F5F52' }}>歲出合計</span>
              <span style={{ font: '800 18px Inter, sans-serif', color: '#1F5F52' }}>{fmtNum(expenseTotal)} 千元</span>
            </div>
            {editing && (
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <div style={btnPrimary} onClick={commit}>儲存</div>
                <div style={btnSecondary} onClick={() => { setExpenseRows(data?.expense?.breakdown || EXPENSE_DEFAULT); setEditing(false); }}>取消</div>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'revenue' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 640 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', padding: '12px 18px', background: '#F5F3EE', font: "700 12px 'Noto Sans TC', sans-serif", color: '#6B726A' }}>
            <span>來源項目</span><span>金額（千元）</span>
          </div>
          {revenueRows.map((rv, i) => (
            <div key={rv.label} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', padding: '12px 18px', borderTop: '1px solid #EEEBE2', font: "500 13.5px 'Noto Sans TC', sans-serif", color: '#1E2420', alignItems: 'center' }}>
              <span>{rv.label}</span>
              {editing ? (
                <input
                  style={{ ...input, width: 120 }}
                  value={rv.amount}
                  onChange={(e) => setRevenueRows((rows) => rows.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))}
                />
              ) : (
                <span style={{ font: '700 13.5px Inter, sans-serif' }}>{fmtNum(rv.amount)}</span>
              )}
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', padding: '12px 18px', borderTop: '2px solid #1F5F52', font: "800 13.5px 'Noto Sans TC', sans-serif", color: '#1F5F52' }}>
            <span>歲入合計</span><span style={{ font: '800 14px Inter, sans-serif' }}>{fmtNum(revenueTotal)}</span>
          </div>
          {canEdit && (
            <div style={{ padding: '14px 18px' }}>
              {!editing ? (
                <span onClick={() => setEditing(true)} style={{ font: "600 11.5px 'Noto Sans TC', sans-serif", color: '#1F5F52', cursor: 'pointer' }}>編輯金額</span>
              ) : (
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={btnPrimary} onClick={commit}>儲存</div>
                  <div style={btnSecondary} onClick={() => { setRevenueRows(data?.revenue?.rows || REVENUE_DEFAULT); setEditing(false); }}>取消</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
