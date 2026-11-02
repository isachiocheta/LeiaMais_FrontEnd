export const DEFAULT_API_BASE_URL = 'http://localhost:3000/api';

export function normalizeApiBaseUrl(value = DEFAULT_API_BASE_URL) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error();
    }
    return url.href.replace(/\/+$/, '');
  } catch {
    throw new Error('VITE_API_BASE_URL deve ser uma URL HTTP ou HTTPS sem credenciais, query ou fragmento.');
  }
}

export function buildApiUrl(baseUrl, path, query) {
  if (typeof path !== 'string' || /^[a-z][\w+.-]*:/i.test(path) || path.startsWith('//') || /[\\?#]/.test(path)) {
    throw new Error('Caminho de API inválido.');
  }
  const base = new URL(`${normalizeApiBaseUrl(baseUrl)}/`);
  const url = new URL(path.replace(/^\//, ''), base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    throw new Error('Caminho de API inválido.');
  }
  const params = new URLSearchParams();
  if (query instanceof URLSearchParams) {
    for (const [key, value] of query) params.append(key, value);
  } else if (query) {
    for (const [key, value] of Object.entries(query)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== undefined && item !== null) params.append(key, String(item));
      }
    }
  }
  url.search = params.toString();
  return url;
}
