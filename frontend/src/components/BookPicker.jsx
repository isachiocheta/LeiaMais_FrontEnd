import { useCallback, useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import useMediaQuery from '@mui/material/useMediaQuery';
import { api } from '../services/api.js';
import { createCatalogService } from '../services/catalog.js';
import { CATALOG_DEFAULTS } from '../utils/catalog-query.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { LoadingState } from './LoadingState.jsx';
import { ErrorState } from './ErrorState.jsx';
import { EmptyState } from './EmptyState.jsx';

const catalog = createCatalogService(api);

export function BookPicker({ open, onClose, onSelect }) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState({ q: '', page: 1 });
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    if (draft.trim() === search.q) return;
    const timer = setTimeout(() => setSearch({ q: draft.trim(), page: 1 }), 350);
    return () => clearTimeout(timer);
  }, [draft, search.q]);
  const valid = Array.from(draft.trim()).length <= 160;
  const waiting = draft.trim() !== search.q;
  const load = useCallback((options) => catalog.listBooks({ ...CATALOG_DEFAULTS, ...search, pageSize: 6 }, options), [search]);
  const resource = useApiResource(JSON.stringify(search), load, open && valid && !waiting);
  const result = resource.data;
  const busy = waiting || resource.status === 'loading';
  const lastPage = result ? Math.max(1, Math.ceil(result.meta.total / result.meta.pageSize)) : 1;

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="book-picker-title" transitionDuration={reducedMotion ? 0 : undefined}>
    <DialogTitle id="book-picker-title">Escolher livro do catálogo</DialogTitle>
    <DialogContent className="book-picker-content">
      <TextField autoFocus fullWidth label="Buscar livro por título ou autor" value={draft} onChange={(event) => setDraft(event.target.value)} error={!valid} helperText={valid ? 'Busque ou navegue pelas páginas para acessar todo o catálogo.' : 'Use no máximo 160 caracteres.'} />
      {!valid ? null : busy ? <LoadingState message="Consultando livros…" /> : resource.status === 'error' ? <ErrorState title="Não foi possível consultar o catálogo" message={resource.error.policy?.userMessage} onRetry={resource.reload} />
        : <>
          <p role="status">{result.meta.total} {result.meta.total === 1 ? 'livro encontrado' : 'livros encontrados'}</p>
          {result.data.length ? <ul className="book-picker-list">{result.data.map((book) => <li key={book.id}><div><strong>{book.titulo}</strong><p>{book.autor}</p></div><Button variant="outlined" aria-label={`Selecionar ${book.titulo}`} onClick={() => onSelect(book)}>Selecionar</Button></li>)}</ul> : <EmptyState title={search.q ? 'Nenhum livro corresponde à busca' : 'Não há livros nesta página'} description="Experimente outra busca ou volte à primeira página." action={<Button onClick={() => { setDraft(''); setSearch({ q: '', page: 1 }); }}>Ver catálogo desde o início</Button>} />}
          <nav aria-label="Páginas da seleção de livro" className="book-picker-pagination"><Button disabled={search.page === 1} onClick={() => setSearch((current) => ({ ...current, page: current.page - 1 }))}>Anterior</Button><span>Página {search.page} de {lastPage}</span><Button disabled={search.page >= lastPage} onClick={() => setSearch((current) => ({ ...current, page: current.page + 1 }))}>Próxima</Button></nav>
        </>}
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Fechar seleção</Button></DialogActions>
  </Dialog>;
}
