import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isFirebaseConfigured } from '../firebase';
import { APP_UPDATED_AT, APP_VERSION } from '../lib/appInfo';
import { card, input, label, btnPrimary } from '../styles';
import BrandMark from '../components/BrandMark';

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
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  useEffect(() => {
    if (pendingGoogleEmail) setEmail(pendingGoogleEmail);
  }, [pendingGoogleEmail]);

  // A password-based account that doesn't yet exist as a Google credential
  // forces this form open (via pendingGoogleEmail) so the user can prove
  // ownership and link the two — the one case where the password form is
  // still required, not just an optional fallback.
  const passwordFormOpen = showPasswordForm || Boolean(pendingGoogleEmail);

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

  const closePasswordForm = () => {
    setShowPasswordForm(false);
    setPassword('');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F3EE', padding: 20 }}>
      <div style={{ ...card, width: 'min(400px, 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <BrandMark size={32} />
          <div style={{ font: "700 15px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>利澤國小基金預算管理系統</div>
        </div>

        {!isFirebaseConfigured ? (
          <div style={{ font: "400 13px/1.8 'Noto Sans TC', sans-serif", color: '#454B45' }}>
            <div style={{ font: "700 13px 'Noto Sans TC', sans-serif", color: '#B5533E', marginBottom: 8 }}>尚未連接 Firebase</div>
            請將 <code>.env.example</code> 複製為 <code>.env</code>，填入 Firebase 專案設定（Auth／Firestore／Storage）後重新啟動，即可登入使用。
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={submitGoogle}
              disabled={submitting || Boolean(pendingGoogleEmail)}
              style={{
                width: '100%', minHeight: 48, borderRadius: 8, border: 0,
                background: '#1F5F52', color: '#fff', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 10,
                cursor: submitting || pendingGoogleEmail ? 'default' : 'pointer',
                font: "700 14px 'Noto Sans TC', sans-serif",
                opacity: submitting || pendingGoogleEmail ? .6 : 1,
              }}
            >
              <span style={{
                font: '800 17px Inter, sans-serif', color: '#1F5F52', background: '#fff',
                width: 22, height: 22, borderRadius: '50%', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
              }}
              >
                G
              </span>
              使用 Google 帳號登入
            </button>
            <div style={{ font: "400 11.5px/1.7 'Noto Sans TC', sans-serif", color: '#8A9089', textAlign: 'center', marginTop: 10 }}>
              請使用學校指派的 Google 帳號登入，系統帳號已全面改用 Google 登入
            </div>

            {pendingGoogleEmail && (
              <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #EEEBE2' }}>
                <div style={{ font: "600 12.5px/1.7 'Noto Sans TC', sans-serif", color: '#B5533E', marginBottom: 12 }}>
                  這個 Google 帳號已對應一個現有的密碼帳號，請輸入原密碼以完成連結：
                </div>
                <form onSubmit={submit}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={label}>帳號（Email）</label>
                    <input style={{ ...input, background: '#F5F3EE' }} type="email" required readOnly value={email} />
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={label}>密碼</label>
                    <input style={input} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  {error && <div style={{ font: "500 12px 'Noto Sans TC', sans-serif", color: '#B5533E', marginBottom: 14 }}>⚠ {error}</div>}
                  <button type="submit" style={{ ...btnPrimary, width: '100%', justifyContent: 'center', opacity: submitting ? .6 : 1 }} disabled={submitting}>
                    {submitting ? '處理中…' : '驗證密碼並連結 Google'}
                  </button>
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
                </form>
              </div>
            )}

            {!pendingGoogleEmail && !passwordFormOpen && (
              <button
                type="button"
                onClick={() => setShowPasswordForm(true)}
                style={{
                  width: '100%', marginTop: 18, border: 0, background: 'transparent',
                  color: '#8A9089', cursor: 'pointer', textDecoration: 'underline',
                  font: "600 11.5px 'Noto Sans TC', sans-serif",
                }}
              >
                仍使用舊版帳號密碼登入
              </button>
            )}

            {!pendingGoogleEmail && passwordFormOpen && (
              <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #EEEBE2' }}>
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
                    {submitting ? '處理中…' : '登入'}
                  </button>
                  <button
                    type="button"
                    onClick={closePasswordForm}
                    disabled={submitting}
                    style={{
                      width: '100%', marginTop: 10, border: 0, background: 'transparent',
                      color: '#1F5F52', cursor: submitting ? 'default' : 'pointer',
                      font: "700 12px 'Noto Sans TC', sans-serif",
                    }}
                  >
                    返回 Google 帳號登入
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        <div style={{
          marginTop: 20, paddingTop: 14, borderTop: '1px solid #EEEBE2',
          font: "400 11px 'Noto Sans TC', sans-serif", color: '#8A9089', textAlign: 'center',
        }}
        >
          系統版本 v{APP_VERSION} · 更新日期 {APP_UPDATED_AT}
        </div>
      </div>
    </div>
  );
}
