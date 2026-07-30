import { useYearModule } from '../hooks/useYearData';
import { fmtNum } from '../lib/format';
import { pageTitle, pageSubtitle, card, btnOutline, progressBar } from '../styles';

export default function BudgetBook({ year }) {
  const { data: budget } = useYearModule(year, 'budget');
  const { data: meta } = useYearModule(year, 'budgetbook');

  const expenseRows = budget?.expense?.breakdown || [];
  const revenueRows = budget?.revenue?.rows || [];
  const expenseTotal = expenseRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const revenueTotal = revenueRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const shortfall = revenueTotal - expenseTotal;

  return (
    <div>
      <div style={pageTitle}>{year}年度預算書</div>
      <div style={pageSubtitle}>依原始預算書內容摘要陳現，供議會對照全文 PDF</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 720, marginBottom: 20 }}>
        <div style={card}>
          <div style={{ font: "700 13px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 10 }}>收支平衡表</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #EEEBE2', font: "500 13px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
            <span>基金來源合計（歲入）</span><span style={{ font: '700 13px Inter, sans-serif', color: '#1E2420' }}>{fmtNum(revenueTotal)} 千元</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #EEEBE2', font: "500 13px 'Noto Sans TC', sans-serif", color: '#454B45' }}>
            <span>基金用途合計（歲出）</span><span style={{ font: '700 13px Inter, sans-serif', color: '#1E2420' }}>{fmtNum(expenseTotal)} 千元</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #1F5F52', font: "800 13px 'Noto Sans TC', sans-serif", color: '#1F5F52' }}>
            <span>本期{shortfall < 0 ? '短絀' : '賸餘'}（{shortfall < 0 ? '移用以前年度基金餘額支應' : '併入以後年度基金餘額'}）</span>
            <span style={{ font: '800 13px Inter, sans-serif' }}>{fmtNum(shortfall)}</span>
          </div>
        </div>
        <div style={card}>
          <div style={{ font: "700 13px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 4 }}>基金別</div>
          <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 10 }}>{meta?.fundName || '利澤國小校務基金'}</div>
          <div style={{ font: "700 13px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 4 }}>審議機關</div>
          <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>{meta?.reviewAuthority || '宜蘭縣議會'}</div>
        </div>
      </div>

      <div style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 10 }}>業務計畫別預算分析（歲出，依原預算書分類）</div>
      <div style={{ ...card, maxWidth: 640, marginBottom: 20 }}>
        {expenseRows.length === 0 && <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>尚無資料</div>}
        {expenseRows.map((bi) => {
          const pct = expenseTotal ? Math.round((Number(bi.amount || 0) / expenseTotal) * 100) : 0;
          const { track, fill } = progressBar(pct, '#1F5F52');
          return (
            <div key={bi.label} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: "500 12.5px 'Noto Sans TC', sans-serif", color: '#454B45', marginBottom: 5 }}>
                <span>{bi.label}</span><span>{fmtNum(bi.amount)} 千元（{pct}%）</span>
              </div>
              <div style={{ ...track, height: 8 }}><div style={fill} /></div>
            </div>
          );
        })}
      </div>

      {meta?.pdfUrl ? (
        <a href={meta.pdfUrl} target="_blank" rel="noreferrer" style={btnOutline}>下載原始預算書 PDF 全文</a>
      ) : (
        <div style={{ ...btnOutline, opacity: .6, cursor: 'not-allowed' }} title="尚未上傳 PDF 全文">下載原始預算書 PDF 全文</div>
      )}
    </div>
  );
}
