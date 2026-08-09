const DENIALS = {
  'signed-out': {
    allowed: false,
    code: 'not-signed-in',
    reason: '請先登入後再操作。',
  },
  loading: {
    allowed: false,
    code: 'profile-loading',
    reason: '正在確認帳號權限，請稍候。',
  },
  missing: {
    allowed: false,
    code: 'profile-missing',
    reason: '找不到此帳號的權限資料，請聯絡系統管理員。',
  },
  error: {
    allowed: false,
    code: 'profile-error',
    reason: '無法確認帳號權限，請稍後再試或聯絡系統管理員。',
  },
};

export function evaluateProfileAccess({ profileState, profile = null }) {
  if (profileState !== 'ready') {
    return DENIALS[profileState] || DENIALS.error;
  }
  if (profile?.status !== 'active') {
    if (profile?.status === 'disabled') {
      return {
        allowed: false,
        code: 'profile-disabled',
        reason: '此帳號已停用，請聯絡系統管理員。',
      };
    }
    return {
      allowed: false,
      code: 'profile-inactive',
      reason: '此帳號尚未啟用，請聯絡系統管理員。',
    };
  }
  if (profile.role !== 'admin' && profile.role !== 'editor') {
    return {
      allowed: false,
      code: 'role-denied',
      reason: '此帳號沒有系統編輯權限，請聯絡系統管理員。',
    };
  }
  return {
    allowed: true,
    code: 'access-granted',
    reason: null,
    role: profile.role,
    modules: Array.isArray(profile.modules) ? [...profile.modules] : [],
  };
}

export function checkModuleAccess(access, moduleKey) {
  if (!access?.allowed) return access || DENIALS.error;
  if (access.role === 'admin' || access.modules.includes(moduleKey)) {
    return { allowed: true, code: 'access-granted', reason: null };
  }
  return {
    allowed: false,
    code: 'module-denied',
    reason: `此帳號沒有「${moduleKey}」模組的編輯權限。`,
  };
}

export function checkAdminAccess(access) {
  if (!access?.allowed) return access || DENIALS.error;
  if (access.role === 'admin') {
    return { allowed: true, code: 'access-granted', reason: null };
  }
  return {
    allowed: false,
    code: 'admin-required',
    reason: '此功能僅限系統管理員使用。',
  };
}

export function createAuthorizationSource(initialAccess = DENIALS.loading, initialActor = null) {
  let currentAccess = initialAccess;
  let currentActor = initialActor;

  const withCurrentActor = (decision) => {
    if (!decision.allowed) return decision;
    if (
      typeof currentActor?.uid !== 'string'
      || !currentActor.uid
      || typeof currentActor?.name !== 'string'
      || !currentActor.name
    ) {
      return {
        allowed: false,
        code: 'actor-missing',
        reason: '無法確認操作者身分，請重新登入。',
      };
    }
    return { ...decision, actor: { ...currentActor } };
  };

  return {
    replace(nextAccess, nextActor = null) {
      currentAccess = nextAccess || DENIALS.error;
      currentActor = nextActor;
    },
    current: () => currentAccess,
    authorizeModule: (moduleKey) => checkModuleAccess(currentAccess, moduleKey),
    authorizeModuleActor: (moduleKey) => withCurrentActor(
      checkModuleAccess(currentAccess, moduleKey),
    ),
    authorizeAdmin: () => checkAdminAccess(currentAccess),
    authorizeAdminActor: () => withCurrentActor(checkAdminAccess(currentAccess)),
  };
}

export async function runAuthorized(authorize, mutation) {
  const decision = authorize();
  if (!decision.allowed) return { ...decision, executed: false };

  const value = await mutation(decision);
  return { ...decision, executed: true, value };
}
