import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isFirebaseConfigured } from '../firebase';
import { card, input, label, btnPrimary } from '../styles';

export default function Login() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
    } catch {
      // error surfaced via AuthContext.error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F3EE', padding: 20 }}>
      <div style={{ ...card, width: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1F5F52', display: 'flex', alignItems: 'center', justifyContent: 'center', font: "700 14px Inter, sans-serif", color: '#fff' }}>利</div>
          <div style={{ font: "700 15px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>利澤國小基金預算管理系統</div>
        </div>

        {!isFirebaseConfigured ? (
          <div style={{ font: "400 13px/1.8 'Noto Sans TC', sans-serif", color: '#454B45' }}>
            <div style={{ font: "700 13px 'Noto Sans TC', sans-serif", color: '#B5533E', marginBottom: 8 }}>尚未連接 Firebase</div>
            請將 <code>.env.example</code> 複製為 <code>.env</code>，填入 Firebase 專案設定（Auth／Firestore／Storage）後重新啟動，即可登入使用。
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={{ marginBottom: 14 }}>
              <label style={label}>帳號（Email）</label>
              <input style={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={label}>密碼</label>
              <input style={input} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <div style={{ font: "500 12px 'Noto Sans TC', sans-serif", color: '#B5533E', marginBottom: 14 }}>⚠ {error}</div>}
            <button type="submit" style={{ ...btnPrimary, width: '100%', justifyContent: 'center', opacity: submitting ? .6 : 1 }} disabled={submitting}>
              {submitting ? '登入中…' : '登入'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
