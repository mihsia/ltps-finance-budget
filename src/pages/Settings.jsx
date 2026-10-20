import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, isFirebaseConfigured } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { runAuthorized } from '../lib/accessPolicy';
import { navGroups } from '../lib/nav';
import { buildAccountImportTemplateWorkbook, parseAccountImportFile } from '../lib/accountImport';
import {
  pageTitle, pageSubtitle, card, input, label, btnPrimary, btnOutline, btnSecondary,
  chip, badge, tableHeadRow, tableRow,
} from '../styles';

const DEPT_ORDER = ['校長室', '教務處', '學務處', '總務處', '人事室', '會計室'];
const MODULE_OPTIONS = navGroups.flatMap((g) => g.items).filter((it) => it.key !== 'dashboard');
const ROLE_OPTIONS = [['admin', '管理者'], ['editor', '填報人員']];
const ROW_COLS = '0.9fr 1fr 1.8fr 0.6fr 0.6fr 1fr';

// Past this many modules, the row grows taller than its neighbors every
// time — capping it and folding the rest into a single "+N" badge keeps
// every row the same height regardless of how many modules an account has.
const MAX_VISIBLE_MODULES = 3;

// New accounts sign in with Google only (see functions/index.js's
// createAccount — no password is ever set), so the admin only needs to pick
// which Google-capable domain the account's email belongs to; "自訂" covers
// anything outside those two (and lets the admin type a full email as-is).
const CUSTOM_EMAIL_DOMAIN = '__custom__';
const EMAIL_DOMAIN_OPTIONS = ['tmail.ilc.edu.tw', 'gmail.com'];

function composeEmail({ emailLocal, emailDomain }) {
  const local = emailLocal.trim();
  if (emailDomain === CUSTOM_EMAIL_DOMAIN) return local.toLowerCase();
  return `${local}@${emailDomain}`.toLowerCase();
}

function emptyCreateForm() {
  return {
    name: '', emailLocal: '', emailDomain: EMAIL_DOMAIN_OPTIONS[0], dept: DEPT_ORDER[0], role: 'editor', modules: [],
  };
}

/** A description legend next to a 負責模組 chip picker. Shows only whichever module was just clicked, so the legend stays short no matter how many modules the picker offers. */
function ModuleDescriptions({ options, activeKey }) {
  const active = options.find((m) => m.key === activeKey);
  return (
    <div style={{
      background: '#F5F3EE', borderRadius: 8, padding: '10px 14px', minHeight: 64,
      display: 'flex', alignItems: 'center',
    }}
    >
      {active ? (
        <div style={{ font: "500 12px 'Noto Sans TC', sans-serif", lineHeight: 1.6 }}>
          <div style={{ color: '#1E2420', fontWeight: 700, marginBottom: 2 }}>{active.label}</div>
          <div style={{ color: '#8A9089' }}>{active.desc}</div>
        </div>
      ) : (
        <span style={{ font: "400 12px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>點選左側模組，查看功能說明</span>
      )}
    </div>
  );
}

/** The 負責模組 cell in the account list: capped at MAX_VISIBLE_MODULES pills, with the rest folded into a hoverable "+N" badge so every row stays the same height. */
function ModulePillList({ moduleKeys }) {
  if (moduleKeys.length === 0) return <span style={{ color: '#8A9089' }}>—</span>;
  const labels = moduleKeys.map((k) => MODULE_OPTIONS.find((m) => m.key === k)?.label || k);
  const visible = labels.slice(0, MAX_VISIBLE_MODULES);
  const overflow = labels.slice(MAX_VISIBLE_MODULES);
  return (
    <>
      {visible.map((lbl) => <span key={lbl} style={badge(true, '#1F5F52', '#E9F1EE')}>{lbl}</span>)}
      {overflow.length > 0 && (
        <span style={badge(true, '#6B726A', '#EDEAE2')} title={overflow.join('、')}>+{overflow.length}</span>
      )}
    </>
  );
}

function errorText() {
  return {
    maxWidth: 720,
    marginBottom: 14,
    color: '#B5533E',
    font: "600 12.5px 'Noto Sans TC', sans-serif",
  };
}

function useUsers() {
  const [state, setState] = useState({ users: [], loading: isFirebaseConfigured, error: null });
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setState({ users: snap.docs.map((d) => ({ uid: d.id, ...d.data() })), loading: false, error: null });
      },
      () => {
        setState((s) => ({ ...s, loading: false, error: '無法載入帳號資料，請稍後再試。' }));
      },
    );
  }, []);
  return state;
}

function editFormFrom(account) {
  return {
    name: account.name,
    dept: account.dept,
    role: account.role,
    modules: [...(account.modules || [])],
  };
}

export default function Settings() {
  const { users, error: usersError } = useUsers();
  const { isAdmin, authorizeAdmin, authorizeAdminActor } = useAuth();

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyCreateForm);
  const [status, setStatus] = useState(null);
  const [createdEmail, setCreatedEmail] = useState(null);
  const [previewModuleKey, setPreviewModuleKey] = useState(null);

  const importFileRef = useRef(null);
  const [importState, setImportState] = useState(null);

  const [editingUid, setEditingUid] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editPreviewModuleKey, setEditPreviewModuleKey] = useState(null);
  const [busyUid, setBusyUid] = useState(null);
  const [actionError, setActionError] = useState(null);

  const selfDecision = authorizeAdminActor();
  const selfUid = selfDecision.allowed ? selfDecision.actor?.uid : null;

  const deptGroups = DEPT_ORDER
    .map((dept) => ({ dept, accounts: users.filter((u) => u.dept === dept) }))
    .filter((g) => g.accounts.length > 0);

  const toggleModule = (key) => {
    setForm((s) => ({ ...s, modules: s.modules.includes(key) ? s.modules.filter((m) => m !== key) : [...s.modules, key] }));
    setPreviewModuleKey(key);
  };

  const openCreateModal = () => {
    setAdding(true);
    setPreviewModuleKey(null);
  };

  const submit = async () => {
    return runAuthorized(() => authorizeAdmin(), async () => {
      setStatus('saving');
      setCreatedEmail(null);
      const email = composeEmail(form);
      try {
        const createAccount = httpsCallable(functions, 'createAccount');
        await createAccount({
          name: form.name, email, dept: form.dept, role: form.role, modules: form.modules,
        });
        setStatus('done');
        setCreatedEmail(email);
        setForm(emptyCreateForm());
        setPreviewModuleKey(null);
      } catch (e) {
        setStatus(e.message || '新增失敗');
      }
    });
  };

  const downloadImportTemplate = () => {
    XLSX.writeFile(buildAccountImportTemplateWorkbook(), '帳號匯入範本.xlsx');
  };

  const openImportPicker = () => importFileRef.current?.click();

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImportState({ status: 'parsing' });
    let rows;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const parsed = parseAccountImportFile(workbook);
      if (parsed.error) {
        setImportState({ status: 'error', error: parsed.error });
        return;
      }
      rows = parsed.rows;
    } catch {
      setImportState({ status: 'error', error: '無法讀取檔案，請確認是有效的 .xlsx 檔案。' });
      return;
    }

    const result = await runAuthorized(() => authorizeAdmin(), async () => {
      setImportState({ status: 'uploading' });
      try {
        const importAccounts = httpsCallable(functions, 'importAccounts');
        const res = await importAccounts({ rows });
        setImportState({ status: 'done', results: res.data.results });
      } catch (e) {
        setImportState({ status: 'error', error: e.message || '匯入失敗，請稍後再試。' });
      }
    });
    if (!result.executed) setImportState({ status: 'error', error: result.reason });
  };

  const startEdit = (account) => {
    setActionError(null);
    setEditingUid(account.uid);
    setEditForm(editFormFrom(account));
    setEditPreviewModuleKey(null);
  };
  const cancelEdit = () => {
    setEditingUid(null);
    setEditForm(null);
  };
  const toggleEditModule = (key) => {
    setEditForm((s) => ({ ...s, modules: s.modules.includes(key) ? s.modules.filter((m) => m !== key) : [...s.modules, key] }));
    setEditPreviewModuleKey(key);
  };

  const saveEdit = async () => {
    const uid = editingUid;
    const values = editForm;
    const result = await runAuthorized(() => authorizeAdmin(), async () => {
      setActionError(null);
      setBusyUid(uid);
      try {
        const updateAccount = httpsCallable(functions, 'updateAccount');
        await updateAccount({ uid, name: values.name, dept: values.dept, role: values.role, modules: values.modules });
        setEditingUid(null);
        setEditForm(null);
      } catch (e) {
        setActionError(e.message || '更新失敗');
      } finally {
        setBusyUid(null);
      }
    });
    if (!result.executed) setActionError(result.reason);
  };

  const changeStatus = async (uid, nextStatus) => {
    const result = await runAuthorized(() => authorizeAdmin(), async () => {
      setActionError(null);
      setBusyUid(uid);
      try {
        const setAccountStatus = httpsCallable(functions, 'setAccountStatus');
        await setAccountStatus({ uid, status: nextStatus });
      } catch (e) {
        setActionError(e.message || '操作失敗');
      } finally {
        setBusyUid(null);
      }
    });
    if (!result.executed) setActionError(result.reason);
  };

  return (
    <div>
      <div style={pageTitle}>帳號管理</div>
      <div style={pageSubtitle}>帳號依「處室」分類管理，管理者可指派各處室填報人員（使用 Google 帳號登入）</div>

      {usersError && <div style={errorText()}>{usersError}</div>}
      {!usersError && actionError && <div style={errorText()}>{actionError}</div>}

      {!usersError && deptGroups.length === 0 && (
        <div style={{ font: "400 13px 'Noto Sans TC', sans-serif", color: '#8A9089', marginBottom: 18 }}>尚無帳號資料</div>
      )}

      {!usersError && deptGroups.map((dg) => (
        <div key={dg.dept} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ font: "700 11.5px 'Noto Sans TC', sans-serif", color: '#1F5F52', background: '#E9F1EE', padding: '3px 10px', borderRadius: 5 }}>{dg.dept}</span>
            <span style={{ font: "400 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089' }}>{dg.accounts.length} 位帳號</span>
          </div>
          <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 820 }}>
            <div style={tableHeadRow(ROW_COLS)}>
              <span>姓名</span><span>帳號</span><span>負責模組</span><span>權限</span><span>狀態</span>
              {isAdmin && <span>操作</span>}
            </div>
            {dg.accounts.map((ac) => {
              const isSelf = ac.uid === selfUid;
              const isEditing = editingUid === ac.uid;
              const rowBusy = busyUid === ac.uid;

              if (isEditing && editForm) {
                return (
                  <div key={ac.uid} style={{ borderTop: '1px solid #EEEBE2', padding: '14px 18px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 14 }}>
                      <div>
                        <label style={label}>姓名</label>
                        <input
                          aria-label="姓名"
                          style={input}
                          value={editForm.name}
                          onChange={(e) => setEditForm((s) => ({ ...s, name: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label style={label}>帳號（Email，無法變更）</label>
                        <div style={{ ...input, background: '#F5F3EE', color: '#8A9089' }}>{ac.email}</div>
                      </div>
                      <div>
                        <label style={label}>處室</label>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {DEPT_ORDER.map((d) => (
                            <div key={d} onClick={() => setEditForm((s) => ({ ...s, dept: d }))} style={chip(editForm.dept === d)}>{d}</div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={label}>權限</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {ROLE_OPTIONS.map(([v, l]) => (
                            <div key={v} onClick={() => setEditForm((s) => ({ ...s, role: v }))} style={chip(editForm.role === v)}>{l}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {editForm.role === 'editor' && (
                      <div style={{ marginBottom: 14 }}>
                        <label style={label}>負責模組</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignContent: 'flex-start' }}>
                            {MODULE_OPTIONS.map((m) => (
                              <div key={m.key} onClick={() => toggleEditModule(m.key)} style={chip(editForm.modules.includes(m.key))}>{m.label}</div>
                            ))}
                          </div>
                          <ModuleDescriptions options={MODULE_OPTIONS} activeKey={editPreviewModuleKey} />
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button type="button" onClick={rowBusy ? undefined : saveEdit} style={{ ...btnPrimary, opacity: rowBusy ? .6 : 1, border: 0 }}>
                        {rowBusy ? '儲存中…' : '儲存'}
                      </button>
                      <button type="button" onClick={rowBusy ? undefined : cancelEdit} style={{ ...btnSecondary, border: 0 }}>取消</button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={ac.uid} style={{ ...tableRow(ROW_COLS), alignItems: 'center' }}>
                  <span>{ac.name}</span>
                  <span style={{ color: '#8A9089' }}>{ac.email}</span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                    {ac.role === 'admin' ? (
                      <span style={{ font: '700 11px Inter, sans-serif', color: '#1F5F52' }}>全部（管理者）</span>
                    ) : (
                      <ModulePillList moduleKeys={ac.modules || []} />
                    )}
                  </span>
                  <span style={{ font: '700 11px Inter, sans-serif', color: ac.role === 'admin' ? '#1F5F52' : '#8A9089' }}>{ac.role === 'admin' ? '管理者' : '填報人員'}</span>
                  <span style={badge(ac.status === 'active')}>{ac.status === 'active' ? '使用中' : '已停用'}</span>
                  {isAdmin && (
                    <span style={{ display: 'flex', gap: 8 }}>
                      {!isSelf && (
                        <>
                          <button type="button" onClick={rowBusy ? undefined : () => startEdit(ac)} style={{ ...btnSecondary, padding: '6px 12px', border: 0 }}>編輯</button>
                          {ac.status === 'active' ? (
                            <button type="button" onClick={rowBusy ? undefined : () => changeStatus(ac.uid, 'disabled')} style={{ ...btnSecondary, padding: '6px 12px', border: 0 }}>
                              {rowBusy ? '處理中…' : '停用'}
                            </button>
                          ) : (
                            <button type="button" onClick={rowBusy ? undefined : () => changeStatus(ac.uid, 'active')} style={{ ...btnSecondary, padding: '6px 12px', border: 0 }}>
                              {rowBusy ? '處理中…' : '重新啟用'}
                            </button>
                          )}
                        </>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {isAdmin && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, marginBottom: 18 }}>
          {!adding && <div style={btnOutline} onClick={openCreateModal}>＋ 新增帳號</div>}
          <div style={btnOutline} onClick={downloadImportTemplate}>⬇ 下載帳號範例檔</div>
          <div
            style={{ ...btnOutline, opacity: importState?.status === 'parsing' || importState?.status === 'uploading' ? .6 : 1 }}
            onClick={importState?.status === 'parsing' || importState?.status === 'uploading' ? undefined : openImportPicker}
          >
            {importState?.status === 'parsing' || importState?.status === 'uploading' ? '匯入中…' : '⬆ 匯入帳號（.xlsx）'}
          </div>
          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </div>
      )}

      {isAdmin && importState?.status === 'error' && (
        <div style={{ ...errorText(), maxWidth: 820 }}>{importState.error}</div>
      )}

      {isAdmin && importState?.status === 'done' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden', maxWidth: 820, marginBottom: 18 }} className="table-scroll">
          <div style={{ minWidth: 640 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 18px', background: '#F5F3EE',
            }}
            >
              <span style={{ font: "700 12.5px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>
                匯入結果：成功 {importState.results.filter((r) => r.ok).length} 筆／失敗 {importState.results.filter((r) => !r.ok).length} 筆
              </span>
              <span style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#1F5F52', cursor: 'pointer' }} onClick={() => setImportState(null)}>關閉</span>
            </div>
            {importState.results.map((r) => (
              <div key={r.row} style={{ padding: '10px 18px', borderTop: '1px solid #EEEBE2', font: "500 12.5px 'Noto Sans TC', sans-serif" }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={badge(r.ok, '#2F8F5B', '#E9F5EE', '#B5533E', '#FBEAE6')}>{r.ok ? '成功' : '失敗'}</span>
                  <span>第 {r.row} 列</span>
                  <span style={{ color: '#454B45' }}>{r.name || '—'}</span>
                  <span style={{ color: '#8A9089' }}>{r.email || '—'}</span>
                </div>
                {!r.ok && <div style={{ color: '#B5533E', marginTop: 4 }}>{r.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && adding && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(20,20,16,.45)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
        >
          <div style={{
            background: '#fff', borderRadius: 12, width: 'min(640px, 100%)', maxHeight: '88vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #E3DFD3' }}>
              <div style={{ font: "700 14px 'Noto Sans TC', sans-serif", color: '#1E2420' }}>新增帳號</div>
              <div style={{ font: "600 12px 'Noto Sans TC', sans-serif", color: '#1F5F52', cursor: 'pointer' }} onClick={() => setAdding(false)}>關閉 ✕</div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 18 }} className="table-scroll">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 14 }}>
                <div>
                  <label style={label}>姓名</label>
                  <input aria-label="姓名" style={input} value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
                </div>
                <div>
                  <label style={label}>帳號（Google 登入）</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      aria-label="帳號名稱"
                      style={{ ...input, flex: 1 }}
                      placeholder={form.emailDomain === CUSTOM_EMAIL_DOMAIN ? '完整 Email' : '帳號名稱'}
                      value={form.emailLocal}
                      onChange={(e) => setForm((s) => ({ ...s, emailLocal: e.target.value }))}
                    />
                    <select
                      aria-label="網域"
                      style={{ ...input, width: 150, flex: 'none' }}
                      value={form.emailDomain}
                      onChange={(e) => setForm((s) => ({ ...s, emailDomain: e.target.value }))}
                    >
                      {EMAIL_DOMAIN_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                      <option value={CUSTOM_EMAIL_DOMAIN}>自行輸入</option>
                    </select>
                  </div>
                  {form.emailLocal.trim() && (
                    <div style={{ font: "400 11.5px 'Noto Sans TC', sans-serif", color: '#8A9089', marginTop: 5 }}>
                      將建立帳號：{composeEmail(form)}
                    </div>
                  )}
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
                    {ROLE_OPTIONS.map(([v, l]) => (
                      <div key={v} onClick={() => setForm((s) => ({ ...s, role: v }))} style={chip(form.role === v)}>{l}</div>
                    ))}
                  </div>
                </div>
              </div>
              {form.role === 'editor' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={label}>負責模組</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignContent: 'flex-start' }}>
                      {MODULE_OPTIONS.map((m) => (
                        <div key={m.key} onClick={() => toggleModule(m.key)} style={chip(form.modules.includes(m.key))}>{m.label}</div>
                      ))}
                    </div>
                    <ModuleDescriptions options={MODULE_OPTIONS} activeKey={previewModuleKey} />
                  </div>
                </div>
              )}
              {status && status !== 'saving' && status !== 'done' && (
                <div style={{ font: "500 12px 'Noto Sans TC', sans-serif", color: '#B5533E', marginBottom: 10 }}>⚠ {status}</div>
              )}
              {status === 'done' && createdEmail && (
                <div style={{ font: "500 12px 'Noto Sans TC', sans-serif", color: '#2F8F5B', marginBottom: 10 }}>
                  ✓ 帳號已建立，{createdEmail} 現在可以使用 Google 帳號登入系統。
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '14px 18px', borderTop: '1px solid #E3DFD3' }}>
              <div style={{ ...btnPrimary, opacity: status === 'saving' ? .6 : 1 }} onClick={submit}>建立帳號</div>
              <div style={btnSecondary} onClick={() => setAdding(false)}>取消</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
