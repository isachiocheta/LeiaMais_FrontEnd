import { useCallback, useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { createCatalogService } from '../services/catalog.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { catalogQuery, isCatalogId, readCatalogQuery } from '../utils/catalog-query.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { BookCover } from '../components/BookCover.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { PrimaryButton } from '../components/PrimaryButton.jsx';

const catalog = createCatalogService(api);
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' });

export function BookDetailsPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const context = readCatalogQuery(params);
  const backTo = context.valid && params.size ? `/catalogo?${catalogQuery(context.filters)}` : '/catalogo';
  const load = useCallback((options) => catalog.getBook(id, options), [id]);
  const resource = useApiResource(id, load, isCatalogId(id));
  const book = resource.data;
  const notFound = resource.error?.status === 404;

  useEffect(() => {
    document.title = book ? `${book.titulo} | Leia+` : 'Detalhes do livro | Leia+';
  }, [book]);

  return <ContentContainer className="inner-page book-details-page">
    <Link className="text-link catalog-back" to={backTo}><span aria-hidden="true">←</span> Voltar ao catálogo</Link>
    {!isCatalogId(id) ? <>
      <PageHeader eyebrow="CATÁLOGO DO CLUBE" title="Referência de livro inválida" />
      <EmptyState title="Confira o endereço" description="O código do livro precisa ser um número inteiro positivo válido." action={<PrimaryButton component={Link} to={backTo}>Explorar catálogo</PrimaryButton>} />
    </> : resource.status === 'loading' ? <><PageHeader eyebrow="CATÁLOGO DO CLUBE" title="Detalhes do livro" /><LoadingState message="Abrindo o livro…" /></>
      : resource.status === 'error' ? <>
        <PageHeader eyebrow="CATÁLOGO DO CLUBE" title={notFound ? 'Livro não encontrado' : 'Detalhes do livro'} />
        {notFound ? <EmptyState title="Este livro não está disponível" description="O livro pode ter sido removido ou o endereço pode estar incorreto." action={<PrimaryButton component={Link} to={backTo}>Explorar catálogo</PrimaryButton>} /> : <ErrorState title="Não foi possível carregar o livro" message={resource.error.policy?.userMessage} onRetry={resource.reload} />}
      </> : <ContentCard component="article" className="book-detail-card">
        <BookCover src={book.capaUrl} title={book.titulo} />
        <div className="book-detail-copy">
          <span className="book-genre">{book.genero.nome}</span>
          <PageHeader eyebrow="UMA LEITURA DO NOSSO ACERVO" title={book.titulo} description={book.autor} />
          <dl className="book-facts">
            <div><dt>Gênero</dt><dd>{book.genero.nome}</dd></div>
            <div><dt>Páginas</dt><dd>{book.totalPaginas.toLocaleString('pt-BR')}</dd></div>
            <div><dt>Ano de publicação</dt><dd>{book.anoPublicacao ?? 'Não informado'}</dd></div>
            <div><dt>Identificação no catálogo</dt><dd>{book.id}</dd></div>
            <div><dt>Adicionado em</dt><dd><time dateTime={book.criadoEm}>{dateFormat.format(new Date(book.criadoEm))}</time></dd></div>
            <div><dt>Atualizado em</dt><dd><time dateTime={book.atualizadoEm}>{dateFormat.format(new Date(book.atualizadoEm))}</time></dd></div>
          </dl>
          <h2>Sobre o livro</h2>
          <p className="book-description">{book.descricao?.trim() ? book.descricao : 'Descrição não informada.'}</p>
        </div>
      </ContentCard>}
  </ContentContainer>;
}
