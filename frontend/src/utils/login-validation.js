export function validateLogin({ email, senha }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Informe seu e-mail.';
  else if (email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Informe um e-mail válido.';
  if (senha.length === 0) errors.senha = 'Informe sua senha.';
  else if (new TextEncoder().encode(senha).length > 72) errors.senha = 'A senha excede o tamanho permitido.';
  return errors;
}
