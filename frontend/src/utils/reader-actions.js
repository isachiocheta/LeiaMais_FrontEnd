export const READER_ACTIONS = Object.freeze({
  approve: { label: 'Aprovar cadastro', target: 'ATIVO', effect: 'O cadastro será aprovado e a conta ficará Ativa, permitindo um novo login.' },
  deactivate: { label: 'Inativar conta', target: 'INATIVO', effect: 'A conta ficará Inativa e não poderá entrar no clube enquanto estiver nessa situação. Seus registros de leitura e inscrições serão preservados.' },
  reactivate: { label: 'Reativar conta', target: 'ATIVO', effect: 'A conta ficará Ativa e poderá fazer um novo login. A reativação não restaura sessões antigas.' },
});
const transitions = Object.freeze({ PENDENTE: ['approve', 'deactivate'], ATIVO: ['deactivate'], INATIVO: ['reactivate'] });
export function readerActions(reader) { return reader.perfil === 'LEITOR' ? transitions[reader.situacao] || [] : []; }

export function readerAdminFeedback(error, writing = false) {
  let message = error.policy?.userMessage || 'Não foi possível consultar os leitores.';
  if (error.policy?.outcomeUnknown) message = 'Não foi possível confirmar a alteração. Atualize a lista para conferir a situação real antes de enviar outra ação.';
  else if (error.status === 401) message = 'Sua sessão não está mais disponível. Entre novamente para administrar os leitores.';
  else if (error.status === 403) message = writing
    ? 'A alteração não foi autorizada. Sua permissão ou a validação de segurança pode ter mudado. Atualize os dados antes de tentar novamente.'
    : 'A consulta de leitores é exclusiva da administração do clube. Confira sua sessão e sua permissão.';
  else if (error.status === 409) message = 'A situação atual da conta não permite esta alteração. Atualize a lista para conferir as ações disponíveis.';
  else if (error.status === 422) message = writing
    ? 'A situação enviada não foi aceita. Atualize a lista e escolha uma das ações disponíveis.'
    : 'Os filtros ou a paginação não foram aceitos. Limpe os filtros e tente novamente.';
  else if (error.status === 404) message = 'Leitor não encontrado para esta operação. Contas de administração não podem ser alteradas nesta área. Atualize a lista.';
  return { message, fields: error.fields || [], refreshRequired: writing };
}
