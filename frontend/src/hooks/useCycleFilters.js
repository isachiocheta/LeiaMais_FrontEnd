import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { cycleQuery, changeCycleFilters, readCycleQuery } from '../utils/cycle-query.js';

const navigationOptions = { preventScrollReset: true, flushSync: true };

export function useCycleFilters() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const search = params.toString();
  const parsed = useMemo(() => readCycleQuery(new URLSearchParams(search)), [search]);
  const [draft, setDraft] = useState(parsed.filters.q);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    setDraft(parsed.filters.q);
  }, [location.key, parsed.filters.q]);

  useEffect(() => {
    if (draft.trim() === parsed.filters.q) return;
    timer.current = setTimeout(() => {
      setParams(cycleQuery(changeCycleFilters(parsed.filters, { q: draft })), navigationOptions);
    }, 350);
    return () => clearTimeout(timer.current);
  }, [draft, parsed.filters, setParams]);

  function update(changes) {
    clearTimeout(timer.current);
    setParams(cycleQuery(changeCycleFilters(parsed.filters, { q: draft, ...changes })), navigationOptions);
  }

  function clear() {
    clearTimeout(timer.current);
    setDraft('');
    setParams(new URLSearchParams(), navigationOptions);
  }

  const goPage = useCallback((page, { replace = false, flushSync = true } = {}) => {
    setParams(cycleQuery({ ...parsed.filters, page }), { ...navigationOptions, replace, flushSync });
  }, [parsed.filters, setParams]);

  return {
    ...parsed, draft, setDraft, update, clear, search,
    waiting: draft.trim() !== parsed.filters.q,
    goPage,
    hasChanges: search.length > 0 || draft.length > 0,
  };
}
