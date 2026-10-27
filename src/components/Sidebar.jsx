import { navGroups, icons } from '../lib/nav';
import { APP_UPDATED_AT, APP_VERSION } from '../lib/appInfo';

export default function Sidebar({ nav, setNav, open = false, onClose }) {
  const select = (key) => {
    setNav(key);
    if (onClose) onClose();
  };

  return (
    <div className={`app-sidebar${open ? ' is-open' : ''}`}>
      {navGroups.map((grp) => (
        <div key={grp.label} style={{ marginBottom: 20 }}>
          <div style={{
            font: "700 11px Inter, sans-serif", letterSpacing: '.08em', color: '#9BA097',
            textTransform: 'uppercase', padding: '0 10px', marginBottom: 8,
          }}>
            {grp.label}
          </div>
          {grp.items.map((it) => {
            const active = nav === it.key;
            return (
              <div
                key={it.key}
                onClick={() => select(it.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px',
                  borderRadius: 9, cursor: 'pointer', marginBottom: 2,
                  font: `${active ? 700 : 500} 13px 'Noto Sans TC', sans-serif`,
                  color: active ? it.ink : '#454B45',
                  background: active ? it.soft : 'transparent',
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: 8, flex: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? it.ink : it.soft,
                }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill={active ? '#FFFFFF' : it.ink}>
                    <path d={icons[it.icon]} />
                  </svg>
                </div>
                <span>{it.label}</span>
              </div>
            );
          })}
        </div>
      ))}
      <div
        onClick={() => select('changelog')}
        style={{
          marginTop: 8, paddingTop: 14, borderTop: '1px solid #E3DFD3',
          cursor: 'pointer', textAlign: 'center',
          display: 'flex', flexDirection: 'column', gap: 2,
          font: "400 11px 'Noto Sans TC', sans-serif", color: '#9BA097',
        }}
      >
        <span>系統版本 v{APP_VERSION}</span>
        <span>{APP_UPDATED_AT}</span>
      </div>
    </div>
  );
}
