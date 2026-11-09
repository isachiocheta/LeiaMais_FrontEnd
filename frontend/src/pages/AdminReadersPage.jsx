import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import useMediaQuery from '@mui/material/useMediaQuery';
import { api } from '../services/api.js';
import { createReaderService } from '../services/readers.js';
import { readerAdminFeedback, readerActions, READER_ACTIONS } from '../utils/reader-actions.js';
import { READER_SORTS, readerQuery } from '../utils/reader-query.js';
import { useReaderFilters } from '../hooks/useReaderFilters.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { useCatalogScroll } from '../hooks/useCatalogScroll.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { ReaderStatusActions } from '../components/ReaderStatusActions.jsx';
import { ParticipationPagination } from '../components/ParticipationPagination.jsx';

const readers = createReaderService(api);
const labels = { PENDENTE: 'Pendente', ATIVO: 'Ativo', INATIVO: 'Inativo' };

export function AdminReadersPage() {
  const query = useReaderFilters();
  const mobile = useMediaQuery('(max-width: 900px)');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const request = useRef(null);
  const resultsHeading = useRef(null);
  const focusResults = useRef(false);
  const key = readerQuery(query.filters).toString();
  const load = useCallback((options) => readers.list(query.filters, options), [key]);
  const resource = useApiResource(`${query.key}:${revision}`, load, query.valid);
  const result = resource.data;
  const pages = result ? Math.max(1, Math.ceil(result.meta.total / query.filters.pageSize)) : 1;
  const adjusting = resource.status === 'success' && query.filters.page > pages;
  useEffect(() => { if (adjusting) query.goPage(pages, { replace: true }); }, [adjusting, pages]);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  useEffect(() => {
    if (focusResults.current && resource.status === 'success' && !adjusting) { resultsHeading.current?.focus({ preventScroll: true }); focusResults.current = false; }
  }, [resource.status, adjusting]);
  const rememberScroll = useCatalogScroll(query.valid && resource.status !== 'loading' && !adjusting);
  const locked = Boolean(feedback?.refreshRequired);
  function refresh() {
    if (request.current) return;
    setSelected(null); setFeedback(null); focusResults.current = true; setRevision((n) => n + 1);
  }
  function select(reader, operation) {
    if (request.current || locked || !readerActions(reader).includes(operation)) return;
    setSelected({ reader, operation }); setFeedback(null); setNotice('');
  }
  async function confirm() {
    if (request.current || !selected || locked) return;
    const controller = new AbortController(); request.current = controller; setPending(true);
    try {
      const saved = await readers.changeStatus(selected.reader.id, READER_ACTIONS[selected.operation].target, { signal: controller.signal });
      if (request.current !== controller) return;
      setSelected(null); setFeedback(null); setNotice(`Situação de ${saved.nome} confirmada: ${labels[saved.situacao]}.`);
      focusResults.current = true; setRevision((n) => n + 1);
    } catch (error) {
      if (request.current === controller) setFeedback(readerAdminFeedback(error, true));
      throw error;
    } finally { if (request.current === controller) { request.current = null; setPending(false); } }
  }
  const operation = selected && READER_ACTIONS[selected.operation];
  const actions = (reader) => <ReaderStatusActions reader={reader} onSelect={select} disabled={pending || locked} />;
  return <ContentContainer className="inner-page admin-readers-page">
    <Link className="text-link catalog-back" to="/minha-area" onClick={rememberScroll}>← Minha área</Link>
    <ContentCard className="readers-shell">
      <PageHeader eyebrow="ADMINISTRAÇÃO DO CLUBE" title="Leitores do Leia+" description="Acompanhe os cadastros e gerencie a situação das contas de leitores." />
      <p className="reader-policy-note">Esta área lista apenas leitores. Contas de administração não são alteradas por esta operação.</p>
      <section className="reader-filters" aria-labelledby="reader-filters-title">
        <h2 id="reader-filters-title">Filtrar leitores</h2>
        <div className="reader-filter-fields">
          <TextField select label="Situação da conta" value={query.filters.situacao || 'todas'} disabled={pending} onChange={(e) => query.update({ situacao: e.target.value === 'todas' ? '' : e.target.value })} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}><option value="todas">Todas as situações</option>{Object.entries(labels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</TextField>
          <TextField select label="Ordenar leitores por" value={query.filters.sort} disabled={pending} onChange={(e) => query.update({ sort: e.target.value })} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>{Object.entries(READER_SORTS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</TextField>
          <TextField select label="Direção da ordenação" value={query.filters.direction} disabled={pending} onChange={(e) => query.update({ direction: e.target.value })} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}><option value="asc">Crescente</option><option value="desc">Decrescente</option></TextField>
        </div>
        <div className="reader-filter-buttons"><Button onClick={query.reset} disabled={pending || !query.key}>Limpar filtros</Button><Button onClick={refresh} disabled={pending || !query.valid || resource.status === 'loading'}>Atualizar leitores</Button></div>
      </section>
      {notice && <Alert severity="success" className="reader-feedback">{notice}</Alert>}
      {!selected && feedback && <Alert severity="error" className="reader-feedback">{feedback.message}<Button onClick={refresh}>Atualizar lista e ações disponíveis</Button></Alert>}
      {!query.valid ? <ErrorState title="Confira os filtros do endereço" message={query.message} onRetry={query.reset} retryLabel="Limpar filtros" /> : resource.status === 'loading' || adjusting ? <LoadingState message="Consultando leitores…" /> : resource.status === 'error' ? <ErrorState title="Não foi possível carregar os leitores" message={readerAdminFeedback(resource.error).message} onRetry={resource.error.status === 422 ? query.reset : refresh} retryLabel={resource.error.status === 422 ? 'Limpar filtros' : 'Atualizar lista'} /> : <section aria-labelledby="reader-results-title">
        <div className="reader-results-heading"><h2 id="reader-results-title" ref={resultsHeading} tabIndex={-1}>Leitores cadastrados</h2><p role="status">{result.meta.total} {result.meta.total === 1 ? 'leitor encontrado' : 'leitores encontrados'}{query.filters.situacao ? ` · ${labels[query.filters.situacao]}` : ''}</p></div>
        {!result.data.length ? <EmptyState title={query.filters.situacao ? 'Nenhum leitor nesta situação' : 'Nenhum leitor cadastrado'} description={query.filters.situacao ? 'Consulte outras situações ou atualize a lista após novos cadastros.' : 'Os leitores aparecerão aqui após o cadastro público.'} action={query.filters.situacao ? <Button onClick={query.reset}>Consultar todas as situações</Button> : null} /> : mobile ? <div className="reader-mobile-list">{result.data.map((reader) => <ContentCard component="article" className="reader-mobile-card" key={reader.id}>
          <h3>{reader.nome}</h3><dl><div><dt>E-mail</dt><dd>{reader.email}</dd></div><div><dt>Situação</dt><dd><StatusBadge status={reader.situacao} /></dd></div></dl>{actions(reader)}
        </ContentCard>)}</div> : <div className="reader-table-frame"><Table className="reader-table"><caption>Nome, e-mail, situação e ações permitidas para os leitores desta página.</caption><TableHead><TableRow><TableCell scope="col">Nome</TableCell><TableCell scope="col">E-mail</TableCell><TableCell scope="col">Situação</TableCell><TableCell scope="col">Ações</TableCell></TableRow></TableHead><TableBody>{result.data.map((reader) => <TableRow key={reader.id}><TableCell component="th" scope="row">{reader.nome}</TableCell><TableCell>{reader.email}</TableCell><TableCell><StatusBadge status={reader.situacao} /></TableCell><TableCell>{actions(reader)}</TableCell></TableRow>)}</TableBody></Table></div>}
        {result.meta.total > 0 && <p className="reader-range">Mostrando {(query.filters.page - 1) * query.filters.pageSize + 1}–{Math.min(query.filters.page * query.filters.pageSize, result.meta.total)} de {result.meta.total} leitores.</p>}
        <ParticipationPagination meta={result.meta} query={query} label="Paginação dos leitores" />
      </section>}
    </ContentCard>
    {selected && <ConfirmDialog open title={`${operation.label}: ${selected.reader.nome}`} description={`${selected.reader.email}. ${operation.effect} Uma mudança efetiva de situação invalida as sessões anteriores. Para acessar novamente, será necessário um novo login quando a conta estiver Ativa.`} confirmLabel={operation.label} onConfirm={confirm} onCancel={() => setSelected(null)} pending={pending} confirmDisabled={locked} errorMessage={feedback?.message} recoveryAction={<Button onClick={refresh}>Atualizar lista e ações disponíveis</Button>} />}
  </ContentContainer>;
}
