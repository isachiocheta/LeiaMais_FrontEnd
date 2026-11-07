import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import { api } from '../services/api.js';
import { createMeetingService } from '../services/meetings.js';
import { meetingQuery } from '../utils/meeting-query.js';
import { meetingPresentation } from '../utils/meeting-instants.js';
import { useMeetingFilters } from '../hooks/useMeetingFilters.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { useCatalogScroll } from '../hooks/useCatalogScroll.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { MeetingCycleFilter } from '../components/MeetingCycleFilter.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';

const meetings = createMeetingService(api);
const paginationLabel = (type, page, selected) => ({ page: `${selected ? 'Página atual, página' : 'Ir para a página'} ${page}`, next: 'Próxima página', previous: 'Página anterior' })[type];

export function MeetingsPage() {
  const query = useMeetingFilters();
  const { filters } = query;
  const key = meetingQuery(filters).toString();
  const load = useCallback((options) => meetings.listMeetings(filters, options), [key]);
  const resource = useApiResource(key, load, query.valid && !query.waiting);
  const rememberScroll = useCatalogScroll(query.valid && !query.waiting && resource.status !== 'loading');
  const result = resource.data;
  const filtered = Boolean(filters.q || filters.cicloId || filters.situacao);
  const sizes = [...new Set([6, 12, 24, 48, filters.pageSize])].filter((size) => Number.isInteger(size) && size >= 1 && size <= 50).sort((a, b) => a - b);
  const pages = result ? Math.max(1, Math.ceil(result.meta.total / filters.pageSize)) : 1;

  return <ContentContainer className="inner-page meetings-page">
    <ContentCard className="catalog-shell meetings-shell">
      <PageHeader eyebrow="ENCONTRE A GENTE ENTRE PÁGINAS" title="Agenda do clube" description="Consulte datas, locais e informações dos encontros de leitura." />
      <p className="meeting-zone-note">Horários de São Paulo · America/Sao_Paulo.</p>
      <p className="meeting-status-explanation">A situação é registrada pelo clube. Um horário que já passou não torna o encontro Realizado automaticamente.</p>
      <section className="catalog-filter-section" aria-labelledby="meeting-filters-title">
        <h2 id="meeting-filters-title">Encontre um encontro</h2>
        <div className="catalog-filters">
          <TextField className="catalog-search" label="Buscar pelo título do encontro" value={query.draft} onChange={(event) => query.setDraft(event.target.value)} helperText={query.errors.q || 'Até 120 caracteres.'} error={Boolean(query.errors.q)} />
          <Button className="catalog-clear" variant="outlined" onClick={query.clear} disabled={!query.hasChanges}>Limpar filtros</Button>
          <TextField select label="Situação" value={filters.situacao || 'todas'} onChange={(event) => query.update({ situacao: event.target.value === 'todas' ? '' : event.target.value })} helperText={query.errors.situacao} error={Boolean(query.errors.situacao)}>
            <MenuItem value="todas">Todas as situações</MenuItem><MenuItem value="AGENDADO">Agendado</MenuItem><MenuItem value="REALIZADO">Realizado</MenuItem><MenuItem value="CANCELADO">Cancelado</MenuItem>
          </TextField>
          <TextField select label="Ordenar por" value={filters.sort} onChange={(event) => query.update({ sort: event.target.value })} helperText={query.errors.sort} error={Boolean(query.errors.sort)}><MenuItem value="inicioEm">Data e horário</MenuItem><MenuItem value="titulo">Título</MenuItem></TextField>
          <TextField select label="Direção" value={filters.direction} onChange={(event) => query.update({ direction: event.target.value })} helperText={query.errors.direction} error={Boolean(query.errors.direction)}><MenuItem value="asc">Crescente</MenuItem><MenuItem value="desc">Decrescente</MenuItem></TextField>
          <TextField select label="Encontros por página" value={filters.pageSize} onChange={(event) => query.update({ pageSize: Number(event.target.value) })} helperText={query.errors.pageSize} error={Boolean(query.errors.pageSize)}>{sizes.map((size) => <MenuItem key={size} value={size}>{size}</MenuItem>)}</TextField>
          <MeetingCycleFilter value={filters.cicloId} onChange={(cicloId) => query.update({ cicloId })} error={query.errors.cicloId} />
        </div>
      </section>
      {!query.valid ? <ErrorState title="Confira os filtros do endereço" message={Object.values(query.errors).join(' ')} onRetry={query.clear} retryLabel="Limpar filtros" /> : query.waiting || resource.status === 'loading' ? <LoadingState message="Consultando agenda…" /> : resource.status === 'error' ? <ErrorState title="Não foi possível carregar a agenda" message={resource.error.policy?.userMessage} onRetry={resource.reload} />
        : <section aria-labelledby="meeting-results-title">
          <div className="catalog-results-heading"><h2 id="meeting-results-title">Encontros do clube</h2><p role="status">{result.meta.total.toLocaleString('pt-BR')} {result.meta.total === 1 ? 'encontro encontrado' : 'encontros encontrados'}</p></div>
          {!result.data.length ? <EmptyState title={filters.page > pages ? 'Não há encontros nesta página' : filtered ? 'Nenhum encontro corresponde aos filtros' : 'Nenhum encontro cadastrado'} description={filtered ? 'Experimente outro título, ciclo ou situação.' : 'Os encontros aparecerão aqui quando forem cadastrados.'} action={filters.page > pages ? <Button onClick={() => query.goPage(pages)}>Ir para a última página disponível</Button> : filtered ? <Button onClick={query.clear}>Limpar filtros</Button> : null} />
            : <div className="meeting-list">{result.data.map((meeting) => {
              const date = meetingPresentation(meeting.inicioEm);
              return <ContentCard component="article" className={`meeting-card${meeting.situacao === 'CANCELADO' ? ' meeting-card-cancelled' : ''}`} key={meeting.id}>
                <div className="meeting-date-stamp" aria-hidden="true"><span>{date.month}</span><strong>{date.day}</strong><span>{date.time}</span></div>
                <div className="meeting-card-copy"><StatusBadge status={meeting.situacao} /><h3><Link to={`/encontros/${meeting.id}?${key}`} onClick={rememberScroll}>{meeting.titulo} <span aria-hidden="true">↗</span></Link></h3>
                  <p className="meeting-date"><time dateTime={meeting.inicioEm}>{date.date} às {date.time}</time></p><p className="meeting-location"><strong>Local:</strong> {meeting.local}</p>
                  {meeting.situacao === 'CANCELADO' && <p className="meeting-cancelled-note">Este encontro está cancelado.</p>}
                  <p className="meeting-description">{meeting.descricao?.trim() ? meeting.descricao : 'Descrição não informada.'}</p>
                  <div className="meeting-related"><p><span>Ciclo:</span> <Link to={`/ciclos/${meeting.cicloId}`}>{meeting.ciclo.nome}</Link></p><p><span>Livro:</span> <Link to={`/catalogo/${meeting.livro.id}`}>{meeting.livro.titulo}</Link></p></div>
                </div>
              </ContentCard>;
            })}</div>}
          {result.meta.total > 0 && result.data.length > 0 && <div className="catalog-pagination"><p>Mostrando {(filters.page - 1) * filters.pageSize + 1}–{Math.min(filters.page * filters.pageSize, result.meta.total)} de {result.meta.total} encontros</p><Pagination aria-label="Paginação da agenda" page={filters.page} count={pages} onChange={(_, page) => query.goPage(page)} getItemAriaLabel={paginationLabel} siblingCount={0} boundaryCount={1} /></div>}
        </section>}
    </ContentCard>
  </ContentContainer>;
}
