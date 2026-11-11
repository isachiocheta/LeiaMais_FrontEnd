import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { api } from '../services/api.js';
import { createReaderDashboardService } from '../services/reader-dashboard.js';
import { useReaderDashboard } from '../hooks/useReaderDashboard.js';
import { readerDashboardError } from '../utils/reader-dashboard-presentation.js';
import { formatDashboardCount, formatDashboardInstant } from '../utils/dashboard-presentation.js';
import { formatCivilDate } from '../utils/civil-dates.js';
import { formatMeetingInstant } from '../utils/meeting-instants.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { PrimaryButton } from '../components/PrimaryButton.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { DashboardMetric } from '../components/DashboardMetric.jsx';
import { ReaderDashboardProgress } from '../components/ReaderDashboardProgress.jsx';

const dashboard = createReaderDashboardService(api);

export function ReaderHomePage({ user }) {
  const resource = useReaderDashboard(dashboard, user.id);
  const { data, status, error } = resource;
  const busy = status === 'loading' || status === 'refreshing';
  const cycle = data?.cicloAtual;
  const mine = data?.minhaParticipacao;
  const refreshButton = useRef(null);
  const restoreFocus = useRef(false);
  function refresh() { restoreFocus.current = true; resource.refresh(); }
  useEffect(() => {
    if (restoreFocus.current && !busy) { restoreFocus.current = false; refreshButton.current?.focus({ preventScroll: true }); }
  }, [busy, data, error]);
  return <ContentContainer className="inner-page reader-home-page">
    <PageHeader eyebrow="SEU ESPAÇO NO LEIA+" title={`Olá, ${user.nome}!`} description="Acompanhe suas leituras e os encontros que fazem parte da sua agenda." />
    <div className="reader-home-toolbar"><PrimaryButton ref={refreshButton} onClick={refresh} disabled={busy}>{status === 'refreshing' ? 'Atualizando meu painel…' : 'Atualizar meu painel'}</PrimaryButton>
      <p className="reader-home-updated" role="status">{data ? <>{status === 'stale' || status === 'refreshing' ? 'Dados anteriores · gerados em ' : 'Última atualização: '}<time dateTime={data.generatedAt}>{formatDashboardInstant(data.generatedAt)}</time> (São Paulo).</> : 'Seu painel ainda não foi carregado.'}</p>
    </div>
    <nav className="reader-home-links" aria-label="Navegação das suas leituras"><Link className="text-link" to="/minhas-leituras">Histórico de leituras</Link><Link className="text-link" to="/minha-agenda">Minha agenda completa</Link><Link className="text-link" to="/catalogo">Explorar catálogo</Link><Link className="text-link" to="/ciclos">Ciclos do clube</Link></nav>
    {status === 'loading' && <LoadingState message="Consultando suas leituras e sua agenda…" />}
    {status === 'error' && <ErrorState title="Não foi possível carregar seu painel" message={readerDashboardError(error)} onRetry={refresh} retryLabel="Atualizar meu painel" />}
    {status === 'refreshing' && <LoadingState compact message="Buscando uma nova atualização. Seus dados anteriores continuam visíveis até a conclusão." />}
    {status === 'stale' && <Alert severity="warning" className="reader-home-stale"><strong>Não foi possível atualizar seu painel.</strong> {readerDashboardError(error)} Os dados abaixo são anteriores, gerados em {formatDashboardInstant(data.generatedAt)} (São Paulo), e não confirmam a situação atual.</Alert>}
    {data && <div className={status === 'stale' ? 'reader-home-data reader-home-data-stale' : 'reader-home-data'} aria-busy={status === 'refreshing'}>
      <section className="reader-home-history" aria-labelledby="reader-home-history-title"><h2 id="reader-home-history-title">Seu caminho no clube</h2><p>Seu histórico completo, incluindo ciclos que já terminaram.</p>
        <div className="reader-home-metrics"><DashboardMetric title="Participações em leituras" value={data.totalParticipacoes} description="Todas as suas participações registradas nos ciclos do clube." to="/minhas-leituras" linkLabel="Ver meu histórico" /><DashboardMetric title="Leituras concluídas" value={data.leiturasConcluidas} description="Leituras em que sua página registrada corresponde ao total de páginas do livro." to="/minhas-leituras" linkLabel="Consultar minhas leituras" /></div>
      </section>
      <ContentCard component="section" className="reader-home-cycle" aria-labelledby="reader-home-cycle-title"><h2 id="reader-home-cycle-title">Sua leitura no ciclo atual</h2>
        {!cycle ? <EmptyState title="Nenhum ciclo em andamento" description="Seu histórico continua disponível acima. Um ciclo planejado ainda não é o ciclo atual." action={<PrimaryButton component={Link} to="/ciclos">Consultar ciclos do clube</PrimaryButton>} /> : <>
          <div className="reader-home-cycle-heading"><StatusBadge status={cycle.situacao} /><h3><Link to={`/ciclos/${cycle.id}`}>{cycle.nome}</Link></h3><p className="reader-home-book"><Link to={`/catalogo/${cycle.livro.id}`}>{cycle.livro.titulo}</Link> · {cycle.livro.autor}</p><p>{formatDashboardCount(cycle.livro.totalPaginas)} páginas</p></div>
          <p className="reader-home-period"><time dateTime={cycle.dataInicio}>{formatCivilDate(cycle.dataInicio)}</time> a <time dateTime={cycle.dataFim}>{formatCivilDate(cycle.dataFim)}</time></p>
          {!cycle.dentroDoPeriodo && <Alert severity="warning" className="reader-home-period-alert">O ciclo está fora do período, mas continua marcado como Em andamento. A participação e a atualização de páginas não estão disponíveis nessas condições.</Alert>}
          {mine ? <ReaderDashboardProgress participation={mine} /> : <div className="reader-home-not-joined"><h3>Você ainda não participa deste ciclo</h3><p>A participação registra sua leitura a partir da página zero e é necessária para se inscrever nos encontros do mesmo ciclo.</p>{!cycle.dentroDoPeriodo && <p>Consulte as informações do ciclo. Uma nova participação depende de o período estar válido.</p>}</div>}
          <div className="reader-home-actions">{!mine && cycle.dentroDoPeriodo ? <PrimaryButton component={Link} to={`/ciclos/${cycle.id}`}>Consultar ciclo e participar</PrimaryButton> : mine?.podeAtualizarProgresso && cycle.dentroDoPeriodo ? <PrimaryButton component={Link} to={`/ciclos/${cycle.id}`}>{mine.concluida ? 'Consultar ou corrigir minha página' : 'Atualizar página no ciclo'}</PrimaryButton> : <PrimaryButton component={Link} to={`/ciclos/${cycle.id}`}>Consultar ciclo</PrimaryButton>}
            <Link className="text-link" to={`/encontros?cicloId=${cycle.id}`}>Encontros deste ciclo</Link><Link className="text-link" to="/minhas-leituras">Histórico de participações</Link></div>
          {mine && !mine.podeAtualizarProgresso && cycle.dentroDoPeriodo && <p className="reader-home-rule">A atualização de progresso não está disponível neste resumo. Consulte o ciclo para conferir as condições atuais.</p>}
        </>}
      </ContentCard>
      <ContentCard component="section" className="reader-home-agenda" aria-labelledby="reader-home-agenda-title"><h2 id="reader-home-agenda-title">Próximos encontros da sua agenda</h2>
        <p className="reader-home-agenda-definition">Somente encontros Agendados e futuros na atualização acima, nos quais você tem inscrição. Horários de São Paulo · America/Sao_Paulo. Inscrição não significa comparecimento.</p>
        <p className="reader-home-agenda-count">Exibindo {data.agendaFutura.length} de {formatDashboardCount(data.totalInscricoesFuturas)} {data.totalInscricoesFuturas === 1 ? 'inscrição futura agendada' : 'inscrições futuras agendadas'}.</p>
        {data.totalInscricoesFuturas > data.agendaFutura.length && <p className="reader-home-agenda-limit">O painel mostra somente os próximos cinco encontros. Há mais {formatDashboardCount(data.totalInscricoesFuturas - data.agendaFutura.length)} {data.totalInscricoesFuturas - data.agendaFutura.length === 1 ? 'inscrição futura agendada' : 'inscrições futuras agendadas'} na sua agenda completa.</p>}
        {!data.agendaFutura.length ? <EmptyState title="Nenhum encontro futuro agendado na sua agenda" description="Você pode consultar sua agenda completa, incluindo o histórico e encontros cancelados, ou explorar os encontros do clube." action={<Link className="text-link" to="/encontros">Consultar agenda do clube</Link>} /> : <ol className="reader-home-agenda-list">{data.agendaFutura.map((row) => <li key={row.id}>
          <StatusBadge status={row.encontro.situacao} /><h3><Link to={`/encontros/${row.encontroId}`}>{row.encontro.titulo}</Link></h3><p className="reader-home-meeting-time"><time dateTime={row.encontro.inicioEm}>{formatMeetingInstant(row.encontro.inicioEm)}</time></p><p>Local: {row.encontro.local}</p><p>Ciclo: <Link to={`/ciclos/${row.ciclo.id}`}>{row.ciclo.nome}</Link></p><p>Livro: <Link to={`/catalogo/${row.livro.id}`}>{row.livro.titulo}</Link></p><Button component={Link} to={`/encontros/${row.encontroId}`} variant="outlined">Consultar encontro e inscrição</Button>
        </li>)}</ol>}
        <PrimaryButton component={Link} to="/minha-agenda">Ver minha agenda completa</PrimaryButton>
      </ContentCard>
    </div>}
  </ContentContainer>;
}
