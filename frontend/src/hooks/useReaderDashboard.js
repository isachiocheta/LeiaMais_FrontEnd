import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { createDashboardResource } from '../utils/dashboard-resource.js';

export function useReaderDashboard(service, userId) {
  const { key } = useLocation();
  const resource = useMemo(() => createDashboardResource(service.getMine), [service, userId]);
  const state = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  useEffect(() => { resource.refresh(); return resource.clear; }, [resource, key]);
  return { ...state, refresh: resource.refresh };
}
