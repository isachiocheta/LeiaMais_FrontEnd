import { createAuthService } from '../services/auth.js';
import { requestError } from '../services/api-errors.js';
import { createProfileService } from '../services/profile.js';

export const AUTH_STATUS = Object.freeze({
  CHECKING: 'checking',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  TEMPORARY_ERROR: 'temporary_error',
});

export function createAuthController(client) {
  const service = createAuthService(client);
  const profile = createProfileService(client);
  const listeners = new Set();
  let state = Object.freeze({ status: AUTH_STATUS.CHECKING, user: null, error: null, action: null, reason: null, needsVerification: false });
  let epoch = 0;
  let pending = null;
  let profilePending = null;

  function publish(next) {
    state = Object.freeze(next);
    for (const listener of listeners) listener();
  }

  function clearAuthentication(reason) {
    epoch += 1;
    pending?.controller.abort();
    pending = null;
    client.cancelProtectedRequests();
    client.clearCsrfToken();
    publish({ status: AUTH_STATUS.UNAUTHENTICATED, user: null, error: null, action: null, reason, needsVerification: false });
  }

  function expire() {
    const knownSession = state.status === AUTH_STATUS.AUTHENTICATED || pending?.previous.status === AUTH_STATUS.AUTHENTICATED || pending?.action === 'login';
    clearAuthentication(knownSession ? 'expired' : null);
  }

  const unsubscribeUnauthorized = client.subscribeUnauthorized(expire);

  async function ownProfile(action, values, options) {
    if (pending || profilePending?.epoch === epoch || state.status !== AUTH_STATUS.AUTHENTICATED) throw requestError('client');
    const owner = state.user.id;
    const version = epoch;
    const operation = { epoch: version };
    profilePending = operation;
    try {
      const result = action === 'read' ? await profile.getMine(options)
        : action === 'name' ? await profile.updateName(values, options) : await profile.changePassword(values, options);
      if (version !== epoch || state.status !== AUTH_STATUS.AUTHENTICATED || state.user.id !== owner) throw requestError('cancelled');
      if (action === 'password') clearAuthentication('password_changed');
      else {
        if (result.id !== owner) throw requestError('unexpected_response', action === 'name' ? { method: 'PATCH', path: 'me', status: 200, requestSent: true } : {});
        publish({ ...state, user: result });
      }
      return result;
    } finally { if (profilePending === operation) profilePending = null; }
  }

  function run(action, credentials) {
    if (pending) {
      if (pending.action === action || action === 'verify') return pending.promise;
      return Promise.reject(requestError('client'));
    }
    const previous = state;
    const operation = { action, previous, epoch: ++epoch, controller: new AbortController() };
    pending = operation;
    client.cancelProtectedRequests();
    publish({ ...previous, status: AUTH_STATUS.CHECKING, user: null, error: null, action });
    operation.promise = Promise.resolve().then(async () => {
      try {
        const options = { signal: operation.controller.signal };
        const user = action === 'login' ? await service.login(credentials, options)
          : action === 'logout' ? await service.logout(options) : await service.restore(options);
        if (operation.epoch === epoch) {
          if (action === 'logout') {
            client.cancelProtectedRequests();
            publish({ status: AUTH_STATUS.UNAUTHENTICATED, user: null, error: null, action: null, reason: 'signed_out', needsVerification: false });
          } else {
            publish({ status: AUTH_STATUS.AUTHENTICATED, user, error: null, action: null, reason: null, needsVerification: false });
          }
        }
        return user ?? null;
      } catch (error) {
        if (operation.epoch === epoch) {
          const credentialRefusal = action === 'login' && error.authPhase === 'credentials'
            && error.status >= 400 && error.status < 500 && !error.sessionUncertain;
          if (error.status === 401 && action !== 'login') {
            expire();
          } else if (credentialRefusal && previous.status === AUTH_STATUS.UNAUTHENTICATED) {
            publish({ ...previous, status: AUTH_STATUS.UNAUTHENTICATED, user: null, error: null, action: null });
          } else {
            publish({
              status: AUTH_STATUS.TEMPORARY_ERROR,
              user: null,
              error,
              action: null,
              reason: action === 'logout' ? 'logout_uncertain' : error.sessionUncertain ? 'login_uncertain' : 'verification_failed',
              needsVerification: action === 'logout' || error.sessionUncertain === true || previous.needsVerification,
            });
          }
        }
        throw error;
      } finally {
        if (pending === operation) pending = null;
      }
    });
    return operation.promise;
  }

  return Object.freeze({
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    verifySession: () => run('verify'),
    login: (credentials) => run('login', credentials),
    logout: () => run('logout'),
    readOwnProfile: (options) => ownProfile('read', null, options),
    updateOwnName: (values, options) => ownProfile('name', values, options),
    changeOwnPassword: (values, options) => ownProfile('password', values, options),
    reauthenticateAfterUncertainPassword: () => clearAuthentication('password_change_uncertain'),
    dispose() {
      epoch += 1;
      pending?.controller.abort();
      unsubscribeUnauthorized();
      client.cancelProtectedRequests();
      listeners.clear();
    },
  });
}
