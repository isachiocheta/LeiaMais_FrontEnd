const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function getErrorPolicy({ kind, status, method = 'GET', path = '', requestSent = false }) {
  const mutation = !safeMethods.has(method);
  const outcomeUnknown = mutation && requestSent && (
    ['network', 'timeout', 'cancelled', 'unexpected_response'].includes(kind) || status >= 500
  );
  let category = kind;
  let userMessage = 'Não foi possível concluir a solicitação.';

  if (kind === 'network') userMessage = 'Não foi possível conectar ao Leia+. Verifique a conexão e tente novamente.';
  else if (kind === 'timeout') userMessage = 'O Leia+ demorou a responder. Tente novamente mais tarde.';
  else if (kind === 'cancelled') userMessage = 'Solicitação cancelada.';
  else if (kind === 'unexpected_response') userMessage = 'O Leia+ retornou uma resposta inesperada. Tente novamente mais tarde.';
  else if (kind === 'client') userMessage = 'Não foi possível preparar a solicitação.';
  else if (status === 401) {
    category = 'authentication';
    userMessage = path === 'auth/login' ? 'Não foi possível entrar. Confira seus dados.' : 'Entre novamente para continuar.';
  } else if (status === 403) {
    category = method === 'POST' && ['auth/login', 'auth/cadastro'].includes(path) ? 'csrf' : 'forbidden_undetermined';
    userMessage = category === 'csrf'
      ? 'Não foi possível validar a segurança da solicitação. Tente novamente para obter uma nova verificação.'
      : 'Não foi possível autorizar a solicitação. Confira sua sessão e as permissões antes de tentar novamente.';
  } else if (status === 409) {
    category = 'conflict';
    userMessage = 'Os dados estão em conflito com o estado atual. Confira as informações antes de tentar novamente.';
  } else if (status === 422) {
    category = 'validation';
    userMessage = 'Confira os campos informados.';
  } else if (status === 429) {
    category = 'rate_limit';
    userMessage = 'Muitas tentativas. Aguarde antes de tentar novamente.';
  } else if (status >= 500) {
    category = 'server';
    userMessage = 'O Leia+ está temporariamente indisponível. Tente novamente mais tarde.';
  }

  if (outcomeUnknown) {
    userMessage = 'Não foi possível confirmar o resultado. Confira os dados antes de enviar novamente.';
  }
  return Object.freeze({ category, userMessage, outcomeUnknown, automaticRetry: false });
}

export class ApiError extends Error {
  constructor({ kind, status = null, code, message, fields = [], method = 'GET', path = '', requestSent = false }) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.fields = fields.map(({ field, message: fieldMessage }) => ({ field, message: fieldMessage }));
    this.fieldErrors = Object.create(null);
    for (const { field, message: fieldMessage } of this.fields) {
      (this.fieldErrors[field] ??= []).push(fieldMessage);
    }
    this.policy = getErrorPolicy({ kind, status, method, path, requestSent });
  }
}

export function requestError(kind, context = {}) {
  const defaults = {
    network: ['NETWORK_ERROR', 'Não foi possível conectar ao Leia+.'],
    timeout: ['REQUEST_TIMEOUT', 'O tempo de espera pela resposta terminou.'],
    cancelled: ['REQUEST_ABORTED', 'Solicitação cancelada.'],
    unexpected_response: ['UNEXPECTED_RESPONSE', 'O Leia+ retornou uma resposta inesperada.'],
    client: ['INVALID_REQUEST', 'Não foi possível preparar a solicitação.'],
  };
  const [code, message] = defaults[kind];
  return new ApiError({ ...context, kind, code, message });
}

export function isApiErrorPayload(value) {
  const error = value?.error;
  return error !== null && typeof error === 'object' && !Array.isArray(error)
    && typeof error.code === 'string' && error.code.length > 0
    && typeof error.message === 'string' && error.message.length > 0
    && (error.fields === undefined || (Array.isArray(error.fields) && error.fields.every((item) => (
      item !== null && typeof item === 'object'
      && typeof item.field === 'string' && typeof item.message === 'string'
    ))));
}
