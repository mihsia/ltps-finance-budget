import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { exactValueEqual } from '../lib/fixedFieldEditing';

const SOURCE_CHANGED_MESSAGE = '資料已在儲存期間變更，已重新載入最新內容。';

function toForm(data, fields) {
  return Object.fromEntries(fields.map((field) => [
    field,
    data?.[field] == null ? '' : String(data[field]),
  ]));
}

function unrelatedData(data, fields) {
  if (!data) return {};
  const omitted = new Set([...fields, 'updatedAt']);
  return Object.fromEntries(
    Object.entries(data).filter(([field]) => !omitted.has(field)),
  );
}

function isExactSubmittedEcho(source, attempt, fields) {
  if (!source) return false;
  return fields.every(
    (field) => Object.hasOwn(source, field)
      && exactValueEqual(source[field], attempt.submitted[field]),
  ) && exactValueEqual(
    unrelatedData(source, fields),
    unrelatedData(attempt.baseSource, fields),
  );
}

function committedSource(baseSource, submitted) {
  return { ...(baseSource || {}), ...submitted };
}

export function useFixedFieldEditor({ scopeKey, data, fields }) {
  const scopeGeneration = useMemo(() => ({ scopeKey }), [scopeKey]);
  const activeScopeRef = useRef(scopeGeneration);
  activeScopeRef.current = scopeGeneration;
  const observedScopeRef = useRef(scopeGeneration);
  const sourceRef = useRef(data);
  const attemptRef = useRef(null);
  const delayedEchoRef = useRef(null);
  const editingRef = useRef(false);
  const pendingRef = useRef(false);
  const [state, setState] = useState(() => ({
    form: toForm(data, fields),
    editing: false,
    pending: false,
    message: null,
  }));

  useEffect(() => () => {
    if (activeScopeRef.current === scopeGeneration) activeScopeRef.current = null;
  }, [scopeGeneration]);

  useEffect(() => {
    if (observedScopeRef.current !== scopeGeneration) {
      observedScopeRef.current = scopeGeneration;
      sourceRef.current = data;
      attemptRef.current = null;
      delayedEchoRef.current = null;
      editingRef.current = false;
      pendingRef.current = false;
      setState({
        form: toForm(data, fields),
        editing: false,
        pending: false,
        message: null,
      });
      return;
    }
    if (sourceRef.current === data) return;

    const attempt = attemptRef.current;
    if (attempt) {
      const exactEcho = isExactSubmittedEcho(data, attempt, fields);
      sourceRef.current = data;
      if (exactEcho && attempt.echoCount === 0 && !attempt.invalid) {
        attempt.echoCount = 1;
        setState((current) => ({ ...current, form: toForm(data, fields) }));
        return;
      }

      attempt.invalid = true;
      editingRef.current = false;
      setState((current) => ({
        ...current,
        form: toForm(data, fields),
        editing: false,
        message: SOURCE_CHANGED_MESSAGE,
      }));
      return;
    }

    const delayedEcho = delayedEchoRef.current;
    if (delayedEcho) {
      delayedEchoRef.current = null;
      if (isExactSubmittedEcho(data, delayedEcho, fields)) {
        sourceRef.current = data;
        return;
      }
    }

    sourceRef.current = data;

    if (editingRef.current) {
      editingRef.current = false;
      setState({
        form: toForm(data, fields),
        editing: false,
        pending: false,
        message: '資料來源已變更，本次編輯已取消。',
      });
      return;
    }

    setState({
      form: toForm(data, fields),
      editing: false,
      pending: false,
      message: null,
    });
  }, [data, fields, scopeGeneration]);

  const isCurrent = useCallback(
    () => activeScopeRef.current === scopeGeneration,
    [scopeGeneration],
  );

  const beginEditing = useCallback(() => {
    if (!isCurrent() || pendingRef.current) return false;
    attemptRef.current = null;
    editingRef.current = true;
    setState({
      form: toForm(sourceRef.current, fields),
      editing: true,
      pending: false,
      message: null,
    });
    return true;
  }, [fields, isCurrent]);

  const cancelEditing = useCallback(() => {
    if (!isCurrent() || pendingRef.current) return false;
    attemptRef.current = null;
    editingRef.current = false;
    setState({
      form: toForm(sourceRef.current, fields),
      editing: false,
      pending: false,
      message: null,
    });
    return true;
  }, [fields, isCurrent]);

  const updateField = useCallback((field, value) => {
    if (!isCurrent() || !editingRef.current || pendingRef.current || !fields.includes(field)) {
      return false;
    }
    setState((current) => ({
      ...current,
      form: { ...current.form, [field]: value },
    }));
    return true;
  }, [fields, isCurrent]);

  const beginSave = useCallback((submitted) => {
    if (!isCurrent() || pendingRef.current || !editingRef.current) return null;
    const token = { scopeGeneration };
    delayedEchoRef.current = null;
    attemptRef.current = {
      token,
      baseSource: sourceRef.current,
      submitted,
      echoCount: 0,
      invalid: false,
      settled: false,
    };
    pendingRef.current = true;
    setState((current) => ({ ...current, pending: true, message: '儲存中…' }));
    return token;
  }, [isCurrent, scopeGeneration]);

  const saveSucceeded = useCallback((token) => {
    const attempt = attemptRef.current;
    if (!isCurrent() || attempt?.token !== token) return false;
    pendingRef.current = false;
    editingRef.current = false;
    if (attempt.invalid) {
      attemptRef.current = null;
      setState({
        form: toForm(sourceRef.current, fields),
        editing: false,
        pending: false,
        message: SOURCE_CHANGED_MESSAGE,
      });
      return false;
    }
    sourceRef.current = committedSource(sourceRef.current, attempt.submitted);
    delayedEchoRef.current = attempt.echoCount === 0 ? attempt : null;
    attemptRef.current = null;
    setState((current) => ({
      ...current,
      form: toForm(attempt.submitted, fields),
      editing: false,
      pending: false,
      message: '儲存成功。',
    }));
    return true;
  }, [fields, isCurrent]);

  const saveFailed = useCallback((token, message = '儲存失敗，請稍後再試。') => {
    const attempt = attemptRef.current;
    if (!isCurrent() || attempt?.token !== token) return false;
    attemptRef.current = null;
    pendingRef.current = false;
    if (attempt.invalid) {
      editingRef.current = false;
      setState({
        form: toForm(sourceRef.current, fields),
        editing: false,
        pending: false,
        message: SOURCE_CHANGED_MESSAGE,
      });
      return false;
    }
    editingRef.current = true;
    setState((current) => ({ ...current, editing: true, pending: false, message }));
    return false;
  }, [fields, isCurrent]);

  const setMessage = useCallback((message) => {
    if (!isCurrent()) return false;
    setState((current) => ({ ...current, message }));
    return true;
  }, [isCurrent]);

  return {
    ...state,
    beginEditing,
    cancelEditing,
    updateField,
    beginSave,
    saveSucceeded,
    saveFailed,
    setMessage,
  };
}
