import { CHANGELOG } from '../lib/appInfo';
import { pageTitle, pageSubtitle, card } from '../styles';

// No canEditModule check here on purpose — release notes are visible to
// every signed-in user regardless of their module permissions.
export default function Changelog() {
  const entries = [...CHANGELOG].reverse();

  return (
    <div>
      <div style={pageTitle}>版本更新說明</div>
      <div style={pageSubtitle}>系統每次修正或新增功能的紀錄，由新到舊排列</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720 }}>
        {entries.map((entry) => (
          <div key={entry.version} style={card}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
              <span style={{ font: "800 16px Inter, sans-serif", color: '#1F5F52' }}>v{entry.version}</span>
              <span style={{ font: "500 12.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>{entry.date}</span>
            </div>
            <div style={{ font: "400 13.5px/1.8 'Noto Sans TC', sans-serif", color: '#454B45' }}>{entry.notes}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
