import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createDashboardResource } from '../utils/dashboard-resource.js';

export function useAdminDashboard(service) {
  const resource = useMemo(() => createDashboardResource(service), [service]);
  const state = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
  useEffect(() => { resource.refresh(); return resource.clear; }, [resource]);
  return { ...state, refresh: resource.refresh };
}
