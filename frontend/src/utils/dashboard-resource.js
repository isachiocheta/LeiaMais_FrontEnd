export function createDashboardResource(service) {
  const empty = Object.freeze({ status: 'loading', data: null, error: null });
  let state = empty, request = null, generation = 0;
  const listeners = new Set();
  function publish(next) { state = Object.freeze(next); listeners.forEach((listener) => listener()); }
  function refresh() {
    if (request) return request.promise;
    const controller = new AbortController(); const current = { controller, generation: ++generation };
    request = current;
    publish({ status: state.data ? 'refreshing' : 'loading', data: state.data, error: null });
    current.promise = Promise.resolve().then(() => {
      if (!controller.signal.aborted) return service.getAdmin({ signal: controller.signal });
    }).then((data) => {
      if (request === current && !controller.signal.aborted && generation === current.generation) publish({ status: 'success', data, error: null });
    }, (error) => {
      if (request !== current || controller.signal.aborted || generation !== current.generation) return;
      const previous = [401, 403].includes(error.status) ? null : state.data;
      publish({ status: previous ? 'stale' : 'error', data: previous, error });
    }).finally(() => { if (request === current) request = null; });
    return current.promise;
  }
  return Object.freeze({
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    refresh,
    clear() { generation++; const current = request; request = null; current?.controller.abort(); publish(empty); },
  });
}
