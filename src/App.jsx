import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useAvailableYears } from './hooks/useYearData';
import { genericModuleKeys } from './lib/nav';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
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

  const effectiveYear = years.includes(year) ? year : latestYear;

  const pageProps = { year: effectiveYear, years, latestYear, setYear, setNav };

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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#F5F3EE' }}>
      <Header year={effectiveYear} setYear={setYear} years={years} />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar nav={nav} setNav={setNav} />
        <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A9089' }}>載入中…</div>;
  }
  if (!user) return <Login />;
  return <Shell />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
