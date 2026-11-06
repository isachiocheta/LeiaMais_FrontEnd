import { useCallback, useRef } from 'react';
import Button from '@mui/material/Button';
import Pagination from '@mui/material/Pagination';
import { api } from '../services/api.js';
import { createCatalogService } from '../services/catalog.js';
import { useCatalogFilters } from '../hooks/useCatalogFilters.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { useCatalogScroll } from '../hooks/useCatalogScroll.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { CatalogFilters } from '../components/CatalogFilters.jsx';
import { BookCard } from '../components/BookCard.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import flower from '../assets/flor2.png';

const catalog = createCatalogService(api);
const loadGenres = (options) => catalog.listGenres(options);
const pageLabel = (type, page, selected) => ({ first: 'Ir para a primeira página', last: 'Ir para a última página', next: 'Próxima página', previous: 'Página anterior' })[type] || `${selected ? 'Página atual,' : 'Ir para a página'} ${page}`;

export function CatalogPage() {
  const query = useCatalogFilters();
  const headingRef = useRef(null);
  const loadBooks = useCallback((options) => catalog.listBooks(query.filters, options), [query.filters]);
  const books = useApiResource(query.search, loadBooks, query.valid && !query.waiting);
  const genres = useApiResource('genres', loadGenres);
  const filtered = Boolean(query.filters.q || query.filters.generoId);
  const page = books.data?.meta.page;
  const total = books.data?.meta.total;
  const pageCount = books.data ? Math.ceil(total / books.data.meta.pageSize) : 0;
  const first = books.data ? (page - 1) * books.data.meta.pageSize + 1 : 0;
  const ready = query.valid && !query.waiting && books.status === 'success';
  const rememberScroll = useCatalogScroll(ready || books.status === 'error');

  function changePage(value) {
    query.goPage(value);
    headingRef.current?.focus();
  }

  return <ContentContainer className="inner-page catalog-page">
    <ContentCard className="catalog-shell">
      <div className="catalog-heading"><PageHeader eyebrow="O ACERVO DO NOSSO CLUBE" title="Catálogo de livros" description="Histórias para descobrir, escolher e compartilhar." /><img src={flower} alt="" width="58" height="75" /></div>
      <CatalogFilters query={query} genres={genres} />
      <section className="catalog-results" aria-labelledby="catalog-results-title" aria-busy={query.waiting || (query.valid && books.status === 'loading')}>
        <div className="catalog-results-heading">
          <h2 id="catalog-results-title" ref={headingRef} tabIndex={-1}>Leituras do clube</h2>
          {ready && <p role="status">{total.toLocaleString('pt-BR')} {total === 1 ? 'livro encontrado' : 'livros encontrados'}{books.data.data.length > 0 && <> · Exibindo {first}–{first + books.data.data.length - 1}</>}</p>}
        </div>
        {!query.valid ? <ErrorState title="Confira os filtros do endereço" message={Object.values(query.errors).join(' ')} onRetry={query.clear} retryLabel="Limpar filtros" />
          : query.waiting || books.status === 'loading' ? <LoadingState message={query.waiting ? 'Atualizando a busca…' : 'Buscando livros…'} />
          : books.status === 'error' ? <ErrorState title="Não foi possível carregar o catálogo" message={books.error.policy?.userMessage} onRetry={books.reload} />
          : books.data.data.length === 0 ? <EmptyState
            title={total > 0 ? 'Esta página não tem livros' : filtered ? 'Nenhum resultado para estes filtros' : 'O catálogo ainda está vazio'}
            description={total > 0 ? 'A página solicitada está fora do catálogo atual. Volte para a primeira página.' : filtered ? 'Tente outra busca ou limpe os filtros para explorar o acervo.' : 'Os livros aparecerão aqui quando forem adicionados ao clube.'}
            action={total > 0 ? <Button onClick={() => changePage(1)}>Ir para a primeira página</Button> : filtered ? <Button onClick={query.clear}>Limpar filtros</Button> : null}
          /> : <div className="book-list">{books.data.data.map((book) => <BookCard key={book.id} book={book} search={query.search} onOpen={rememberScroll} />)}</div>}
        {ready && pageCount > 1 && page <= pageCount && <div className="catalog-pagination">
          <p>Página {page} de {pageCount.toLocaleString('pt-BR')}</p>
          <Pagination aria-label="Páginas do catálogo" count={pageCount} page={page} onChange={(event, value) => changePage(value)} getItemAriaLabel={pageLabel} shape="rounded" siblingCount={0} boundaryCount={1} />
        </div>}
      </section>
    </ContentCard>
  </ContentContainer>;
}
