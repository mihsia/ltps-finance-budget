import { navGroups, icons } from '../lib/nav';

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
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
                  borderRadius: 8, cursor: 'pointer', marginBottom: 2,
                  font: `${active ? 700 : 500} 13px 'Noto Sans TC', sans-serif`,
                  color: active ? it.color : '#454B45',
                  background: active ? `${it.color}18` : 'transparent',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" style={{ flex: 'none' }} fill={it.color}>
                  <path d={icons[it.icon]} />
                </svg>
                <span>{it.label}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
