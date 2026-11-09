let revision = 0;
const listeners = new Set();
export const meetingChanges = {
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  snapshot: () => revision,
  invalidate() { revision += 1; listeners.forEach((listener) => listener()); },
};
