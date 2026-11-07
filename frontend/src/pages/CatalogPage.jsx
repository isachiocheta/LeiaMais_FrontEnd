import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Button from '@mui/material/Button';
import Pagination from '@mui/material/Pagination';
import Alert from '@mui/material/Alert';
import { api } from '../services/api.js';
import { createCatalogService } from '../services/catalog.js';
import { useCatalogFilters } from '../hooks/useCatalogFilters.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { useCatalogScroll } from '../hooks/useCatalogScroll.js';
import { useAuth } from '../hooks/useAuth.js';
import { availableCatalogPage } from '../utils/catalog-query.js';
import { bookWriteFeedback } from '../utils/book-form.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { CatalogFilters } from '../components/CatalogFilters.jsx';
import { BookCard } from '../components/BookCard.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { PrimaryButton } from '../components/PrimaryButton.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import flower from '../assets/flor2.png';

const catalog = createCatalogService(api);
const loadGenres = (options) => catalog.listGenres(options);
const pageLabel = (type, page, selected) => ({ first: 'Ir para a primeira página', last: 'Ir para a última página', next: 'Próxima página', previous: 'Página anterior' })[type] || `${selected ? 'Página atual,' : 'Ir para a página'} ${page}`;

export function CatalogPage({ administrative = false }) {
  const { user } = useAuth();
  const location = useLocation();
  const admin = administrative && user.perfil === 'ADMIN_CLUBE';
  const query = useCatalogFilters();
  const headingRef = useRef(null);
  const deleteRequest = useRef(null);
  const focusAfterDelete = useRef(false);
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [notice, setNotice] = useState(null);
  const loadBooks = useCallback((options) => catalog.listBooks(query.filters, options), [query.filters]);
  const books = useApiResource(query.search, loadBooks, query.valid && !query.waiting);
  const genres = useApiResource('genres', loadGenres);
  const filtered = Boolean(query.filters.q || query.filters.generoId);
  const page = books.data?.meta.page;
  const total = books.data?.meta.total;
  const pageCount = books.data ? Math.ceil(total / books.data.meta.pageSize) : 0;
  const first = books.data ? (page - 1) * books.data.meta.pageSize + 1 : 0;
  const loaded = query.valid && !query.waiting && books.status === 'success';
  const targetPage = loaded && admin ? availableCatalogPage(books.data.meta) : page;
  const adjusting = loaded && admin && targetPage !== page;
  const ready = loaded && !adjusting;
  const rememberScroll = useCatalogScroll(ready || books.status === 'error');
  const suffix = query.search ? `?${query.search}` : '';
  const actionNotice = admin && ({ created: 'Livro cadastrado com sucesso. Os filtros da listagem foram mantidos.', updated: 'Livro atualizado com sucesso. Os filtros da listagem foram mantidos.' })[location.state?.bookAction];

  useEffect(() => () => { deleteRequest.current?.abort(); deleteRequest.current = null; }, []);
  useEffect(() => {
    if (adjusting) query.goPage(targetPage, { replace: true, flushSync: false });
  }, [adjusting, targetPage, query.goPage]);
  useEffect(() => {
    if (ready && focusAfterDelete.current) {
      focusAfterDelete.current = false;
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [ready]);

  async function removeSelected() {
    if (!admin || !selected || deleteRequest.current || deleteError?.uncertain) return;
    const controller = new AbortController();
    deleteRequest.current = controller;
    setDeleting(true);
    setDeleteError(null);
    try {
      await catalog.deleteBook(selected.id, { signal: controller.signal });
      if (deleteRequest.current === controller) {
        setSelected(null);
        setNotice({ severity: 'success', text: 'Livro excluído com sucesso.' });
        focusAfterDelete.current = true;
        books.reload();
      }
    } catch (error) {
      if (deleteRequest.current === controller) setDeleteError(bookWriteFeedback(error, 'delete'));
      throw error;
    } finally {
      if (deleteRequest.current === controller) { deleteRequest.current = null; setDeleting(false); }
    }
  }

  function cancelDelete() {
    if (deleteError?.uncertain) {
      setNotice({ severity: 'warning', text: 'O resultado da exclusão não foi confirmado. Confira a listagem atualizada antes de tentar novamente.' });
      books.reload();
    }
    setSelected(null);
    setDeleteError(null);
  }

  function changePage(value) {
    query.goPage(value);
    headingRef.current?.focus();
  }

  return <ContentContainer className="inner-page catalog-page">
    <ContentCard className="catalog-shell">
      <div className="catalog-heading"><PageHeader eyebrow={admin ? 'ADMINISTRAÇÃO DO ACERVO' : 'O ACERVO DO NOSSO CLUBE'} title={admin ? 'Administrar livros' : 'Catálogo de livros'} description={admin ? 'Cuide das histórias que fazem parte do Leia+.' : 'Histórias para descobrir, escolher e compartilhar.'} /><img src={flower} alt="" width="58" height="75" /></div>
      {admin ? <div className="catalog-admin-links"><PrimaryButton component={Link} to={`/admin/livros/novo${suffix}`}>Novo livro</PrimaryButton><Link className="text-link" to={`/catalogo${suffix}`}>Ver catálogo</Link></div> : user.perfil === 'ADMIN_CLUBE' && <div className="catalog-admin-links"><PrimaryButton component={Link} to={`/admin/livros${suffix}`}>Administrar livros</PrimaryButton></div>}
      {(notice || actionNotice) && <Alert className="catalog-notice" severity={notice?.severity || 'success'}>{notice?.text || actionNotice}</Alert>}
      <CatalogFilters query={query} genres={genres} />
      <section className="catalog-results" aria-labelledby="catalog-results-title" aria-busy={query.waiting || (query.valid && books.status === 'loading')}>
        <div className="catalog-results-heading">
          <h2 id="catalog-results-title" ref={headingRef} tabIndex={-1}>Leituras do clube</h2>
          {ready && <p role="status">{total.toLocaleString('pt-BR')} {total === 1 ? 'livro encontrado' : 'livros encontrados'}{books.data.data.length > 0 && <> · Exibindo {first}–{first + books.data.data.length - 1}</>}</p>}
        </div>
        {!query.valid ? <ErrorState title="Confira os filtros do endereço" message={Object.values(query.errors).join(' ')} onRetry={query.clear} retryLabel="Limpar filtros" />
          : query.waiting || books.status === 'loading' || adjusting ? <LoadingState message={adjusting ? 'Ajustando a página da listagem…' : query.waiting ? 'Atualizando a busca…' : 'Buscando livros…'} />
          : books.status === 'error' ? <ErrorState title="Não foi possível carregar o catálogo" message={books.error.policy?.userMessage} onRetry={books.reload} />
          : books.data.data.length === 0 ? <EmptyState
            title={total > 0 ? 'Esta página não tem livros' : filtered ? 'Nenhum resultado para estes filtros' : 'O catálogo ainda está vazio'}
            description={total > 0 ? 'A página solicitada está fora do catálogo atual. Volte para a primeira página.' : filtered ? 'Tente outra busca ou limpe os filtros para explorar o acervo.' : 'Os livros aparecerão aqui quando forem adicionados ao clube.'}
            action={total > 0 ? <Button onClick={() => changePage(1)}>Ir para a primeira página</Button> : filtered ? <Button onClick={query.clear}>Limpar filtros</Button> : null}
          /> : <div className="book-list">{books.data.data.map((book) => <BookCard key={book.id} book={book} search={query.search} onOpen={rememberScroll} actions={admin && <>
            <Button component={Link} to={`/admin/livros/${book.id}/editar${suffix}`} aria-label={`Editar ${book.titulo}`}>Editar</Button>
            <Button type="button" className="book-delete" aria-label={`Excluir ${book.titulo}`} onClick={() => { setDeleteError(null); setSelected(book); }}>Excluir</Button>
          </>} />)}</div>}
        {ready && pageCount > 1 && page <= pageCount && <div className="catalog-pagination">
          <p>Página {page} de {pageCount.toLocaleString('pt-BR')}</p>
          <Pagination aria-label="Páginas do catálogo" count={pageCount} page={page} onChange={(event, value) => changePage(value)} getItemAriaLabel={pageLabel} shape="rounded" siblingCount={0} boundaryCount={1} />
        </div>}
      </section>
    </ContentCard>
    {admin && <ConfirmDialog key={selected?.id || 'none'} open={Boolean(selected)} title={`Excluir “${selected?.titulo || ''}”?`} description="A exclusão remove o livro do catálogo. Ela só é permitida se não houver nenhum ciclo vinculado, inclusive planejado ou concluído." onConfirm={removeSelected} onCancel={cancelDelete} confirmLabel="Excluir livro" pending={deleting} errorMessage={deleteError?.message} confirmDisabled={deleteError?.uncertain} />}
  </ContentContainer>;
}
