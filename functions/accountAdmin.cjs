// Server-side account rules. Kept free of Firebase imports so the same
// validation that guards the callable functions can be unit-tested directly.
//
// Mirrors the left-nav module keys in src/lib/nav.js (minus 'dashboard', which
// every signed-in user can already see and so is never an assignable scope).
const ACCOUNT_MODULE_KEYS = [
  'basic', 'budget', 'library', 'language',
  'awards', 'club', 'land', 'inquiry',
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

module.exports = {
  ACCOUNT_MODULE_KEYS,
  VALID_DEPTS,
  VALID_ROLES,
  VALID_STATUSES,
  validateAccountProfile,
  buildCreatedProfile,
  buildUpdatedProfile,
  validateStatusRequest,
  buildStatusChange,
};
