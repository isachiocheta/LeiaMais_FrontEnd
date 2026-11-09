import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { api } from '../services/api.js';
import { createAdminDashboardService } from '../services/admin-dashboard.js';
import { useAdminDashboard } from '../hooks/useAdminDashboard.js';
import { dashboardErrorMessage, formatDashboardCount, formatDashboardInstant } from '../utils/dashboard-presentation.js';
import { formatCivilDate } from '../utils/civil-dates.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { DashboardMetric } from '../components/DashboardMetric.jsx';
import { CycleAnalytics } from '../components/CycleAnalytics.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

const dashboard = createAdminDashboardService(api);

export function AdminDashboardPage() {
  const resource = useAdminDashboard(dashboard);
  const { data, status, error } = resource;
  const refreshButton = useRef(null);
  const restoreFocus = useRef(false);
  const busy = status === 'loading' || status === 'refreshing';
  const cycle = data?.cicloAtual;
  function refresh() { restoreFocus.current = true; resource.refresh(); }
  useEffect(() => {
    if (restoreFocus.current && !busy) { restoreFocus.current = false; refreshButton.current?.focus({ preventScroll: true }); }
  }, [busy]);
  return <ContentContainer className="inner-page admin-dashboard-page">
    <Link className="text-link catalog-back" to="/minha-area">← Minha área</Link>
    <PageHeader eyebrow="UM OLHAR SOBRE O CLUBE" title="Painel administrativo" description="Leitores, obras e encontros, com os indicadores de leitura do ciclo em andamento." />
    <div className="dashboard-toolbar"><Button ref={refreshButton} variant="contained" onClick={refresh} disabled={busy}>{status === 'refreshing' ? 'Atualizando indicadores…' : 'Atualizar indicadores'}</Button>
      <p className="dashboard-updated" role="status">{data ? <>{status === 'stale' || status === 'refreshing' ? 'Dados anteriores · gerados em ' : 'Última atualização: '}<time dateTime={data.generatedAt}>{formatDashboardInstant(data.generatedAt)}</time> (São Paulo).</> : 'Nenhuma atualização concluída.'}</p>
    </div>
    <nav className="dashboard-shortcuts" aria-label="Ações administrativas"><Link className="text-link" to="/admin/leitores?situacao=PENDENTE">Revisar cadastros</Link><Link className="text-link" to="/admin/livros">Administrar livros</Link><Link className="text-link" to="/admin/ciclos/novo">Criar ciclo</Link><Link className="text-link" to="/admin/encontros/novo">Criar encontro</Link></nav>
    {status === 'loading' && <LoadingState message="Consultando os indicadores do clube…" />}
    {status === 'error' && <ErrorState title="Não foi possível carregar o painel" message={dashboardErrorMessage(error)} onRetry={refresh} retryLabel="Atualizar indicadores" />}
    {status === 'refreshing' && <LoadingState compact message="Buscando uma nova atualização. Os dados anteriores continuam visíveis até a conclusão." />}
    {status === 'stale' && <Alert severity="warning" className="dashboard-stale-alert"><strong>A atualização falhou.</strong> {dashboardErrorMessage(error)} Os dados abaixo são anteriores, gerados em {formatDashboardInstant(data.generatedAt)} (São Paulo), e não confirmam a situação atual.</Alert>}
    {data && <div className={`dashboard-data${status === 'stale' ? ' dashboard-data-stale' : ''}`} aria-busy={status === 'refreshing'}>
      <section aria-labelledby="dashboard-totals-title"><div className="dashboard-section-heading"><h2 id="dashboard-totals-title">O clube em números</h2><p>Totais do clube na atualização indicada acima.</p></div>
        <div className="dashboard-metrics-grid">
          <DashboardMetric title="Leitores ativos" value={data.leitores.ativos} description="Contas do perfil Leitor que estão Ativas." to="/admin/leitores?situacao=ATIVO" linkLabel="Consultar leitores ativos" />
          <DashboardMetric title="Cadastros pendentes" value={data.leitores.pendentes} description="Contas de leitores que aguardam a decisão da administração." to="/admin/leitores?situacao=PENDENTE" linkLabel="Revisar cadastros" />
          <DashboardMetric title="Livros no catálogo" value={data.totalLivros} description="Todas as obras cadastradas, utilizadas ou ainda sem ciclo." to="/admin/livros" linkLabel="Administrar livros" />
          <DashboardMetric title="Ciclos de leitura" value={data.totalCiclos} description="Ciclos de todas as situações, incluindo planejados e concluídos." to="/ciclos" linkLabel="Consultar ciclos" />
          <DashboardMetric title="Encontros futuros agendados" value={data.encontrosAgendadosFuturos} description="Encontros Agendados com início posterior ao horário desta atualização." to="/encontros" linkLabel="Consultar agenda do clube" />
        </div>
      </section>
      <ContentCard component="section" className="dashboard-cycle-card" aria-labelledby="dashboard-cycle-title">
        <div className="dashboard-section-heading"><h2 id="dashboard-cycle-title">Ciclo atual</h2></div>
        {!cycle ? <EmptyState title="Nenhum ciclo Em andamento" description="Os indicadores de participantes, conclusões e progresso estarão disponíveis quando houver um ciclo com essa situação. Ciclos planejados não são apresentados como atuais." action={<Link className="text-link" to="/ciclos">Consultar ciclos do clube</Link>} /> : <>
          <StatusBadge status={cycle.situacao} /><h3 className="dashboard-cycle-name"><Link to={`/ciclos/${cycle.id}`}>{cycle.nome}</Link></h3>
          <p className="dashboard-cycle-book"><Link to={`/catalogo/${cycle.livro.id}`}>{cycle.livro.titulo}</Link> · {cycle.livro.autor} · {formatDashboardCount(cycle.livro.totalPaginas)} páginas</p>
          <p className="dashboard-cycle-period"><time dateTime={cycle.dataInicio}>{formatCivilDate(cycle.dataInicio)}</time> a <time dateTime={cycle.dataFim}>{formatCivilDate(cycle.dataFim)}</time></p>
          <Alert severity={cycle.dentroDoPeriodo ? 'info' : 'warning'} className="dashboard-period-notice">{cycle.dentroDoPeriodo ? 'Dentro do período na última atualização.' : 'Fora do período na última atualização. O ciclo continua Em andamento; as datas não alteram automaticamente a situação registrada.'}</Alert>
          <CycleAnalytics indicators={cycle.indicadores} />
          <div className="dashboard-shortcuts"><Link className="text-link" to={`/admin/ciclos/${cycle.id}/participantes`}>Consultar participantes</Link><Link className="text-link" to={`/admin/ciclos/${cycle.id}/editar`}>Editar ciclo</Link><Link className="text-link" to={`/encontros?cicloId=${cycle.id}`}>Encontros deste ciclo</Link></div>
        </>}
      </ContentCard>
      <div className="dashboard-analytical-lists">
        <ContentCard component="section" className="dashboard-list-card" aria-labelledby="dashboard-books-title"><h2 id="dashboard-books-title">Livros utilizados nos ciclos</h2>
          <p className="dashboard-list-definition">Obras presentes em pelo menos {data.livrosMaisUtilizados.minimoCiclos} ciclo, por quantidade de ciclos do maior para o menor. Todas as situações de ciclo entram na contagem.</p>
          <p className="dashboard-list-total">Exibindo {data.livrosMaisUtilizados.data.length} de {formatDashboardCount(data.livrosMaisUtilizados.meta.total)} livros utilizados · até {data.livrosMaisUtilizados.meta.pageSize} resultados.</p>
          {!data.livrosMaisUtilizados.data.length ? <EmptyState title="Nenhum livro utilizado em ciclos" description="As obras aparecerão aqui após serem relacionadas a um ciclo." /> : <ol className="dashboard-book-list">{data.livrosMaisUtilizados.data.map((book) => <li key={book.id}><h3><Link to={`/catalogo/${book.id}`}>{book.titulo}</Link></h3><p>{book.autor}</p><strong>{formatDashboardCount(book.totalCiclos)} {book.totalCiclos === 1 ? 'ciclo' : 'ciclos'}</strong></li>)}</ol>}
          <Link className="text-link" to="/admin/livros">Administrar livros →</Link>
        </ContentCard>
        <ContentCard component="section" className="dashboard-list-card" aria-labelledby="dashboard-readers-title"><h2 id="dashboard-readers-title">Leitores sem participação no ciclo atual</h2>
          {!cycle ? <EmptyState title="Consulta depende de um ciclo atual" description="Sem um ciclo Em andamento, não há um ciclo de referência para identificar leitores sem participação." /> : <>
            <p className="dashboard-list-definition">Somente leitores atualmente Ativos que não têm participação neste ciclo. A lista segue a ordem de identificação do leitor.</p>
            <p className="dashboard-list-total">Exibindo {data.leitoresSemParticipacao.data.length} de {formatDashboardCount(data.leitoresSemParticipacao.meta.total)} leitores · até {data.leitoresSemParticipacao.meta.pageSize} resultados.</p>
            {!data.leitoresSemParticipacao.data.length ? <EmptyState title="Nenhum leitor ativo sem participação neste ciclo" description="Não há leitores que correspondam a essa consulta na atualização exibida." /> : <ul className="dashboard-reader-list">{data.leitoresSemParticipacao.data.map((reader) => <li key={reader.id}><strong>{reader.nome}</strong><span>Identificação: {reader.id}</span></li>)}</ul>}
          </>}
          <Link className="text-link" to="/admin/leitores?situacao=ATIVO">Administrar leitores ativos →</Link>
        </ContentCard>
      </div>
    </div>}
  </ContentContainer>;
}
