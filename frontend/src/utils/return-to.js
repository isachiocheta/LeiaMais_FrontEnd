const origin = 'https://leia.invalid';

export function safeReturnTo(value, fallback = '/minha-area') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, origin);
    let decoded = url.pathname;
    for (let index = 0; index < 3; index += 1) {
      decoded = decodeURIComponent(decoded);
      if (decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decoded)) return fallback;
    }
    const pathname = decoded.replace(/\/+$/, '').toLowerCase();
    if (url.origin !== origin || pathname.startsWith('//') || ['/login', '/acesso-negado'].includes(pathname) || /%25/i.test(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function loginDestination(location) {
  const destination = safeReturnTo(`${location.pathname}${location.search}${location.hash}`);
  return `/login?${new URLSearchParams({ retorno: destination })}`;
}
