import { useCallback, useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import useMediaQuery from '@mui/material/useMediaQuery';
import { api } from '../services/api.js';
import { createCycleService } from '../services/cycles.js';
import { CYCLE_DEFAULTS } from '../utils/cycle-query.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { LoadingState } from './LoadingState.jsx';
import { ErrorState } from './ErrorState.jsx';
import { EmptyState } from './EmptyState.jsx';

const cycles = createCycleService(api);

export function CyclePicker({ open, onClose, onSelect, title = 'Escolher ciclo para filtrar' }) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState({ q: '', page: 1 });
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    if (draft.trim() === search.q) return;
    const timer = setTimeout(() => setSearch({ q: draft.trim(), page: 1 }), 350);
    return () => clearTimeout(timer);
  }, [draft, search.q]);
  const valid = Array.from(draft.trim()).length <= 120;
  const waiting = draft.trim() !== search.q;
  const load = useCallback((options) => cycles.listCycles({ ...CYCLE_DEFAULTS, ...search, pageSize: 6, sort: 'nome' }, options), [search]);
  const resource = useApiResource(JSON.stringify(search), load, open && valid && !waiting);
  const result = resource.data;
  const busy = waiting || resource.status === 'loading';
  const lastPage = result ? Math.max(1, Math.ceil(result.meta.total / result.meta.pageSize)) : 1;

  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="cycle-picker-title" transitionDuration={reducedMotion ? 0 : undefined}>
    <DialogTitle id="cycle-picker-title">{title}</DialogTitle>
    <DialogContent className="book-picker-content">
      <TextField autoFocus fullWidth label="Buscar ciclo por nome" value={draft} onChange={(event) => setDraft(event.target.value)} error={!valid} helperText={valid ? 'Busque ou navegue pelas páginas para acessar todos os ciclos.' : 'Use no máximo 120 caracteres.'} />
      {!valid ? null : busy ? <LoadingState message="Consultando ciclos…" /> : resource.status === 'error' ? <ErrorState title="Não foi possível consultar os ciclos" message={resource.error.policy?.userMessage} onRetry={resource.reload} />
        : <>
          <p role="status">{result.meta.total} {result.meta.total === 1 ? 'ciclo encontrado' : 'ciclos encontrados'}</p>
          {result.data.length ? <ul className="book-picker-list">{result.data.map((cycle) => <li key={cycle.id}><div><strong>{cycle.nome}</strong></div><Button variant="outlined" aria-label={`Selecionar ${cycle.nome}`} onClick={() => onSelect(cycle)}>Selecionar</Button></li>)}</ul> : <EmptyState title={search.q ? 'Nenhum ciclo corresponde à busca' : 'Não há ciclos nesta página'} description="Experimente outra busca ou volte à primeira página." action={<Button onClick={() => { setDraft(''); setSearch({ q: '', page: 1 }); }}>Ver ciclos desde o início</Button>} />}
          <nav aria-label="Páginas da seleção de ciclo" className="book-picker-pagination"><Button disabled={search.page === 1} onClick={() => setSearch((current) => ({ ...current, page: current.page - 1 }))}>Anterior</Button><span>Página {search.page} de {lastPage}</span><Button disabled={search.page >= lastPage} onClick={() => setSearch((current) => ({ ...current, page: current.page + 1 }))}>Próxima</Button></nav>
        </>}
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Fechar seleção</Button></DialogActions>
  </Dialog>;
}
