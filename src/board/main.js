// 校長儀表板（/board.html）的進入點：登入、權限確認、即時讀取 principalBoard 集合。
// 與財務預算系統共用同一個 Firebase 專案、同一個網域與登入狀態，所以在財務系統登入過，
// 打開這一頁就不必再登入。權限規則見 firestore.rules 的 principalBoard 段落。
import './board.css';
import { GoogleAuthProvider, onAuthStateChanged, signInWithCustomToken, signInWithPopup, signOut } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { createAccountHubClient, evaluateAppAccessFromAccount } from '@ltps/account-sdk/core';
import {
  auth,
  db,
  hubAuth,
  hubDb,
  hubFunctions,
  isAccountHubConfigured,
  isFirebaseConfigured,
} from '../firebase.js';
import {
  TITLE, esc, headerTime, renderBand, renderCards, renderDetail, renderNotices,
} from './render.js';

const $ = (s) => document.querySelector(s);
const ORDER = ['sch', 'att', 'fill', 'stu', 'menu', 'lib'];
const ROLE_LABEL = { admin: '管理者', viewer: '主任', editor: '主任' };

let data = {};
let openId = null;
let stopBoard = null;

function show(view) {
  for (const v of ['loading', 'login', 'denied', 'dash']) $(`#v-${v}`).hidden = v !== view;
}

/** 讀者是否可看儀表板：校級超管、財務管理者，或具備 board 系統存取權。 */
function canViewBoard(account) {
  const boardAccess = evaluateAppAccessFromAccount({
    profileState: account ? 'ready' : 'missing',
    account,
    appId: 'board',
  });
  if (boardAccess.allowed) return { ok: true, role: boardAccess.role };
  const financeAccess = evaluateAppAccessFromAccount({
    profileState: account ? 'ready' : 'missing',
    account,
    appId: 'finance',
  });
  if (financeAccess.allowed && financeAccess.isAppAdmin) return { ok: true, role: 'admin' };
  return {
    ok: false,
    reason: account?.globalStatus === 'disabled'
      ? '此帳號已全校停用，請聯絡系統管理員。'
      : '此帳號沒有「校長儀表板」的檢視權限，請聯絡系統管理員。',
  };
}

function render() {
  const now = new Date();
  $('#when').textContent = headerTime(now);
  const cards = renderCards(data, now);
  $('#grid').innerHTML = ORDER.map((id) => `<div class="card k-${id}" id="c-${id}" role="button" tabindex="0" data-id="${id}" aria-label="${TITLE[id]}，開啟明細">${cards[id]}</div>`).join('');
  const { band, light } = renderBand(data, now);
  $('#band').innerHTML = band;
  $('#light').innerHTML = light;
  $('#notices').innerHTML = renderNotices(data, now);
  if (openId) $('#db').innerHTML = renderDetail(openId, data, now);
}

function openDrawer(id) {
  openId = id;
  $('#dt').textContent = TITLE[id];
  $('#db').innerHTML = renderDetail(id, data, new Date());
  $('#drawer').removeAttribute('inert');
  $('#drawer').classList.add('open');
  $('#scrim').classList.add('open');
  $('#close').focus();
}
function closeDrawer() {
  openId = null;
  $('#drawer').setAttribute('inert', '');
  $('#drawer').classList.remove('open');
  $('#scrim').classList.remove('open');
}

function startBoard() {
  if (stopBoard) return;
  stopBoard = onSnapshot(
    collection(db, 'principalBoard'),
    (snap) => {
      const next = {};
      snap.forEach((d) => { next[d.id] = d.data(); });
      data = next;
      render();
    },
    (err) => {
      $('#notices').innerHTML = `<div class="notice">讀取儀表板資料失敗：${esc(err.code || err.message)}。請重新整理，或確認帳號權限。</div>`;
    },
  );
}
function stopListening() {
  if (stopBoard) { stopBoard(); stopBoard = null; }
  data = {};
}

async function signIn() {
  $('#login-err').textContent = '';
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(hubAuth, provider);
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      $('#login-err').textContent = `登入失敗：${e.code || e.message}`;
    }
  }
}

async function signOutAll() {
  await Promise.all([
    hubAuth ? signOut(hubAuth) : Promise.resolve(),
    auth && auth !== hubAuth ? signOut(auth) : Promise.resolve(),
  ]);
}

function avatar(user, name) {
  const first = esc((name || user.email || '?').trim().slice(0, 1));
  return user.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer" data-fallback="${first}">` : first;
}

function wire() {
  $('#g-in').onclick = signIn;
  $('#g-other').onclick = async () => { await signOutAll(); signIn(); };
  $('#go-logout').onclick = () => signOutAll();
  $('#src-btn').onclick = () => openDrawer('src');
  $('#go-src').onclick = () => { $('#menu').classList.remove('open'); openDrawer('src'); };
  $('#me-btn').onclick = () => {
    const o = $('#menu').classList.toggle('open');
    $('#me-btn').setAttribute('aria-expanded', String(o));
  };
  $('#close').onclick = closeDrawer;
  $('#scrim').onclick = closeDrawer;
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-id]');
    if (c && !e.target.closest('.drawer')) openDrawer(c.dataset.id);
    if (!e.target.closest('#menu') && !e.target.closest('#me-btn')) {
      $('#menu').classList.remove('open');
      $('#me-btn').setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.id && e.target.getAttribute('role') === 'button') {
      e.preventDefault();
      openDrawer(e.target.dataset.id);
    }
    if (e.key === 'Escape') closeDrawer();
  });
  // 頭像載入失敗時改顯示姓名首字
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.dataset.fallback !== undefined) img.replaceWith(document.createTextNode(img.dataset.fallback));
  }, true);
  // 每分鐘重畫一次：時鐘、「下一件」行程、資料逾時判斷都跟著時間走
  setInterval(() => { if (!$('#v-dash').hidden) render(); }, 60000);
}

function main() {
  wire();
  if (!isFirebaseConfigured || !isAccountHubConfigured) {
    show('login');
    $('#login-err').textContent = '此網站尚未設定 Firebase 或校級帳號中心連線。';
    $('#g-in').disabled = true;
    return;
  }
  const hubClient = hubFunctions ? createAccountHubClient(hubFunctions) : null;
  onAuthStateChanged(hubAuth, async (user) => {
    stopListening();
    closeDrawer();
    if (!user) {
      if (auth && auth !== hubAuth && auth.currentUser) await signOut(auth).catch(() => {});
      show('login');
      return;
    }
    show('loading');
    let account = null;
    try {
      const snap = await getDoc(doc(hubDb, 'accounts', user.uid));
      account = snap.exists() ? { uid: user.uid, ...snap.data() } : null;
    } catch {
      account = null;
    }
    const verdict = canViewBoard(account);
    if (!verdict.ok) {
      $('#denied-email').textContent = user.email || '';
      $('#denied-reason').textContent = verdict.reason;
      show('denied');
      return;
    }
    try {
      if (auth && auth !== hubAuth && hubClient) {
        const brokerRes = await hubClient.issueAppToken('board');
        await signInWithCustomToken(auth, brokerRes.customToken);
      }
    } catch {
      $('#denied-email').textContent = user.email || '';
      $('#denied-reason').textContent = '無法向校級帳號中心換發儀表板憑證，請稍後再試或聯絡系統管理員。';
      show('denied');
      return;
    }
    const name = account.name || user.displayName || user.email;
    const role = ROLE_LABEL[verdict.role] || verdict.role;
    $('#me-av').innerHTML = avatar(user, name);
    $('#menu-av').innerHTML = avatar(user, name);
    $('#me-name').innerHTML = `${esc(name)}<small>${esc(role)}</small>`;
    $('#menu-name').textContent = name;
    $('#menu-email').textContent = user.email || '';
    $('#menu-role').textContent = `角色：${role}`;
    show('dash');
    render();
    startBoard();
  });
}

main();
