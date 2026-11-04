export function validateRegistration({ nome, email, senha, confirmacao }) {
  const errors = {};
  const nameLength = Array.from(nome.trim()).length;
  if (nameLength < 2 || nameLength > 100) errors.nome = 'Informe um nome com 2 a 100 caracteres.';
  if (!email.trim()) errors.email = 'Informe seu e-mail.';
  else if (Array.from(email.trim()).length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Informe um e-mail válido com até 254 caracteres.';
  }
  if (Array.from(senha).length < 10) errors.senha = 'Use uma senha com pelo menos 10 caracteres.';
  else if (new TextEncoder().encode(senha).length > 72) errors.senha = 'A senha deve ter no máximo 72 bytes UTF-8.';
  if (!confirmacao) errors.confirmacao = 'Repita sua senha.';
  else if (confirmacao !== senha) errors.confirmacao = 'As senhas precisam ser exatamente iguais, inclusive os espaços.';
  return errors;
}
