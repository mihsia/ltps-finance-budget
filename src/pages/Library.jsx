import { useEffect, useState } from 'react';
import { useYearModule } from '../hooks/useYearData';
import { useAuth } from '../contexts/AuthContext';
import { runAuthorized } from '../lib/accessPolicy';
import { pageTitle, pageSubtitle, card, input, label, btnPrimary, btnSecondary, emptyState } from '../styles';

export default function Library({ year, latestYear }) {
  const { data, loading, save, copyFrom } = useYearModule(year, 'library');
  const { canEditModule, authorizeModule } = useAuth();
  const isEditableYear = year === latestYear;
  const canEdit = canEditModule('library') && isEditableYear;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  useEffect(() => {
    setForm(data || { generalBooks: '', indigenousBooks: '' });
    setEditing(false);
  }, [data]);

  if (!form) return null;

  const copyLatestYear = () => runAuthorized(
    () => authorizeModule('library'),
    () => copyFrom(latestYear),
  );
  const commit = () => runAuthorized(
    () => authorizeModule('library'),
    async () => {
      await save(form);
      setEditing(false);
    },
  );

  if (!isEditableYear && !data) {
    return (
      <div>
        <div style={pageTitle}>圖書館藏書量</div>
        <div style={pageSubtitle}>負責人：圖書館 · {year}年度</div>
        <div style={emptyState}>
          <div style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420', marginBottom: 6 }}>{year}年度尚未建立此模組資料</div>
          <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 16 }}>可從 {latestYear} 年度複製資料後再修改，或手動新增</div>
          <div style={btnPrimary} onClick={copyLatestYear}>從 {latestYear} 年度複製資料</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={pageTitle}>圖書館藏書量</div>
      <div style={pageSubtitle}>負責人：圖書館 · {year}年度</div>

      {!editing ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16, maxWidth: 520 }}>
          <div style={card}>
            <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 8 }}>一般書籍</div>
            <div style={{ font: '800 26px Inter, sans-serif', color: '#1E2420' }}>
              {form.generalBooks || 0}<span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#8A9089' }}> 本</span>
            </div>
          </div>
          <div style={card}>
            <div style={{ font: "400 12.5px 'Noto Sans TC', sans-serif", color: '#6B726A', marginBottom: 8 }}>族語書籍</div>
            <div style={{ font: '800 26px Inter, sans-serif', color: '#1E2420' }}>
              {form.indigenousBooks || 0}<span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#8A9089' }}> 本</span>
            </div>
          </div>
          {canEdit && (
            <div style={{ gridColumn: '1/3' }}>
              <span onClick={() => setEditing(true)} style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#1F5F52', cursor: 'pointer' }}>編輯數量</span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...card, maxWidth: 520, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <label style={label}>一般書籍</label>
            <input style={input} value={form.generalBooks} onChange={(e) => setForm((s) => ({ ...s, generalBooks: e.target.value }))} />
          </div>
          <div>
            <label style={label}>族語書籍</label>
            <input style={input} value={form.indigenousBooks} onChange={(e) => setForm((s) => ({ ...s, indigenousBooks: e.target.value }))} />
          </div>
          <div style={{ gridColumn: '1/3', display: 'flex', gap: 10 }}>
            <div style={btnPrimary} onClick={commit}>儲存</div>
            <div style={btnSecondary} onClick={() => { setForm(data || { generalBooks: '', indigenousBooks: '' }); setEditing(false); }}>取消</div>
          </div>
        </div>
      )}
    </div>
  );
}
