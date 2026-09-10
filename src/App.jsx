import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useAvailableYears } from './hooks/useYearData';
import { useCurrentYearGuard } from './hooks/useCurrentYearGuard';
import { genericModuleKeys } from './lib/nav';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import PwaUpdatePrompt from './components/PwaUpdatePrompt';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Basic from './pages/Basic';
import Budget from './pages/Budget';
import Library from './pages/Library';
import Language from './pages/Language';
import Generic from './pages/Generic';
import BudgetBook from './pages/BudgetBook';
import Report from './pages/Report';
import Archive from './pages/Archive';
import Settings from './pages/Settings';

function Shell() {
  const years = useAvailableYears();
  const latestYear = years[years.length - 1];
  const [year, setYear] = useState(latestYear);
  const [nav, setNav] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const effectiveYear = years.includes(year) ? year : latestYear;
  const hasCurrentYear = useCurrentYearGuard(effectiveYear, latestYear);

  const pageProps = { year: effectiveYear, years, latestYear, setYear, setNav, hasCurrentYear };

  const renderPage = () => {
    if (nav === 'dashboard') return <Dashboard {...pageProps} />;
    if (nav === 'basic') return <Basic {...pageProps} />;
    if (nav === 'budget') return <Budget {...pageProps} />;
    if (nav === 'library') return <Library {...pageProps} />;
    if (nav === 'language') return <Language {...pageProps} />;
    if (genericModuleKeys.includes(nav)) return <Generic {...pageProps} moduleKey={nav} />;
    if (nav === 'budgetbook') return <BudgetBook {...pageProps} />;
    if (nav === 'report') return <Report {...pageProps} />;
    if (nav === 'archive') return <Archive {...pageProps} />;
    if (nav === 'settings') return <Settings {...pageProps} />;
    return null;
  };

  return (
    <div className="app-shell">
      <Header year={effectiveYear} setYear={setYear} years={years} onMenuClick={() => setSidebarOpen(true)} />
      <div className="app-body">
        <div
          className={`app-sidebar-backdrop${sidebarOpen ? ' is-open' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />
        <Sidebar nav={nav} setNav={setNav} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="app-main">
          {renderPage()}
        </div>
      </div>
    </div>
  );
}

function Gate() {
  const { user, loading, access, accessDeniedReason, logout } = useAuth();
  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A9089' }}>載入中…</div>;
  }
  if (!user) return <Login />;
  if (!access?.allowed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F3EE', padding: 20 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E3DFD3', borderRadius: 10, padding: 24, width: 'min(420px, 100%)' }}>
          <div style={{ font: "700 15px 'Noto Sans TC', sans-serif", color: '#B5533E', marginBottom: 8 }}>無法進入系統</div>
          <div style={{ font: "400 13px/1.8 'Noto Sans TC', sans-serif", color: '#454B45', marginBottom: 16 }}>{accessDeniedReason}</div>
          <button type="button" onClick={logout} style={{ border: 0, borderRadius: 7, background: '#1F5F52', color: '#fff', padding: '9px 14px', cursor: 'pointer' }}>登出</button>
        </div>
      </div>
    );
  }
  return <Shell />;
}

export default function App() {
  return (
    <>
      <PwaUpdatePrompt />
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </>
  );
}
