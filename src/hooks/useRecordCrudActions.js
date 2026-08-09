import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runAuthorized } from '../lib/accessPolicy';

const PENDING_MESSAGE = '資料處理中，請稍候。';

export function useRecordCrudActions({
  scopeKey,
  moduleKey,
  hasCurrentYear,
  yearState,
  recordState,
  authorizeModuleActor,
}) {
  const scopeToken = useMemo(() => ({ scopeKey }), [scopeKey]);
  const activeScopeRef = useRef(scopeToken);
  const pendingRef = useRef({ scopeToken, keys: new Set() });
  activeScopeRef.current = scopeToken;
  if (pendingRef.current.scopeToken !== scopeToken) {
    pendingRef.current = { scopeToken, keys: new Set() };
  }
  const [view, setView] = useState(() => ({
    scopeToken,
    message: null,
    pendingKeys: [],
  }));

  useEffect(() => {
    setView({ scopeToken, message: null, pendingKeys: [] });
    return () => {
      if (activeScopeRef.current === scopeToken) activeScopeRef.current = null;
      if (pendingRef.current.scopeToken === scopeToken) {
        pendingRef.current = { scopeToken: null, keys: new Set() };
      }
    };
  }, [scopeToken]);

  const publish = useCallback((change) => {
    if (activeScopeRef.current !== scopeToken) return false;
    setView((current) => {
      const base = current.scopeToken === scopeToken
        ? current
        : { scopeToken, message: null, pendingKeys: [] };
      return typeof change === 'function' ? change(base) : { ...base, ...change };
    });
    return true;
  }, [scopeToken]);

  const setMessage = useCallback((message) => publish({ message }), [publish]);

  const checkInvocation = useCallback(() => {
    if (activeScopeRef.current !== scopeToken) {
      return { allowed: false, reason: '目前選擇的年度已變更，請重新操作。' };
    }
    if (!hasCurrentYear()) {
      return { allowed: false, reason: '目前選擇的年度已變更，請重新操作。' };
    }
    const yearDecision = yearState.authorizeWrite();
    if (!yearDecision.allowed) return yearDecision;
    return recordState.authorizeWrite();
  }, [hasCurrentYear, recordState, scopeToken, yearState]);

  const applyGuardResult = useCallback((result) => {
    if (!result.executed) {
      setMessage(result.reason);
      return false;
    }
    if (result.value?.allowed === false) {
      setMessage(result.value.reason);
      return false;
    }
    return true;
  }, [setMessage]);

  const runControl = useCallback(async (action) => {
    const result = await runAuthorized(() => authorizeModuleActor(moduleKey), async () => {
      const decision = checkInvocation();
      if (!decision.allowed) return decision;
      if (pendingRef.current.keys.size > 0) {
        return { allowed: false, reason: PENDING_MESSAGE };
      }
      await action();
      return { allowed: true };
    });
    return applyGuardResult(result);
  }, [applyGuardResult, authorizeModuleActor, checkInvocation, moduleKey]);

  const runMutation = useCallback(async ({
    pendingKey,
    validate,
    mutate,
    onSuccess,
    successMessage,
    failureMessage = '操作失敗，請稍後再試。',
  }) => {
    const result = await runAuthorized(() => authorizeModuleActor(moduleKey), async ({ actor }) => {
      const decision = checkInvocation();
      if (!decision.allowed) return decision;
      const validation = validate();
      if (!validation.valid) return { allowed: false, reason: validation.error };

      const pending = pendingRef.current;
      if (
        pending.scopeToken !== scopeToken
        || pending.keys.has(pendingKey)
        || pending.keys.has('form')
        || (pendingKey === 'form' && pending.keys.size > 0)
      ) return { allowed: true };

      pending.keys.add(pendingKey);
      publish({ message: '處理中…', pendingKeys: [...pending.keys] });
      try {
        await mutate(actor, validation.data);
        if (activeScopeRef.current === scopeToken) {
          onSuccess?.();
          publish({ message: successMessage, pendingKeys: [] });
        }
      } catch {
        if (activeScopeRef.current === scopeToken) {
          publish({ message: failureMessage, pendingKeys: [] });
        }
      } finally {
        if (pendingRef.current.scopeToken === scopeToken) {
          pendingRef.current.keys.delete(pendingKey);
          if (activeScopeRef.current === scopeToken) {
            publish((current) => ({
              ...current,
              pendingKeys: [...pendingRef.current.keys],
            }));
          }
        }
      }
      return { allowed: true };
    });
    return applyGuardResult(result);
  }, [
    applyGuardResult,
    authorizeModuleActor,
    checkInvocation,
    moduleKey,
    publish,
    scopeToken,
  ]);

  const visible = view.scopeToken === scopeToken
    ? view
    : { scopeToken, message: null, pendingKeys: [] };

  return {
    message: visible.message,
    pending: visible.pendingKeys.length > 0,
    formPending: visible.pendingKeys.includes('form'),
    isRowPending: (recordId) => visible.pendingKeys.includes(`row:${recordId}`),
    setMessage,
    runControl,
    runMutation,
  };
}
