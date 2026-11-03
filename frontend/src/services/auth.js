import { requestError } from './api-errors.js';

export function parseAuthenticatedUser(payload) {
  const user = payload?.data;
  if (!user || !Number.isSafeInteger(user.id) || user.id < 1
    || typeof user.nome !== 'string' || !user.nome
    || typeof user.email !== 'string' || !user.email
    || !['ADMIN_CLUBE', 'LEITOR'].includes(user.perfil) || user.situacao !== 'ATIVO') {
    throw requestError('unexpected_response', { status: 200 });
  }
  const { id, nome, email, perfil, situacao } = user;
  return Object.freeze({ id, nome, email, perfil, situacao });
}

export function createAuthService(client) {
  async function currentUser(signal) {
    return parseAuthenticatedUser(await client.request('auth/me', { signal, requiresAuth: true }));
  }

  async function restore({ signal } = {}) {
    const user = await currentUser(signal);
    await client.getCsrfToken({ signal });
    return user;
  }

  async function login({ email, senha }, { signal } = {}) {
    let phase = 'csrf';
    let accepted = false;
    try {
      await client.getCsrfToken({ signal });
      phase = 'credentials';
      await client.request('auth/login', { method: 'POST', body: { email, senha }, signal, requiresAuth: false });
      accepted = true;
      client.clearCsrfToken();
      phase = 'confirmation';
      const user = await currentUser(signal);
      phase = 'csrf_refresh';
      await client.getCsrfToken({ signal });
      return user;
    } catch (error) {
      error.authPhase = phase;
      error.sessionUncertain = accepted || (phase === 'credentials' && error.policy?.outcomeUnknown === true);
      throw error;
    }
  }

  async function logout({ signal } = {}) {
    const response = await client.request('auth/logout', { method: 'POST', signal, requiresAuth: true });
    if (response !== null) throw requestError('unexpected_response', { status: 200 });
    client.clearCsrfToken();
  }

  return Object.freeze({ restore, login, logout });
}
