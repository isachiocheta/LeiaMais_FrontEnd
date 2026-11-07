import { isCatalogId } from './catalog-query.js';
import { safeCoverUrl } from './book-cover.js';

export function bookFormValues(book) {
  return {
    titulo: book?.titulo ?? '', autor: book?.autor ?? '', generoId: book ? String(book.generoId) : '',
    totalPaginas: book ? String(book.totalPaginas) : '', anoPublicacao: book?.anoPublicacao == null ? '' : String(book.anoPublicacao),
    descricao: book?.descricao ?? '', capaUrl: book?.capaUrl ?? '',
  };
}

export function validateBookForm(values, year = new Date().getFullYear()) {
  const errors = {};
  for (const [field, limit, label] of [['titulo', 160, 'título'], ['autor', 120, 'autor']]) {
    const length = Array.from(values[field].trim()).length;
    if (!length) errors[field] = `Informe o ${label}.`;
    else if (length > limit) errors[field] = `Use no máximo ${limit} caracteres.`;
  }
  if (!isCatalogId(values.generoId)) errors.generoId = 'Selecione um gênero.';
  if (values.totalPaginas === '') errors.totalPaginas = 'Informe o total de páginas.';
  else if (!/^\d+$/.test(values.totalPaginas) || !Number.isInteger(Number(values.totalPaginas)) || Number(values.totalPaginas) < 1 || Number(values.totalPaginas) > 2147483647) errors.totalPaginas = 'Informe um inteiro entre 1 e 2147483647.';
  if (values.anoPublicacao !== '' && (!/^\d+$/.test(values.anoPublicacao) || !Number.isInteger(Number(values.anoPublicacao)) || Number(values.anoPublicacao) < 1 || Number(values.anoPublicacao) > year)) errors.anoPublicacao = `Informe um ano entre 1 e ${year}, ou deixe em branco.`;
  if (Array.from(values.descricao).length > 2000) errors.descricao = 'Use no máximo 2000 caracteres.';
  if (values.capaUrl !== '' && !safeCoverUrl(values.capaUrl)) errors.capaUrl = 'Use uma URL HTTPS sem espaços ou credenciais, ou deixe em branco.';
  return errors;
}

export function bookFormPayload(values) {
  return {
    titulo: values.titulo.trim(), autor: values.autor.trim(), generoId: Number(values.generoId), totalPaginas: Number(values.totalPaginas),
    anoPublicacao: values.anoPublicacao === '' ? null : Number(values.anoPublicacao),
    descricao: values.descricao === '' ? null : values.descricao,
    capaUrl: values.capaUrl === '' ? null : values.capaUrl,
  };
}

export function bookWriteFeedback(error, operation) {
  const fields = {};
  for (const field of Object.keys(bookFormValues())) {
    if (error.fieldErrors?.[field]?.length) fields[field] = error.fieldErrors[field].join(' ');
  }
  if (error.status === 409 && error.code === 'RESOURCE_IN_USE') {
    const message = operation === 'delete'
      ? 'Este livro está vinculado a ciclos de leitura e não pode ser excluído, inclusive se os ciclos estiverem planejados ou concluídos.'
      : 'O total de páginas não pode mudar enquanto o livro estiver vinculado a ciclos, inclusive planejados ou concluídos. Mantenha o total atual para salvar os outros campos.';
    if (operation !== 'delete') fields.totalPaginas = 'Mantenha o total atual: há ciclos vinculados a este livro.';
    return { fields, message, uncertain: false };
  }
  return {
    fields, uncertain: error.policy?.outcomeUnknown === true,
    message: error.policy?.outcomeUnknown
      ? `Não foi possível confirmar ${operation === 'delete' ? 'a exclusão' : 'o salvamento'}. Confira a listagem antes de tentar novamente.`
      : error.policy?.userMessage || 'Não foi possível concluir a operação.',
  };
}
