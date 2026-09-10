import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isFirebaseConfigured } from '../firebase';
import { card, input, label, btnPrimary } from '../styles';

export default function Login() {
  const {
    login,
    loginWithGoogle,
    cancelGoogleLink,
    pendingGoogleEmail,
    error,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (pendingGoogleEmail) setEmail(pendingGoogleEmail);
  }, [pendingGoogleEmail]);

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

  const submitGoogle = async () => {
    setSubmitting(true);
    try {
      await loginWithGoogle();
    } catch {
      // Error and link-account guidance are surfaced by AuthContext.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F3EE', padding: 20 }}>
      <div style={{ ...card, width: 'min(400px, 100%)' }}>
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
              <input
                style={{ ...input, background: pendingGoogleEmail ? '#F5F3EE' : '#fff' }}
                type="email"
                required
                readOnly={Boolean(pendingGoogleEmail)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={label}>密碼</label>
              <input style={input} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <div style={{ font: "500 12px 'Noto Sans TC', sans-serif", color: '#B5533E', marginBottom: 14 }}>⚠ {error}</div>}
            <button type="submit" style={{ ...btnPrimary, width: '100%', justifyContent: 'center', opacity: submitting ? .6 : 1 }} disabled={submitting}>
              {submitting ? '處理中…' : pendingGoogleEmail ? '驗證密碼並連結 Google' : '登入'}
            </button>
            {pendingGoogleEmail && (
              <button
                type="button"
                onClick={cancelGoogleLink}
                disabled={submitting}
                style={{
                  width: '100%', marginTop: 10, border: 0, background: 'transparent',
                  color: '#1F5F52', cursor: submitting ? 'default' : 'pointer',
                  font: "700 12px 'Noto Sans TC', sans-serif",
                }}
              >
                取消 Google 帳號連結
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0', color: '#8A9089', fontSize: 12 }}>
              <span style={{ height: 1, background: '#E3DFD3', flex: 1 }} />
              或
              <span style={{ height: 1, background: '#E3DFD3', flex: 1 }} />
            </div>
            <button
              type="button"
              onClick={submitGoogle}
              disabled={submitting || Boolean(pendingGoogleEmail)}
              style={{
                width: '100%', minHeight: 44, borderRadius: 8, border: '1px solid #D8D3C4',
                background: '#fff', color: '#1E2420', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 10,
                cursor: submitting || pendingGoogleEmail ? 'default' : 'pointer',
                font: "700 13px 'Noto Sans TC', sans-serif",
                opacity: submitting || pendingGoogleEmail ? .6 : 1,
              }}
            >
              <span style={{ font: '700 16px Inter, sans-serif', color: '#4285F4' }}>G</span>
              使用 Google 帳號登入
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
