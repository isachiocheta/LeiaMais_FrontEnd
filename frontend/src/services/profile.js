import { parseAuthenticatedUser } from './auth.js';
import { requestError } from './api-errors.js';

export function createProfileService(client) {
  return Object.freeze({
    async getMine({ signal } = {}) {
      return parseAuthenticatedUser(await client.request('auth/me', { signal, requiresAuth: true }));
    },
    async updateName({ nome }, { signal } = {}) {
      const payload = await client.request('me', { method: 'PATCH', body: { nome }, signal, requiresAuth: true });
      try { return parseAuthenticatedUser(payload); }
      catch { throw requestError('unexpected_response', { method: 'PATCH', path: 'me', status: 200, requestSent: true }); }
    },
    async changePassword({ senhaAtual, novaSenha }, { signal } = {}) {
      const payload = await client.request('me/senha', {
        method: 'PATCH', body: { senhaAtual, novaSenha }, signal, requiresAuth: true,
      });
      if (payload?.data?.reauthenticate !== true) {
        throw requestError('unexpected_response', { method: 'PATCH', path: 'me/senha', status: 200, requestSent: true });
      }
      return { reauthenticate: true };
    },
  });
}
