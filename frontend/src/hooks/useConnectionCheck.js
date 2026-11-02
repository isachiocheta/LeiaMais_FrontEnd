import { useCallback, useEffect, useRef, useState } from 'react';
import { checkConnection } from '../services/connection.js';

export function useConnectionCheck() {
  const controllerRef = useRef(null);
  const [state, setState] = useState({ status: 'idle', error: null });

  useEffect(() => () => controllerRef.current?.abort(), []);

  const check = useCallback(async () => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'loading', error: null });
    try {
      await checkConnection({ signal: controller.signal });
      if (!controller.signal.aborted) setState({ status: 'success', error: null });
    } catch (error) {
      if (!controller.signal.aborted) setState({ status: 'error', error });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  return { ...state, check };
}
