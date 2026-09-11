import { useAuth } from '../contexts/AuthContext';
import BrandMark from './BrandMark';

export default function Header({ year, setYear, years, onMenuClick }) {
  const { profile, user, logout } = useAuth();
  const initial = (profile?.name || user?.email || '?').trim().charAt(0);

  return (
    <div className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {onMenuClick && (
          <button
            type="button"
            aria-label="開啟選單"
            className="app-hamburger"
            onClick={onMenuClick}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="#454B45">
              <path d="M1.5 3H14.5V4.5H1.5ZM1.5 7.25H14.5V8.75H1.5ZM1.5 11.5H14.5V13H1.5Z" />
            </svg>
          </button>
        )}
        <BrandMark size={32} />
        <div style={{
          font: "700 15px 'Noto Sans TC', sans-serif", color: '#1E2420',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          利澤國小基金預算管理系統
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: '#F5F3EE', borderRadius: 8, padding: 3 }}>
          {years.map((y) => {
            const active = year === y;
            return (
              <div
                key={y}
                onClick={() => setYear(y)}
                style={{
                  padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                  font: "700 12.5px Inter, sans-serif",
                  color: active ? '#fff' : '#6B726A',
                  background: active ? '#1F5F52' : 'transparent',
                }}
              >
                {y}年度
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', background: '#C9832F',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            font: "700 12px Inter, sans-serif", color: '#fff',
          }}>{initial}</div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <span style={{ font: "600 12.5px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>
              {profile?.name || user?.email}
            </span>
            <span
              onClick={logout}
              style={{ font: "400 11px 'Noto Sans TC', sans-serif", color: '#8A9089', cursor: 'pointer' }}
              title="登出"
            >
              {profile?.role === 'admin' ? '管理者' : '填報人員'} · 登出
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
