import { useCallback, useEffect, useState } from 'react';
import { startRequest } from '../utils/request-task.js';

export function useApiResource(key, load, enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: null, status: 'loading', data: null, error: null });
  useEffect(() => {
    if (!enabled) return;
    setState({ key, status: 'loading', data: null, error: null });
    const task = startRequest(load, {
      onSuccess: (data) => setState({ key, status: 'success', data, error: null }),
      onError: (error) => setState({ key, status: 'error', data: null, error }),
    });
    return task.cancel;
  }, [key, load, enabled, attempt]);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const current = enabled && state.key === key ? state : { status: 'loading', data: null, error: null };
  return { ...current, reload };
}
