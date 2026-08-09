import { useCallback, useEffect, useMemo, useRef } from 'react';

export function useCurrentYearGuard(selectedYear, latestYear = selectedYear) {
  const lifetimeToken = useMemo(() => ({}), []);
  const scopeToken = useMemo(
    () => ({ lifetimeToken, selectedYear, latestYear }),
    [latestYear, lifetimeToken, selectedYear],
  );
  const activeScopeRef = useRef(null);
  activeScopeRef.current = scopeToken;

  useEffect(() => () => {
    if (activeScopeRef.current === scopeToken) activeScopeRef.current = null;
  }, [scopeToken]);

  return useCallback(
    () => activeScopeRef.current === scopeToken && selectedYear === latestYear,
    [latestYear, scopeToken, selectedYear],
  );
}
