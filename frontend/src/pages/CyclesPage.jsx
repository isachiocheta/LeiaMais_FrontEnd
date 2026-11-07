import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import { api } from '../services/api.js';
import { createCycleService } from '../services/cycles.js';
import { cycleQuery } from '../utils/cycle-query.js';
import { useCycleFilters } from '../hooks/useCycleFilters.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { useClubDay } from '../hooks/useClubDay.js';
import { useCatalogScroll } from '../hooks/useCatalogScroll.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { CyclePeriod } from '../components/CyclePeriod.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';

const cycles = createCycleService(api);
const paginationLabel = (type, page, selected) => ({ page: `${selected ? 'Página atual, página' : 'Ir para a página'} ${page}`, first: 'Primeira página', last: 'Última página', next: 'Próxima página', previous: 'Página anterior' })[type];

export function CyclesPage() {
  const query = useCycleFilters();
  const { filters, valid, waiting } = query;
  const key = cycleQuery(filters).toString();
  const load = useCallback((options) => cycles.listCycles(filters, options), [key]);
  const resource = useApiResource(key, load, valid && !waiting);
  const today = useClubDay();
  const rememberScroll = useCatalogScroll(valid && !waiting && resource.status !== 'loading');
  const busy = waiting || resource.status === 'loading';
  const result = resource.data;
  const total = result?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / filters.pageSize));
  const filtered = Boolean(filters.q || filters.situacao);
  const errors = query.errors;
  const sizeOptions = [...new Set([6, 12, 24, 48, filters.pageSize])].filter((size) => Number.isInteger(size) && size >= 1 && size <= 50).sort((a, b) => a - b);

  return <ContentContainer className="inner-page cycles-page">
    <ContentCard className="catalog-shell cycles-shell">
      <PageHeader eyebrow="HISTÓRIAS COMPARTILHADAS" title="Ciclos de leitura" description="Conheça as leituras organizadas pelo clube, seus períodos e orientações." />
      <p className="cycle-explanation">A situação é registrada pela administração. As datas indicam o período previsto e não concluem um ciclo automaticamente.</p>
      <section className="catalog-filter-section" aria-labelledby="cycle-filters-title">
        <h2 id="cycle-filters-title">Encontre um ciclo</h2>
        <div className="catalog-filters">
          <TextField className="catalog-search" label="Buscar pelo nome do ciclo" value={query.draft} onChange={(event) => query.setDraft(event.target.value)} error={Boolean(errors.q)} helperText={errors.q || 'Busca por nome, com até 120 caracteres.'} />
          <Button className="catalog-clear" variant="outlined" onClick={query.clear} disabled={!query.hasChanges}>Limpar filtros</Button>
          <TextField select label="Situação" value={filters.situacao || 'todas'} onChange={(event) => query.update({ situacao: event.target.value === 'todas' ? '' : event.target.value })} error={Boolean(errors.situacao)} helperText={errors.situacao}>
            <MenuItem value="todas">Todas as situações</MenuItem><MenuItem value="PLANEJADO">Planejado</MenuItem><MenuItem value="EM_ANDAMENTO">Em andamento</MenuItem><MenuItem value="CONCLUIDO">Concluído</MenuItem>
          </TextField>
          <TextField select label="Ordenar por" value={filters.sort} onChange={(event) => query.update({ sort: event.target.value })} error={Boolean(errors.sort)} helperText={errors.sort}>
            <MenuItem value="dataInicio">Data de início</MenuItem><MenuItem value="nome">Nome</MenuItem>
          </TextField>
          <TextField select label="Direção" value={filters.direction} onChange={(event) => query.update({ direction: event.target.value })} error={Boolean(errors.direction)} helperText={errors.direction}>
            <MenuItem value="asc">Crescente</MenuItem><MenuItem value="desc">Decrescente</MenuItem>
          </TextField>
          <TextField select label="Ciclos por página" value={filters.pageSize} onChange={(event) => query.update({ pageSize: Number(event.target.value) })} error={Boolean(errors.pageSize)} helperText={errors.pageSize}>
            {sizeOptions.map((size) => <MenuItem key={size} value={size}>{size}</MenuItem>)}
          </TextField>
        </div>
      </section>
      {!valid ? <ErrorState title="Confira os filtros do endereço" message={Object.values(errors).join(' ')} onRetry={query.clear} retryLabel="Limpar filtros" />
        : busy ? <LoadingState message="Buscando ciclos…" />
          : resource.status === 'error' ? <ErrorState title="Não foi possível carregar os ciclos" message={resource.error.policy?.userMessage} onRetry={resource.reload} />
            : <section aria-labelledby="cycle-results-title">
              <div className="catalog-results-heading"><h2 id="cycle-results-title">Leituras do clube</h2><p role="status">{total.toLocaleString('pt-BR')} {total === 1 ? 'ciclo encontrado' : 'ciclos encontrados'}</p></div>
              {result.data.length === 0 ? <EmptyState title={filters.page > pages ? 'Esta página não tem ciclos' : filtered ? 'Nenhum ciclo corresponde à busca' : 'Ainda não há ciclos cadastrados'} description={filtered ? 'Experimente outro nome ou situação.' : 'Os ciclos aparecerão aqui quando estiverem disponíveis.'} action={filters.page > pages ? <Button onClick={() => query.goPage(pages)}>Ir para a última página disponível</Button> : filtered ? <Button onClick={query.clear}>Limpar filtros</Button> : null} />
                : <div className="cycle-list">{result.data.map((cycle) => <ContentCard component="article" key={cycle.id} className="cycle-card">
                  <div className="cycle-card-heading"><StatusBadge status={cycle.situacao} /><h3><Link to={`/ciclos/${cycle.id}?${key}`} onClick={rememberScroll}>{cycle.nome} <span aria-hidden="true">↗</span></Link></h3></div>
                  <div className="cycle-card-copy">
                    <p className="cycle-book-title"><span aria-hidden="true">▤</span> {cycle.livro.titulo}</p><p className="cycle-author">{cycle.livro.autor}</p>
                    <CyclePeriod cycle={cycle} today={today} />
                    <h4>Orientações</h4><p className="cycle-instructions">{cycle.orientacoes?.trim() ? cycle.orientacoes : 'Nenhuma orientação informada.'}</p>
                    <Link className="text-link" to={`/catalogo/${cycle.livroId}`}>Conhecer o livro <span aria-hidden="true">→</span></Link>
                  </div>
                </ContentCard>)}</div>}
              {total > 0 && result.data.length > 0 && <div className="catalog-pagination">
                <p>Mostrando {(filters.page - 1) * filters.pageSize + 1}–{Math.min(filters.page * filters.pageSize, total)} de {total} ciclos</p>
                <Pagination aria-label="Paginação dos ciclos" count={pages} page={filters.page} onChange={(_, page) => query.goPage(page)} getItemAriaLabel={paginationLabel} siblingCount={0} boundaryCount={1} />
              </div>}
            </section>}
      <Link className="text-link cycle-catalog-link" to="/catalogo">Explorar o catálogo <span aria-hidden="true">→</span></Link>
    </ContentCard>
  </ContentContainer>;
}
