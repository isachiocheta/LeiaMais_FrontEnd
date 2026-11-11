export const NEW_PASSWORD_GUIDANCE = 'Use pelo menos 10 caracteres e no máximo 72 bytes UTF-8. Acentos e emojis podem ocupar mais de um byte. Espaços fazem parte da senha.';

export function validateProfileName(nome) {
  const length = Array.from(nome.trim()).length;
  return length < 2 || length > 100 ? { nome: 'Informe um nome com 2 a 100 caracteres.' } : {};
}

export function validatePasswordChange({ senhaAtual, novaSenha, confirmacao }) {
  const fields = {};
  const bytes = (value) => new TextEncoder().encode(value).length;
  if (!senhaAtual) fields.senhaAtual = 'Informe sua senha atual.';
  else if (bytes(senhaAtual) > 72) fields.senhaAtual = 'A senha atual deve ter no máximo 72 bytes UTF-8.';
  if (Array.from(novaSenha).length < 10) fields.novaSenha = 'Use uma nova senha com pelo menos 10 caracteres.';
  else if (bytes(novaSenha) > 72) fields.novaSenha = 'A nova senha deve ter no máximo 72 bytes UTF-8.';
  if (!confirmacao) fields.confirmacao = 'Repita a nova senha.';
  else if (confirmacao !== novaSenha) fields.confirmacao = 'As senhas precisam ser exatamente iguais, inclusive os espaços.';
  return fields;
}

export function profileFeedback(error, { password = false } = {}) {
  const fields = {};
  for (const field of password ? ['senhaAtual', 'novaSenha'] : ['nome']) {
    // Mensagens fixas: nenhuma resposta de erro pode ecoar uma senha no formulário.
    if (error.fieldErrors?.[field]?.length) {
      fields[field] = field === 'senhaAtual' ? 'A senha atual não foi aceita. Confira o valor informado.'
        : field === 'novaSenha' ? 'A nova senha não foi aceita. Confira os limites indicados.'
          : 'O nome não foi aceito. Use de 2 a 100 caracteres.';
    }
  }
  let message;
  if (error.policy?.outcomeUnknown) message = password
    ? 'Não foi possível confirmar a troca. A senha pode ter sido alterada. O envio não será repetido automaticamente. Entre novamente para verificar o acesso.'
    : 'Não foi possível confirmar a alteração do nome. Consulte seus dados atuais antes de decidir enviar novamente.';
  else if (error.status === 409) message = password
    ? 'Houve uma alteração concorrente na conta. Confira sua sessão antes de tentar trocar a senha novamente.'
    : 'Houve uma alteração concorrente. Consulte os dados atuais antes de salvar. Seu nome em edição foi preservado.';
  else if (error.status === 403) message = 'Não foi possível autorizar a alteração. A verificação de segurança pode ter expirado. Confira sua sessão antes de tentar novamente.';
  else if (error.status === 422) message = 'Confira os campos indicados. A alteração não foi aceita.';
  else message = error.policy?.userMessage || 'Não foi possível concluir a alteração. Tente novamente mais tarde.';
  return { fields, message, conflict: error.status === 409, uncertain: error.policy?.outcomeUnknown === true };
}
