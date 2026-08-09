import { useCallback, useEffect, useMemo, useRef } from 'react';

export function useCurrentYearGuard(selectedYear) {
  const lifetimeToken = useMemo(() => ({}), []);
  const scopeToken = useMemo(
    () => ({ lifetimeToken, selectedYear }),
    [lifetimeToken, selectedYear],
  );
  const activeScopeRef = useRef(null);
  activeScopeRef.current = scopeToken;

  useEffect(() => () => {
    if (activeScopeRef.current === scopeToken) activeScopeRef.current = null;
  }, [scopeToken]);

  return useCallback(
    () => activeScopeRef.current === scopeToken,
    [scopeToken],
  );
}
