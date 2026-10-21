// Server-side account rules. Kept free of Firebase imports so the same
// validation that guards the callable functions can be unit-tested directly.
//
// Mirrors the left-nav module keys in src/lib/nav.js (minus 'dashboard', which
// every signed-in user can already see and so is never an assignable scope).
const ACCOUNT_MODULE_KEYS = [
  'basic', 'specialNeeds', 'budget', 'library', 'language', 'languageCert',
  'awards', 'club', 'careSupport', 'land', 'inquiry',
  'budgetbook', 'report', 'archive', 'settings',
];

const VALID_ROLES = ['admin', 'editor'];
const VALID_STATUSES = ['active', 'disabled'];
const VALID_DEPTS = ['校長室', '教務處', '學務處', '總務處', '人事室', '會計室'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const invalid = (error) => ({ valid: false, error, value: null });

/**
 * Validates an account profile payload from an admin. Returns only the fields
 * the server is willing to persist — notably `status` is never taken from the
 * caller, so a crafted payload cannot activate or disable an account through
 * the create/update path (that goes through validateStatusRequest instead).
 */
function validateAccountProfile(input) {
  const { name, email, dept, role, modules } = input || {};

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) return invalid('請輸入姓名');

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(normalizedEmail)) return invalid('請輸入有效的 Email 帳號');

  if (!VALID_DEPTS.includes(dept)) return invalid('請選擇有效的處室');

  if (!VALID_ROLES.includes(role)) return invalid('請選擇有效的權限');

  // Admins already reach every module, so an admin carrying a module list would
  // leave two disagreeing sources of scope. Normalize it away at the boundary.
  let normalizedModules = [];
  if (role === 'editor') {
    if (!Array.isArray(modules)) return invalid('負責模組格式錯誤');
    const unknown = modules.find((key) => !ACCOUNT_MODULE_KEYS.includes(key));
    if (unknown !== undefined) return invalid(`負責模組不存在：${unknown}`);
    normalizedModules = [...new Set(modules)];
  }

  return {
    valid: true,
    error: null,
    value: {
      name: trimmedName,
      email: normalizedEmail,
      dept,
      role,
      modules: normalizedModules,
    },
  };
}

/** Adds the server-owned fields for a freshly created account. */
function buildCreatedProfile({ value, callerUid, now }) {
  return {
    ...value,
    // Access checks are fail-closed on anything but an explicit 'active', so a
    // new account must be marked active here or it could never sign in.
    status: 'active',
    createdAt: now,
    createdBy: callerUid,
  };
}

/** Fields an admin is allowed to change on an existing account. */
function buildUpdatedProfile({ value, callerUid, now }) {
  return {
    name: value.name,
    dept: value.dept,
    role: value.role,
    modules: value.modules,
    updatedAt: now,
    updatedBy: callerUid,
  };
}

function validateStatusRequest({ uid, status, callerUid }) {
  if (typeof uid !== 'string' || !uid.trim()) return { valid: false, error: '缺少帳號識別碼' };
  if (!VALID_STATUSES.includes(status)) return { valid: false, error: '帳號狀態不正確' };
  // Guards against an admin locking themselves out of the only admin surface.
  if (uid === callerUid && status === 'disabled') {
    return { valid: false, error: '無法停用自己的帳號，請由其他管理者操作' };
  }
  return { valid: true, error: null };
}

function buildStatusChange({ status, callerUid, now }) {
  return {
    profile: {
      status,
      statusChangedAt: now,
      statusChangedBy: callerUid,
    },
    // Disabling the Firestore profile alone would still leave a valid Auth
    // session; disable the Auth user in step so existing tokens stop working.
    authDisabled: status === 'disabled',
  };
}

/**
 * Decides whether a Firebase Auth sign-in (any provider, including a brand
 * new Google account that has never been seen before) should be allowed to
 * proceed, given the /users profile (if any) matching its email. Returns
 * null when the sign-in is allowed, or a Chinese message to reject it with
 * otherwise — called from the beforeCreate/beforeSignIn blocking functions
 * in index.js so an email never listed in /users (or no longer active)
 * can never obtain a session in the first place, not just get a denied
 * screen after the fact like evaluateProfileAccess on the client.
 */
function describeSignInDenial(profile) {
  if (!profile) return '此帳號尚未建立，請聯絡系統管理員新增帳號後再登入。';
  if (profile.status !== 'active') return '此帳號已停用，請聯絡系統管理員。';
  return null;
}

// Reverse of src/lib/nav.js's module labels, for the subset of modules an
// account can actually be scoped to (ACCOUNT_MODULE_KEYS) — lets an xlsx
// import use the same Chinese names shown in the Settings UI instead of
// requiring the raw module keys. Keep in sync with src/lib/nav.js.
const MODULE_LABELS = {
  basic: '基本資料',
  specialNeeds: '特生統計',
  budget: '歲入歲出',
  library: '圖書藏書',
  language: '族語開班',
  languageCert: '族語認證',
  awards: '獲獎紀錄',
  club: '課後社團',
  careSupport: '課照學扶',
  land: '土地現值',
  inquiry: '質詢答詢',
  budgetbook: '預算書表',
  report: '報表匯出',
  archive: '歷史歸檔',
  settings: '帳號管理',
};
const MODULE_LABEL_TO_KEY = Object.fromEntries(
  Object.entries(MODULE_LABELS).map(([key, label]) => [label, key]),
);

const ROLE_LABEL_TO_VALUE = { 管理者: 'admin', 填報人員: 'editor' };

const DEFAULT_IMPORT_EMAIL_DOMAIN = '@tmail.ilc.edu.tw';

/**
 * Turns one raw xlsx import row (every field a plain string, however the
 * admin typed it) into the {name, email, dept, role, modules} shape
 * validateAccountProfile expects — the default-domain, role-label, and
 * module-label handling an xlsx import needs that a single manual create
 * through the Settings form doesn't.
 */
function normalizeImportRow(raw) {
  const name = typeof raw?.name === 'string' ? raw.name.trim() : '';

  const rawAccount = typeof raw?.account === 'string' ? raw.account.trim() : '';
  const email = rawAccount
    ? (rawAccount.includes('@') ? rawAccount : `${rawAccount}${DEFAULT_IMPORT_EMAIL_DOMAIN}`).toLowerCase()
    : '';

  const dept = typeof raw?.dept === 'string' ? raw.dept.trim() : raw?.dept;

  const rawRole = typeof raw?.role === 'string' ? raw.role.trim() : '';
  const role = ROLE_LABEL_TO_VALUE[rawRole] || rawRole.toLowerCase();

  const rawModules = typeof raw?.modules === 'string' ? raw.modules : '';
  const modules = rawModules
    .split(/[、,，\s]+/)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map((piece) => MODULE_LABEL_TO_KEY[piece] || piece);

  return { name, email, dept, role, modules };
}

module.exports = {
  ACCOUNT_MODULE_KEYS,
  VALID_DEPTS,
  VALID_ROLES,
  VALID_STATUSES,
  MODULE_LABELS,
  MODULE_LABEL_TO_KEY,
  ROLE_LABEL_TO_VALUE,
  DEFAULT_IMPORT_EMAIL_DOMAIN,
  validateAccountProfile,
  buildCreatedProfile,
  buildUpdatedProfile,
  validateStatusRequest,
  buildStatusChange,
  describeSignInDenial,
  normalizeImportRow,
};
