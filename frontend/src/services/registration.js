import { requestError } from './api-errors.js';

export function createRegistrationService(client) {
  return Object.freeze({
    async register({ nome, email, senha }, { signal } = {}) {
      const payload = await client.request('auth/cadastro', {
        method: 'POST', body: { nome, email, senha }, signal, requiresAuth: false,
      });
      const user = payload?.data;
      if (!user || !Number.isSafeInteger(user.id) || user.id < 1
        || typeof user.nome !== 'string' || !user.nome
        || typeof user.email !== 'string' || !user.email
        || user.perfil !== 'LEITOR' || user.situacao !== 'PENDENTE') {
        throw requestError('unexpected_response', { method: 'POST', path: 'auth/cadastro', status: 201, requestSent: true });
      }
    },
  });
}

export function registrationFeedback(error) {
  const fields = {};
  for (const field of ['nome', 'email', 'senha']) {
    if (error.fieldErrors?.[field]?.length) fields[field] = error.fieldErrors[field].join(' ');
  }
  if (error.status === 409 && error.code === 'DUPLICATE_RESOURCE') {
    fields.email = 'Este e-mail já possui cadastro.';
    return { fields, message: 'Já existe um cadastro com este e-mail. Você pode voltar ao login ou usar outro e-mail.' };
  }
  const message = error.policy?.outcomeUnknown
    ? 'Não foi possível confirmar o cadastro. A solicitação pode ter sido concluída. Verifique sua conexão antes de decidir enviar novamente.'
    : error.policy?.userMessage || 'Não foi possível enviar seu cadastro. Tente novamente mais tarde.';
  return { fields, message };
}
