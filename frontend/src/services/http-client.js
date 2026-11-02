import { buildApiUrl, normalizeApiBaseUrl } from './api-url.js';
import { ApiError, isApiErrorPayload, requestError } from './api-errors.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const allowedMethods = new Set([...safeMethods, 'POST', 'PUT', 'PATCH', 'DELETE']);
const sessionChanges = new Set(['auth/login', 'auth/logout', 'me/senha']);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function isSuccessPayload(value) {
  if (!isRecord(value) || !Object.hasOwn(value, 'data') || Object.hasOwn(value, 'error')) return false;
  if (isRecord(value.data)) return true;
  const meta = value.meta;
  return Array.isArray(value.data) && isRecord(meta)
    && Number.isSafeInteger(meta.page) && meta.page > 0
    && Number.isSafeInteger(meta.pageSize) && meta.pageSize > 0 && meta.pageSize <= 50
    && Number.isSafeInteger(meta.total) && meta.total >= 0;
}

function createScope(signal, timeoutMs) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(new DOMException('', 'TimeoutError')), timeoutMs) : null;
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    },
  };
}

function abortError(signal, context) {
  return requestError(signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled', context);
}

function throwIfAborted(signal, context) {
  if (signal?.aborted) throw abortError(signal, context);
}

function waitForToken(promise, signal) {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(abortError(signal));
    };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener('abort', abort); resolve(value); },
      (error) => { signal.removeEventListener('abort', abort); reject(error); },
    );
  });
}

function prepareBody(body, headers) {
  if (body === undefined) {
    headers.delete('Content-Type');
    return undefined;
  }
  if (body instanceof FormData || body instanceof URLSearchParams || body instanceof Blob) {
    headers.delete('Content-Type');
    return body;
  }
  if (!isRecord(body) && !Array.isArray(body)) throw new Error();
  headers.set('Content-Type', 'application/json');
  return JSON.stringify(body);
}

export function createHttpClient({ baseUrl, fetchImpl = (...args) => globalThis.fetch(...args), timeoutMs = 15000 } = {}) {
  const base = normalizeApiBaseUrl(baseUrl);
  let csrfToken;
  let tokenFlight;
  let tokenEpoch = 0;

  function clearCsrfToken() {
    tokenEpoch += 1;
    csrfToken = undefined;
  }

  async function getCsrfToken({ signal } = {}) {
    throwIfAborted(signal);
    while (!csrfToken) {
      if (!tokenFlight) {
        const epoch = tokenEpoch;
        const flight = {};
        flight.promise = request('auth/csrf').then((payload) => {
          const token = payload?.data?.csrfToken;
          if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
            throw requestError('unexpected_response', { status: 200 });
          }
          if (epoch === tokenEpoch) csrfToken = token;
          return { epoch, token };
        }).finally(() => {
          if (tokenFlight === flight) tokenFlight = undefined;
        });
        tokenFlight = flight;
      }
      const result = await waitForToken(tokenFlight.promise, signal);
      throwIfAborted(signal);
      if (result.epoch === tokenEpoch) return result.token;
    }
    return csrfToken;
  }

  async function request(path, { method = 'GET', query, body, headers, signal, timeoutMs: requestTimeout = timeoutMs } = {}) {
    let url;
    let requestHeaders;
    let requestBody;
    let scope;
    const context = { method: String(method).toUpperCase(), path: '', requestSent: false };
    try {
      url = buildApiUrl(base, path, query);
      context.path = url.pathname.slice(new URL(`${base}/`).pathname.length);
      if (!allowedMethods.has(context.method) || !Number.isFinite(requestTimeout) || requestTimeout < 0) throw new Error();
      if (['GET', 'HEAD'].includes(context.method) && body !== undefined) throw new Error();
      requestHeaders = new Headers(headers);
      requestHeaders.set('Accept', 'application/json');
      requestHeaders.delete('X-CSRF-Token');
      requestBody = prepareBody(body, requestHeaders);
      scope = createScope(signal, requestTimeout);
    } catch {
      throw requestError('client', context);
    }

    try {
      throwIfAborted(scope.signal, context);
      if (!safeMethods.has(context.method)) {
        requestHeaders.set('X-CSRF-Token', await getCsrfToken({ signal: scope.signal }));
      }
      throwIfAborted(scope.signal, context);
      context.requestSent = true;
      const response = await fetchImpl(url.href, {
        method: context.method,
        headers: requestHeaders,
        body: requestBody,
        signal: scope.signal,
        credentials: 'include',
        redirect: 'error',
      });
      throwIfAborted(scope.signal, context);
      if (response.ok && sessionChanges.has(context.path) && !safeMethods.has(context.method)) clearCsrfToken();
      if (response.status === 204 || (response.ok && context.method === 'HEAD')) return null;

      const contentType = response.headers.get('Content-Type') || '';
      if (!/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(contentType)) {
        throw requestError('unexpected_response', { ...context, status: response.status });
      }
      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        if (scope.signal.aborted) throw abortError(scope.signal, context);
        if (error instanceof TypeError) throw requestError('network', context);
        throw requestError('unexpected_response', { ...context, status: response.status });
      }
      throwIfAborted(scope.signal, context);
      if (!response.ok) {
        if (!isApiErrorPayload(payload)) throw requestError('unexpected_response', { ...context, status: response.status });
        const { code, message, fields } = payload.error;
        throw new ApiError({ ...context, kind: 'http', status: response.status, code, message, fields });
      }
      if (!isSuccessPayload(payload)) throw requestError('unexpected_response', { ...context, status: response.status });
      return payload;
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) clearCsrfToken();
      if (context.requestSent && sessionChanges.has(context.path)) clearCsrfToken();
      if (scope.signal.aborted) throw abortError(scope.signal, context);
      if (error instanceof ApiError) throw error;
      throw requestError('network', context);
    } finally {
      scope.dispose();
    }
  }

  return Object.freeze({ request, getCsrfToken, clearCsrfToken });
}
