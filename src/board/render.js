// 校長儀表板的畫面組裝。全部是純函式：輸入 Firestore principalBoard 集合的文件與「現在」，回傳 HTML 字串。
// 文件內容來自外部網站（全誼、Google 日曆、教育部平臺），一律經 esc() 轉義後才放進畫面。

export const TZ = 'Asia/Taipei';

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 任意時間值（Firestore Timestamp、Date、ISO 字串）→ Date，無法判讀時回傳 null。 */
export function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 某個時間點在臺北的日期、時刻、星期。 */
export function taipei(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    md: `${Number(parts.month)}月${Number(parts.day)}日`,
    hm: `${hour}:${parts.minute}`,
    min: Number(hour) * 60 + Number(parts.minute),
    wd,
    wdLabel: `週${'日一二三四五六'[wd]}`,
  };
}

const mins = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };

// ───────── 圖示 ─────────
const SH = {
  ok: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5"/></svg>',
  watch: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11 10.5H1z"/></svg>',
  alert: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .5 11.5 6 6 11.5.5 6z"/></svg>',
  off: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
};
const LBL = { ok: '正常', watch: '注意', alert: '緊急', off: '未接上' };
export function badge(k, t) { return `<span class="badge ${k}">${SH[k]}${esc(t || LBL[k])}</span>`; }

const IC = {
  fill: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M8.5 13l2.2 2.2 4.3-4.7"/>',
  sch: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  att: '<circle cx="9" cy="9" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 11l2 2 4-4"/>',
  stu: '<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11.5V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.5"/>',
  lib: '<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5C4.7 20 4 19.3 4 18.5z"/><path d="M20 5.5C20 4.7 19.3 4 18.5 4H13v16h5.5c.8 0 1.5-.7 1.5-1.5z"/>',
  menu: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-1.5 1-3M12 7c0-1.5 1-1.5 1-3M16 7c0-1.5 1-1.5 1-3"/>',
};
const WI = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  part: '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1"/><path d="M9 19a3.5 3.5 0 0 1-.4-7A5 5 0 0 1 18 11a4 4 0 0 1 .5 8z"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5 4.5 4.5 0 0 1 17.5 18z"/>',
  rain: '<path d="M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 5.5 4.5 4.5 0 0 1 17.5 15z"/><path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2"/>',
};
function wicon(c) { const k = c === 0 ? 'sun' : (c <= 2 ? 'part' : (c === 3 ? 'cloud' : 'rain')); return `<svg viewBox="0 0 24 24" aria-hidden="true">${WI[k]}</svg>`; }
function ico(id) { return `<span class="ico"><svg viewBox="0 0 24 24" aria-hidden="true">${IC[id]}</svg></span>`; }

/** 模組名稱一律四字 */
export const TITLE = { sch: '行事日程', att: '到校狀況', fill: '線上填報', stu: '學生人數', menu: '午餐菜單', lib: '圖書借閱', wx: '天氣預報', src: '資料來源' };
function head(id, more) { return `<div class="card-h">${ico(id)}<h2>${TITLE[id]}</h2><span class="more">${more || '看明細 ›'}</span></div>`; }

// ───────── 資料新鮮度 ─────────
// 文件名稱 → 顯示名稱、負責的程式、多久沒更新算逾時（分鐘）、只在什麼時段要求更新。
export const SOURCES = {
  calendar: { label: '行事日程', by: 'Apps Script', maxAge: 30 },
  weather: { label: '天氣預報', by: 'Apps Script', maxAge: 90 },
  menu: { label: '午餐菜單', by: '辦公室電腦', maxAge: 120 },
  students: { label: '學生人數', by: '辦公室電腦', maxAge: 13 * 60 },
  attendance: { label: '到校狀況', by: '辦公室電腦', maxAge: 45, school: [7 * 60 + 30, 17 * 60] },
  library: { label: '圖書借閱', by: '辦公室電腦', maxAge: 180, school: [8 * 60, 18 * 60] },
  fill: { label: '線上填報', by: '辦公室電腦', maxAge: 90, school: [8 * 60, 18 * 60] },
};

/** 某份文件的狀態：missing（還沒有資料）、stale（逾時）、ok。 */
export function freshness(name, doc, now) {
  const rule = SOURCES[name];
  const at = toDate(doc?.updatedAt);
  if (!doc || !at) return { state: 'missing', at: null };
  const age = (now.getTime() - at.getTime()) / 60000;
  if (rule.school) {
    const t = taipei(now);
    const inHours = t.wd >= 1 && t.wd <= 5 && t.min >= rule.school[0] && t.min <= rule.school[1];
    if (!inHours) return { state: 'ok', at, age };
  }
  return { state: age > rule.maxAge ? 'stale' : 'ok', at, age };
}

function stamp(name, doc, now) {
  const f = freshness(name, doc, now);
  if (f.state === 'missing') return '';
  const t = taipei(f.at);
  const when = t.ymd === taipei(now).ymd ? t.hm : `${t.ymd.slice(5).replace('-', '/')} ${t.hm}`;
  return f.state === 'stale' ? `　${badge('watch', `資料停在 ${when}`)}` : `・更新 ${when}`;
}

function waiting(id, msg) {
  return `${head(id)}<div class="empty">${esc(msg || '尚無資料，等待第一次更新。')}</div>`;
}

// ───────── 行事日程 ─────────
const SRC = { school: '學校', biz: '個人' };
function mkr(s) { return `<span class="mk ${s === 'biz' ? 'biz' : 'school'}" role="img" aria-label="${SRC[s] || '學校'}"></span>`; }
function spanText(x) { return x.span ? `<span class="sp">${esc(x.span.from)}–${esc(x.span.to)}</span>` : ''; }
function evRow(x) {
  return `<li class="ev ${x.src === 'biz' ? 'biz' : ''}"><span class="tm">${x.allDay ? '全日' : esc(x.s)}</span><span class="tt">${mkr(x.src)}${esc(x.t)}${spanText(x)}</span></li>`;
}
const timedFirst = (a, b) => (a.allDay === b.allDay ? String(a.s || '').localeCompare(String(b.s || '')) : (a.allDay ? 1 : -1));

/** 日曆文件 → 依日期排好的天（今天起），找不到今天就從最近的未來那天開始。 */
export function calendarDays(cal, today) {
  if (!cal) return [];
  const all = [cal.today, ...(cal.days || [])].filter(Boolean).map((d) => ({
    date: d.date, md: d.md || `${String(d.date).slice(5, 7)}/${String(d.date).slice(8, 10)}`, weekday: d.weekday, events: d.events || [],
  }));
  return all.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}

function until(m) { return m < 60 ? `${m} 分鐘後` : `${Math.floor(m / 60)} 小時${m % 60 ? `${m % 60} 分` : ''}後`; }

export function focusEvent(days, t) {
  const todayBlock = days.find((d) => d.date === t.ymd);
  const timed = (todayBlock?.events || []).filter((x) => !x.allDay && x.s).sort(timedFirst);
  const cur = timed.find((x) => t.min >= mins(x.s) && x.e && t.min < mins(x.e));
  const nx = timed.find((x) => mins(x.s) > t.min);
  const x = cur || nx;
  if (x) return { x, tm: x.s, lb: cur ? `進行中・至 ${x.e}` : `下一件・${until(mins(x.s) - t.min)}`, todayBlock };
  const later = days.find((d) => d.date > t.ymd && d.events.length);
  if (later) {
    const first = [...later.events].sort(timedFirst)[0];
    return { x: first, tm: later.md, lb: `今天已無行程・接下來是${later.weekday}`, todayBlock };
  }
  return { x: null, todayBlock };
}

function dayBlock(d) {
  const e = [...d.events].sort(timedFirst);
  return `<div class="dayb"><div class="day-h"><b>${esc(d.weekday)}</b><span>${esc(d.md)}・共 ${e.length} 項</span></div>${
    e.length ? `<ul class="evs">${e.slice(0, 2).map(evRow).join('')}</ul>` : '<div class="src">沒有行程</div>'
  }${e.length > 2 ? `<div class="src">另 ${e.length - 2} 項，點開看全部</div>` : ''}</div>`;
}

function calWarnings(cal) {
  return (cal.warnings || []).map((w) => `<div class="src">${badge('watch', `${w.label || w.id}日曆讀不到`)} ${esc(w.problem === 'not-configured' ? '尚未設定' : w.problem)}</div>`).join('');
}

// ───────── 到校狀況的計算 ─────────
export function attendanceSummary(att, students, today) {
  if (!att) return null;
  const leave = att.leave || {};
  const leaveCount = (leave.approved || 0) + (leave.unknown || 0);
  const roll = att.roll || {};
  const total = roll.total || 0;
  const done = roll.morningDone || 0;
  const full = total > 0 && done === total;
  const schoolTotal = students?.school?.t || 0;
  const LONG = [['預警長缺', 'watch'], ['長缺名單', 'alert'], ['預警中輟', 'watch'], ['中輟名單', 'alert']];
  const warn = [];
  for (const [label, k] of LONG) {
    const v = att.longAbsent?.[label];
    if (!v) continue;
    if (v.error) { warn.push({ k: 'watch', cls: label, text: '這份清單這次沒讀到' }); continue; }
    for (const c of v.classes || []) warn.push({ k, cls: c.cls, text: `${label}・${c.n} 人` });
  }
  const streaks = (leave.streaks || []).filter((s) => s.days >= 3).map((s) => ({ k: 'watch', cls: s.cls, text: `${s.type}・連續第 ${s.days} 日・請假至 ${s.until}` }));
  return {
    isToday: att.date === today,
    date: att.date,
    leaveCount,
    pending: leave.pending || 0,
    byType: Object.entries(leave.byType || {}),
    total, done, full,
    pct: total ? Math.round((done / total) * 100) : 0,
    rate: full && schoolTotal ? (((schoolTotal - leaveCount) / schoolTotal) * 100).toFixed(1) : null,
    schoolTotal,
    rows: [...streaks, ...warn],
    longNote: att.longAbsent?.['預警長缺']?.note || '',
  };
}

function row(k, c, t, right = '') { return `<li class="row">${badge(k)}<div><div class="t">${esc(c)}</div><div class="s">${esc(t)}</div></div><span class="num">${right}</span></li>`; }

// ───────── 卡片 ─────────
export function renderCards(D, now) {
  const t = taipei(now);
  const cards = {};

  // 行事日程
  if (!D.calendar) cards.sch = waiting('sch');
  else {
    const days = calendarDays(D.calendar, t.ymd);
    const f = focusEvent(days, t);
    const todayEv = f.todayBlock ? f.todayBlock.events : [];
    const allDay = todayEv.filter((x) => x.allDay);
    const rest = todayEv.filter((x) => !x.allDay && x.s && x !== f.x && (!x.e || mins(x.e) > t.min)).sort(timedFirst);
    const next3 = days.filter((d) => d.date > t.ymd).slice(0, 3);
    const lg = `<span class="legend">${mkr('school')}學校　${mkr('biz')}個人</span>`;
    cards.sch = `${head('sch', lg)}<div class="calw">${
      allDay.length ? `<div class="allday">${allDay.map((x) => `<span>${mkr(x.src)}全日　${esc(x.t)}${spanText(x)}</span>`).join('')}</div>` : ''
    }${
      f.x ? `<div class="next"><span class="tm">${esc(f.tm)}</span><span class="lb">${esc(f.lb)}</span><span class="tt">${mkr(f.x.src)}${esc(f.x.t)}</span></div>` : '<div class="empty">接下來一週沒有排定時間的行程</div>'
    }<section><h3>今天其餘</h3>${rest.length ? `<ul class="evs">${rest.map(evRow).join('')}</ul>` : '<div class="src">今天沒有其他行程</div>'}</section>
      <section><h3>接下來三天</h3>${next3.map(dayBlock).join('') || '<div class="src">沒有資料</div>'}</section>
      ${calWarnings(D.calendar)}<div class="src">Google 日曆：學校與個人${stamp('calendar', D.calendar, now)}</div></div>`;
  }

  // 到校狀況
  const A = attendanceSummary(D.attendance, D.students, t.ymd);
  if (!A) cards.att = waiting('att');
  else {
    cards.att = `${head('att')}${A.isToday ? '' : `<div>${badge('watch', `這是 ${esc(A.date)} 的資料`)}</div>`}
      <div class="att-top"><div><div class="src">今日請假</div><div class="hero">${A.leaveCount}<small>人</small></div></div>
      <div><div class="delta">${A.leaveCount ? `占全校 ${A.schoolTotal ? ((A.leaveCount / A.schoolTotal) * 100).toFixed(1) : '—'}%` : `全校 ${A.schoolTotal || '—'} 人皆無請假單`}</div>
      <div class="chips" style="margin-top:.375rem">${A.byType.length ? A.byType.map(([k, n]) => `<span class="chip">${esc(k)}<b>${n}</b></span>`).join('') : '<span class="chip">無請假</span>'}${A.pending ? `<span class="chip">待簽核<b>${A.pending}</b></span>` : ''}</div></div></div>
      <div class="prog">${A.full ? badge('ok', '點名完成') : badge('watch', '點名未完成')}<div class="bar" role="img" aria-label="早上點名進度 ${A.done}／${A.total} 班"><i style="width:${A.pct}%"></i></div><span class="src">已點名 ${A.done}／${A.total} 班${A.full ? `・到校率 ${A.rate}%` : '・完成前不計到校率'}</span></div>
      <div><div class="src" style="margin-bottom:.375rem">連續缺席與長缺預警</div>${
        A.rows.length ? `<ul class="list">${A.rows.map((r) => row(r.k, r.cls, r.text)).join('')}</ul>` : `<div class="delta">${badge('ok', '目前沒有')} 沒有連續缺席 3 日以上，也沒有長缺預警</div>`
      }</div><div class="src">全誼 學生出缺席・只顯示班級與人數${stamp('attendance', D.attendance, now)}</div>`;
  }

  // 線上填報
  if (!D.fill) cards.fill = `${head('fill')}<div>${badge('off', '資料尚未接上')}</div><div class="empty">線上填報的讀取方式還在校準中，校準完成後會自動出現在這裡。</div>`;
  else {
    const F = D.fill;
    cards.fill = `${head('fill')}<div class="delta"><span class="hl">逾期未填 ${F.byStatus?.overdue ?? 0} 件</span>，未填報 ${F.byStatus?.unfiled ?? 0} 件，已轉發 ${F.byStatus?.forwarded ?? 0} 件</div>
      <ul class="list">${(F.top || []).map((f) => `<li class="row">${badge(f.k)}<div><div class="t clamp">${esc(f.title)}</div><div class="s">${esc(f.role)}・${esc(f.from)}</div></div><div class="num">${esc(f.note)}<small>${esc(f.st)}</small></div></li>`).join('')}</ul>
      <div class="src">${(F.total || 0) > (F.top || []).length ? `另有 ${(F.total || 0) - (F.top || []).length} 件，點開查看全部` : '全部列出'}${stamp('fill', F, now)}</div>`;
  }

  // 學生人數
  const S = D.students;
  if (!S?.school) cards.stu = waiting('stu');
  else {
    cards.stu = `${head('stu')}<div class="stu-top"><div class="kpi">${S.school.t}<small>人</small></div><span class="src">${S.school.n} 班・男 ${S.school.m}・女 ${S.school.f}・平均每班 ${(S.school.t / (S.school.n || 1)).toFixed(1)} 人</span></div>${stuTable(S)}${zones(S)}<div class="src">全誼 學生概況查詢${S.semester ? `・${esc(S.semester)}` : ''}${stamp('students', S, now)}</div>`;
  }

  // 午餐菜單
  const M = D.menu;
  if (!M) cards.menu = waiting('menu');
  else if (!M.found) cards.menu = `${head('menu')}<div class="empty">近 10 天沒有登錄菜單</div><div class="src">教育部校園食材登錄平臺${stamp('menu', M, now)}</div>`;
  else {
    const main = (M.dishes || []).filter((d) => !d.veg);
    const hasVeg = (M.dishes || []).some((d) => d.veg);
    const isToday = M.date === t.ymd;
    cards.menu = `${head('menu')}<div>${isToday ? badge('ok', '今日已登錄') : badge('watch', `今日尚未登錄・顯示 ${String(M.date).slice(5).replace('-', '/')}`)} <span class="src">${M.uploadedAt ? `${esc(M.uploadedAt)} 上傳` : ''}</span></div>
      <div class="chips">${main.slice(0, 6).map((d) => `<span class="chip">${esc(d.dish)}</span>`).join('')}</div><div class="delta">${M.kcal ?? '—'} kcal${hasVeg ? '　<span class="src">另有素食版</span>' : ''}</div><div class="src">教育部校園食材登錄平臺${stamp('menu', M, now)}</div>`;
  }

  // 圖書借閱
  const L = D.library;
  if (!L) cards.lib = waiting('lib');
  else {
    const n = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('zh-TW'));
    cards.lib = `${head('lib')}<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem"><div><div class="src">本日</div><div class="kpi">${n(L.today?.people)}<small>人次</small></div><div class="delta">${n(L.today?.books)} 冊次</div></div><div><div class="src">本月</div><div class="kpi">${n(L.month?.people)}<small>人次</small></div><div class="delta">${n(L.month?.books)} 冊次</div></div></div><div class="src">館藏 ${n(L.stock)} 冊・全國圖書館${stamp('library', L, now)}</div>`;
  }
  return cards;
}

function stuTable(S) {
  const G = ['', '一年級', '二年級', '三年級', '四年級', '五年級', '六年級'];
  return `<table><thead><tr><th>年級</th><th class="c">班</th><th>男</th><th>女</th><th>合計</th></tr></thead><tbody>${
    (S.byGrade || []).filter((g) => g.n).map((g) => `<tr><td>${G[g.grade] || esc(g.grade)}</td><td class="c">${g.n}</td><td>${g.m}</td><td>${g.f}</td><td>${g.t}</td></tr>`).join('')
  }<tr class="sum"><td>全校</td><td class="c">${S.school.n}</td><td>${S.school.m}</td><td>${S.school.f}</td><td>${S.school.t}</td></tr></tbody></table>`;
}
function zones(S) {
  if (!S.zones?.length) return '';
  return `<div class="zones">${S.zones.map((z) => `<div class="zone">${esc(z.label)}<b>${z.t} 人</b>${z.n} 班</div>`).join('')}</div>`;
}

export function renderWeather(W) {
  if (!W?.now) return `<div class="wxc"><div class="loc">天氣預報</div><div class="lbl">尚無資料</div></div>`;
  return `<div class="wxc"><div class="wxc-top"><div><div class="loc">${esc(W.place)}</div><div class="lbl">${esc(W.now.label)}・體感 ${Math.round(W.now.feel)}°</div></div><div class="big">${wicon(W.now.code)}<div class="temp">${Math.round(W.now.t)}<small>°C</small></div></div></div><div class="wxc-days">${
    (W.days || []).map((d) => `<div class="wcd"><span class="dn">${esc(d.label)}</span>${wicon(d.code)}<span class="tp">${Math.round(d.min)}–${Math.round(d.max)}°</span><span class="pp">雨 ${d.pop ?? '—'}%</span></div>`).join('')
  }</div></div>`;
}

/** 上方的統計列與燈號。 */
export function renderBand(D, now) {
  const t = taipei(now);
  const A = attendanceSummary(D.attendance, D.students, t.ymd);
  const F = D.fill;
  const st = (c, l, v, u, id) => `<button class="stat ${c}" data-id="${id}"><span class="l">${l}</span><span class="v">${v}${u ? `<small>${u}</small>` : ''}</span></button>`;
  const band = `<div class="stats">${
    st(F?.counts?.alert ? 'alert' : '', '緊急事項', F ? F.counts?.alert ?? 0 : '—', F ? '件' : '', 'fill')
  }${st(F?.counts?.watch ? 'watch' : '', '留意事項', F ? F.counts?.watch ?? 0 : '—', F ? '件' : '', 'fill')
  }${st(A?.rows.length ? 'watch' : '', '今日請假', A ? A.leaveCount : '—', A ? '人' : '', 'att')
  }${st('', '全校學生', D.students?.school?.t ?? '—', D.students ? '人' : '', 'stu')
  }<div class="card k-wx" data-id="wx" role="button" tabindex="0" aria-label="天氣預報，開啟明細">${renderWeather(D.weather)}</div></div>`;
  let light;
  if (F) {
    const a = F.counts?.alert || 0;
    const w = F.counts?.watch || 0;
    const k = a ? 'alert' : (w ? 'watch' : 'ok');
    light = `<span class="badge light ${k}">${SH[k]}線上填報${LBL[k]}<span class="n">　緊急 ${a}・注意 ${w}</span></span>`;
  } else light = `<span class="badge light off">${SH.off}線上填報尚未接上</span>`;
  return { band, light };
}

/** 頂端提醒：全誼需要重新登入、資料逾時。 */
export function renderNotices(D, now) {
  const out = [];
  const zy = D._status?.zhengyi;
  if (zy && zy.state && zy.state !== 'ok') {
    const msg = { 'need-login': '全誼需要重新登入', 'need-identity': '全誼需要選擇「利澤國小／校長」身份', 'wrong-identity': '全誼的登入身份不對，已停止讀取' }[zy.state] || `全誼狀態：${zy.state}`;
    out.push(`<div class="notice">${SH.alert}${esc(msg)}：請到辦公室電腦的 Chrome 視窗處理。學生人數、到校狀況、圖書借閱會停在上次的資料。</div>`);
  }
  const stale = Object.keys(SOURCES).filter((n) => n !== 'fill' && freshness(n, D[n], now).state === 'stale');
  if (stale.length) {
    const byPc = stale.filter((n) => SOURCES[n].by === '辦公室電腦');
    const tail = byPc.length ? '。辦公室電腦的連線程式可能沒有在執行。' : '';
    out.push(`<div class="notice watch">${SH.watch}資料逾時：${stale.map((n) => SOURCES[n].label).join('、')}${tail}</div>`);
  }
  return out.join('');
}

// ───────── 明細抽屜 ─────────
export function renderDetail(id, D, now) {
  const t = taipei(now);
  if (id === 'sch') {
    const days = calendarDays(D.calendar, t.ymd);
    if (!days.length) return '<section class="sec"><div class="empty">尚無資料</div></section>';
    const lst = (a) => (a.length ? `<ul class="evs">${[...a].sort(timedFirst).map(evRow).join('')}</ul>` : '<div class="src">沒有行程</div>');
    return `<section class="sec"><h3>圖例</h3><div class="src">${mkr('school')}學校　${mkr('biz')}個人</div></section>${days.map((d) => `<section class="sec"><h3>${esc(d.weekday)} ${esc(d.md)}</h3>${lst(d.events)}</section>`).join('')}`;
  }
  if (id === 'att') {
    const A = attendanceSummary(D.attendance, D.students, t.ymd);
    if (!A) return '<section class="sec"><div class="empty">尚無資料</div></section>';
    const periods = D.attendance.roll?.periods || [];
    return `<section class="sec"><h3>連續缺席與長缺預警</h3><div class="src">只顯示班級、假別與天數；座號、姓名不上大屏。</div>${A.rows.length ? `<ul class="list">${A.rows.map((r) => row(r.k, r.cls, r.text)).join('')}</ul>` : '<div>目前沒有。</div>'}${A.longNote ? `<div class="src">預警長缺：${esc(A.longNote)}</div>` : ''}</section>
      <section class="sec"><h3>各節點名進度</h3><div class="tbl"><table><thead><tr><th>節次</th><th>時間</th><th>完成</th><th>未完成</th></tr></thead><tbody>${periods.map((p) => `<tr><td>${esc(p.period)}</td><td>${esc(p.time)}</td><td>${p.done}</td><td>${p.pending}</td></tr>`).join('')}</tbody></table></div><div class="src">早上的點名進度取「班級點名、導師時間、第一節」中完成班數最多的一節。</div></section>
      <section class="sec"><h3>判斷規則</h3><ul style="margin:0;padding-left:1.25rem" class="src"><li>今日請假：今天的已簽核假單，同一位學生只算一次。簽核中的另列「待簽核」。</li><li>連續缺席：假單涵蓋今天，且連續 3 個上課日以上才列出。</li><li>長缺預警：直接取全誼長缺查詢的四份清單，只列班級與人數。</li><li>到校率：全校都完成早上點名後才顯示。</li></ul></section>`;
  }
  if (id === 'fill') {
    const F = D.fill;
    if (!F) return '<section class="sec"><h3>尚未接上</h3><div class="src">線上填報的讀取方式需要在辦公室電腦校準一次（npm run probe -- fill），完成後這裡會列出全部填報與判斷規則。</div></section>';
    return `<section class="sec"><h3>共 ${F.total} 件，依緊急程度排序</h3><ul class="list">${(F.items || []).map((f) => `<li class="row">${badge(f.k)}<div><div class="t">${esc(f.title)}</div><div class="s">${esc(f.st)}・負責：${esc(f.role)}</div><div class="s">發布：${esc(f.from)}・截止 ${esc(f.end ? f.end.replace(/^20/, '').replace(/-/g, '/') : '待確認')}${f.prog ? `・整體進度 ${esc(f.prog)}` : ''}</div></div><div class="num">${esc(f.note)}</div></li>`).join('')}</ul></section>
      <section class="sec"><h3>排序與狀態規則</h3><div class="src">緊急：逾期 ${F.rules?.urgentOverdueDays ?? 14} 天內。注意：未填報且 ${F.rules?.nearDueDays ?? 7} 天內截止，或逾期超過 ${F.rules?.urgentOverdueDays ?? 14} 天。</div></section>`;
  }
  if (id === 'stu') {
    const S = D.students;
    if (!S?.school) return '<section class="sec"><div class="empty">尚無資料</div></section>';
    return `<section class="sec"><h3>各年級${S.semester ? `（${esc(S.semester)}）` : ''}</h3>${stuTable(S)}${zones(S)}</section>
      <section class="sec"><h3>各班人數</h3><div class="tbl"><table><thead><tr><th>班級</th><th>男</th><th>女</th><th>合計</th></tr></thead><tbody>${(S.classes || []).map((c) => `<tr><td>${esc(c.cls)}</td><td>${c.m}</td><td>${c.f}</td><td>${c.t}</td></tr>`).join('')}<tr class="sum"><td>全校 ${S.school.n} 班</td><td>${S.school.m}</td><td>${S.school.f}</td><td>${S.school.t}</td></tr></tbody></table></div></section>`;
  }
  if (id === 'menu') {
    const M = D.menu;
    if (!M?.found) return '<section class="sec"><div class="empty">尚無菜單</div></section>';
    const nu = M.nutrition || {};
    const NU = [['全穀雜糧', nu.grains], ['豆魚蛋肉', nu.meatBeans], ['蔬菜', nu.vegetable], ['水果', nu.fruit], ['乳品', nu.milk], ['油脂', nu.oil]].filter(([, v]) => v !== null && v !== undefined);
    return `<section class="sec"><h3>${esc(String(M.date).slice(5).replace('-', '/'))} 午餐</h3><ul class="list">${(M.dishes || []).map((d) => `<li class="row" style="grid-template-columns:5rem 1fr"><span class="s">${esc(d.type)}</span><span>${esc(d.dish)}</span></li>`).join('')}</ul><div>熱量 ${M.kcal ?? '—'} kcal</div>${NU.length ? `<div class="chips">${NU.map(([k, v]) => `<span class="chip">${k}<b>${v}</b></span>`).join('')}</div>` : ''}<div class="src">${M.uploadedAt ? `${esc(M.uploadedAt)} 上傳。` : ''}學校當天下午才登錄，早上尚未登錄時顯示最近一次。</div></section>`;
  }
  if (id === 'lib') {
    const L = D.library;
    if (!L) return '<section class="sec"><div class="empty">尚無資料</div></section>';
    return `<section class="sec"><h3>借閱統計</h3><div>本日 ${L.today?.people ?? '—'} 人次・${L.today?.books ?? '—'} 冊次</div><div>本月 ${L.month?.people ?? '—'} 人次・${L.month?.books ?? '—'} 冊次</div><div class="src">館藏 ${L.stock ?? '—'} 冊</div></section>${
      L.rankByClass?.length ? `<section class="sec"><h3>各班借閱排行</h3><ul class="list">${L.rankByClass.map((r, i) => `<li class="row" style="grid-template-columns:2rem 1fr auto"><b>${i + 1}</b><span>${esc(r.cls)}</span><span class="num">${r.books} 本</span></li>`).join('')}</ul></section>` : ''}`;
  }
  if (id === 'wx') {
    const W = D.weather;
    if (!W) return '<section class="sec"><div class="empty">尚無資料</div></section>';
    return `<section class="sec"><h3>今天起三天</h3>${(W.days || []).map((d) => `<div>${esc(d.label)}：${esc(d.label2)}・${Math.round(d.min)}–${Math.round(d.max)}°・降雨機率 ${d.pop ?? '—'}%</div>`).join('')}<div class="src">Open-Meteo・${esc(W.place)}</div></section>`;
  }
  if (id === 'src') {
    const S = D._status || {};
    const r = (name) => {
      const f = freshness(name, D[name], now);
      const s = S[name];
      const color = f.state === 'ok' ? 'var(--good)' : (f.state === 'stale' ? 'var(--watch)' : 'var(--muted)');
      const when = f.at ? `${taipei(f.at).ymd.slice(5).replace('-', '/')} ${taipei(f.at).hm}` : '尚無資料';
      const err = s && s.ok === false ? `最近一次失敗：${s.error}` : '';
      return `<li class="row" style="grid-template-columns:auto 1fr auto"><span class="dot" style="background:${color}"></span><div><div class="t">${SOURCES[name].label}</div><div class="s">${SOURCES[name].by}${err ? `・${esc(err)}` : ''}</div></div><div class="num" style="font-size:.875rem">${when}</div></li>`;
    };
    const zy = S.zhengyi;
    return `<section class="sec"><ul class="list">${Object.keys(SOURCES).map(r).join('')}</ul></section>
      <section class="sec"><h3>全誼登入狀態</h3><div class="src">${zy ? esc({ ok: '已登入', 'need-login': '需要重新登入', 'need-identity': '需要選擇身份', 'wrong-identity': '身份不對，已停止讀取' }[zy.state] || zy.state) : '尚無紀錄'}</div></section>
      <section class="sec"><h3>資料怎麼來的</h3><div class="src">行事日程與天氣由 Google Apps Script 定時更新；其餘由辦公室電腦的連線程式讀取全誼與教育部平臺後上傳。全誼的帳號密碼只由校長本人輸入，學生姓名、座號不上傳。</div></section>`;
  }
  return '';
}

export function headerTime(now) {
  const t = taipei(now);
  const PERIODS = [['第 1 節', '08:40', '09:20'], ['第 2 節', '09:30', '10:10'], ['第 3 節', '10:30', '11:10'], ['第 4 節', '11:20', '12:00'], ['午休', '12:00', '13:30'], ['第 5 節', '13:30', '14:10'], ['第 6 節', '14:20', '15:00'], ['第 7 節', '15:10', '15:50']];
  const p = PERIODS.find((x) => t.min >= mins(x[1]) && t.min < mins(x[2]));
  return `${t.md} ${t.wdLabel} ${t.hm}${p ? `・${p[0]}` : ''}`;
}

