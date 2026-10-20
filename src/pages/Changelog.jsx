import { CHANGELOG } from '../lib/appInfo';
import { pageTitle, pageSubtitle } from '../styles';

// Soft entry backgrounds cycled by position (newest first) purely so
// consecutive releases are easy to tell apart at a glance while scanning —
// the version badge itself stays a fixed brand color for identity.
const ENTRY_BACKGROUNDS = ['#EFF6F3', '#FBF3E9', '#F3EEF8', '#EDF4F8', '#FBEFF0', '#F1F6EC'];

// No canEditModule check here on purpose — release notes are visible to
// every signed-in user regardless of their module permissions.
export default function Changelog() {
  const entries = [...CHANGELOG].reverse();

  return (
    <div>
      <div style={pageTitle}>更新日誌</div>
      <div style={pageSubtitle}>系統每次修正或新增功能的紀錄，由新到舊排列</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
        {entries.map((entry, i) => (
          <div
            key={entry.version}
            style={{
              display: 'flex', gap: 16, alignItems: 'flex-start',
              background: ENTRY_BACKGROUNDS[i % ENTRY_BACKGROUNDS.length],
              border: '1px solid #E3DFD3', borderRadius: 10, padding: '16px 18px',
            }}
          >
            <div style={{
              flex: '0 0 auto', width: 56, height: 40, borderRadius: 8,
              background: '#1F5F52', color: '#fff', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              font: "800 14px Inter, sans-serif", letterSpacing: '0.2px',
            }}
            >
              v{entry.version}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "500 12px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 6 }}>{entry.date}</div>
              <div style={{ font: "400 13.5px/1.8 'Noto Sans TC', sans-serif", color: '#454B45' }}>{entry.notes}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
