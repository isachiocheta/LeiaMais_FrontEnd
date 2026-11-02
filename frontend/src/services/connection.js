import { api } from './api.js';
import { requestError } from './api-errors.js';

export function createConnectionService(client) {
  return async function checkConnection({ signal } = {}) {
    const health = await client.request('health', { signal });
    if (health?.data?.aplicacao !== 'Leia+' || health.data.status !== 'ok') {
      throw requestError('unexpected_response', { status: 200 });
    }
    const readiness = await client.request('ready', { signal });
    if (readiness?.data?.aplicacao !== 'Leia+' || readiness.data.status !== 'pronto') {
      throw requestError('unexpected_response', { status: 200 });
    }
    return { health: health.data.status, readiness: readiness.data.status };
  };
}

export const checkConnection = createConnectionService(api);
