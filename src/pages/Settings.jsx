import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, isFirebaseConfigured } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { navGroups } from '../lib/nav';
import { pageTitle, pageSubtitle, card, input, label, btnPrimary, btnOutline, btnSecondary, chip } from '../styles';

const DEPT_ORDER = ['校長室', '教務處', '學務處', '總務處', '人事室', '會計室'];
const MODULE_OPTIONS = navGroups.flatMap((g) => g.items).filter((it) => it.key !== 'dashboard');

function useUsers() {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    });
  }, []);
  return users;
}

export default function Settings() {
  const users = useUsers();
  const { isAdmin } = useAuth();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', dept: DEPT_ORDER[0], role: 'editor', modules: [] });
  const [status, setStatus] = useState(null);
  const [resetLink, setResetLink] = useState(null);

  const deptGroups = DEPT_ORDER
    .map((dept) => ({ dept, accounts: users.filter((u) => u.dept === dept) }))
    .filter((g) => g.accounts.length > 0);

  const toggleModule = (key) => {
    setForm((s) => ({ ...s, modules: s.modules.includes(key) ? s.modules.filter((m) => m !== key) : [...s.modules, key] }));
  };

  const submit = async () => {
    setStatus('saving');
    setResetLink(null);
    try {
      const createAccount = httpsCallable(functions, 'createAccount');
      const res = await createAccount(form);
      setStatus('done');
      setResetLink(res.data.resetLink);
      setForm({ name: '', email: '', dept: DEPT_ORDER[0], role: 'editor', modules: [] });
    } catch (e) {
      setStatus(e.message || '新增失敗');
    }
  };

  return (
    <div>
      <div style={pageTitle}>帳號管理</div>
      <div style={pageSubtitle}>帳號依「處室」分類管理，管理者可指派各處室填報人員（Firebase Auth 帳密登入）</div>

      {deptGroups.length === 0 && (
        <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 18 }}>尚無帳號資料</div>
      )}

      {deptGroups.map((dg) => (
        <div key={dg.dept} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ font: "700 11.5px 'Noto Sans TC', sans-serif", color: '#1F5F52', background: '#E9F1EE', padding: '3px 10px', borderRadius: 5 }}>{dg.dept}</span>
            <span style={{ font: "400 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>{dg.accounts.length} 位帳號</span>
          </div>
          <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 680 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 0.7fr', padding: '10px 18px', background: '#F5F3EE', font: "700 11.5px 'Noto Sans TC', sans-serif", color: '#6B726A' }}>
              <span>姓名</span><span>帳號</span><span>負責模組</span><span>權限</span>
            </div>
            {dg.accounts.map((ac) => (
              <div key={ac.uid} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 0.7fr', padding: '11px 18px', borderTop: '1px solid #EEEBE2', font: "500 13px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>
                <span>{ac.name}</span>
                <span style={{ color: '#8A9089' }}>{ac.email}</span>
                <span>{ac.role === 'admin' ? '全部（管理者）' : (ac.modules || []).map((k) => MODULE_OPTIONS.find((m) => m.key === k)?.label || k).join('、') || '—'}</span>
                <span style={{ font: '700 11px Inter, sans-serif', color: ac.role === 'admin' ? '#1F5F52' : '#8A9089' }}>{ac.role === 'admin' ? '管理者' : '填報人員'}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {isAdmin && !adding && (
        <div style={{ ...btnOutline, marginTop: 6 }} onClick={() => setAdding(true)}>＋ 新增帳號</div>
      )}

      {isAdmin && adding && (
        <div style={{ ...card, maxWidth: 640, marginTop: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
            <div>
              <label style={label}>姓名</label>
              <input style={input} value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div>
              <label style={label}>帳號（Email）</label>
              <input style={input} value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
            </div>
            <div>
              <label style={label}>處室</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DEPT_ORDER.map((d) => (
                  <div key={d} onClick={() => setForm((s) => ({ ...s, dept: d }))} style={chip(form.dept === d)}>{d}</div>
                ))}
              </div>
            </div>
            <div>
              <label style={label}>權限</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['admin', '管理者'], ['editor', '填報人員']].map(([v, l]) => (
                  <div key={v} onClick={() => setForm((s) => ({ ...s, role: v }))} style={chip(form.role === v)}>{l}</div>
                ))}
              </div>
            </div>
          </div>
          {form.role === 'editor' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>負責模組</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {MODULE_OPTIONS.map((m) => (
                  <div key={m.key} onClick={() => toggleModule(m.key)} style={chip(form.modules.includes(m.key))}>{m.label}</div>
                ))}
              </div>
            </div>
          )}
          {status && status !== 'saving' && status !== 'done' && (
            <div style={{ font: "500 12px 'Noto Sans TC', sans-serif", color: '#B5533E', marginBottom: 10 }}>⚠ {status}</div>
          )}
          {status === 'done' && resetLink && (
            <div style={{ font: "500 12px 'Noto Sans TC', sans-serif", color: '#2F8F5B', marginBottom: 10, wordBreak: 'break-all' }}>
              ✓ 帳號已建立，請將設定密碼連結交給該使用者：<br />
              <a href={resetLink} target="_blank" rel="noreferrer">{resetLink}</a>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ ...btnPrimary, opacity: status === 'saving' ? .6 : 1 }} onClick={submit}>建立帳號（將寄送設定密碼信）</div>
            <div style={btnSecondary} onClick={() => setAdding(false)}>取消</div>
          </div>
        </div>
      )}
    </div>
  );
}
