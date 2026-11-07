import { Link } from 'react-router-dom';
import { ContentCard } from './ContentCard.jsx';
import { BookCover } from './BookCover.jsx';

export function BookCard({ book, search, onOpen, actions }) {
  return <ContentCard component="article" className="book-card" aria-labelledby={`livro-${book.id}`}>
    <BookCover src={book.capaUrl} title={book.titulo} />
    <div className="book-copy">
      <span className="book-genre">{book.genero.nome}</span>
      <h2 id={`livro-${book.id}`}><Link to={`/catalogo/${book.id}${search ? `?${search}` : ''}`} onClick={onOpen}>{book.titulo}<span aria-hidden="true"> ↗</span></Link></h2>
      <p className="book-author">{book.autor}</p>
      <p className="book-description">{book.descricao?.trim() ? book.descricao : 'Descrição não informada.'}</p>
      <p className="book-summary">{book.totalPaginas.toLocaleString('pt-BR')} páginas <span aria-hidden="true">·</span> {book.anoPublicacao ?? 'Ano não informado'}</p>
      {actions && <div className="book-actions">{actions}</div>}
    </div>
  </ContentCard>;
}
