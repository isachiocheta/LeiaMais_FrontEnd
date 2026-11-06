export function startRequest(task, { onSuccess, onError }) {
  const controller = new AbortController();
  let active = true;
  const finished = Promise.resolve().then(() => {
    if (!controller.signal.aborted) return task({ signal: controller.signal });
  }).then(
    (data) => { if (active && !controller.signal.aborted) onSuccess(data); },
    (error) => { if (active && !controller.signal.aborted) onError(error); },
  );
  return {
    finished,
    cancel() { active = false; controller.abort(); },
  };
}
