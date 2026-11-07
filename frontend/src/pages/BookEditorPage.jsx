import { useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { createCatalogService } from '../services/catalog.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { catalogQuery, isCatalogId, readCatalogQuery } from '../utils/catalog-query.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { BookForm } from '../components/BookForm.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

const catalog = createCatalogService(api);
const loadGenres = (options) => catalog.listGenres(options);

export function BookEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const context = readCatalogQuery(params);
  const backTo = context.valid && params.size ? `/admin/livros?${catalogQuery(context.filters)}` : '/admin/livros';
  const editing = id !== undefined;
  const validId = !editing || isCatalogId(id);
  const load = useCallback((options) => catalog.getBook(id, options), [id]);
  const book = useApiResource(id, load, editing && validId);
  const genres = useApiResource('genres', loadGenres, validId);

  async function save(values, options) {
    if (editing) await catalog.updateBook(id, values, options);
    else await catalog.createBook(values, options);
    navigate(backTo, { replace: true, state: { bookAction: editing ? 'updated' : 'created' } });
  }

  return <ContentContainer className="inner-page book-editor-page">
    <Link className="text-link catalog-back" to={backTo}><span aria-hidden="true">←</span> Voltar à listagem</Link>
    <PageHeader eyebrow="ADMINISTRAÇÃO DO ACERVO" title={editing ? 'Editar livro' : 'Novo livro'} description={book.data?.titulo || 'Organize as próximas histórias do Leia+.'} />
    {!validId ? <EmptyState title="Referência de livro inválida" description="Confira o endereço e volte à listagem para selecionar um livro." />
      : editing && book.status === 'loading' ? <LoadingState message="Carregando livro…" />
      : editing && book.status === 'error' ? book.error.status === 404 ? <EmptyState title="Livro não encontrado" description="O livro pode ter sido removido. Volte à listagem para conferir o acervo." /> : <ErrorState title="Não foi possível carregar o livro" message={book.error.policy?.userMessage} onRetry={book.reload} />
      : <ContentCard className="book-editor-card"><BookForm key={id || 'new'} initialBook={editing ? book.data : null} genres={genres} onSave={save} backTo={backTo} /></ContentCard>}
  </ContentContainer>;
}
