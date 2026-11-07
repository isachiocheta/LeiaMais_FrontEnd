import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import { api } from '../services/api.js';
import { createCycleService } from '../services/cycles.js';
import { isCatalogId } from '../utils/catalog-query.js';
import { cycleQuery, readCycleQuery } from '../utils/cycle-query.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { useClubDay } from '../hooks/useClubDay.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { CyclePeriod } from '../components/CyclePeriod.jsx';
import { PrimaryButton } from '../components/PrimaryButton.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { CycleActions } from '../components/CycleActions.jsx';
import { CycleParticipation } from '../components/CycleParticipation.jsx';
import { useAuth } from '../hooks/useAuth.js';

const cycles = createCycleService(api);

export function CycleDetailsPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [notice, setNotice] = useState('');
  const [params] = useSearchParams();
  const context = readCycleQuery(params);
  const backTo = context.valid && params.size ? `/ciclos?${cycleQuery(context.filters)}` : '/ciclos';
  const load = useCallback((options) => cycles.getCycle(id, options), [id]);
  const resource = useApiResource(id, load, isCatalogId(id));
  const cycle = resource.data;
  const today = useClubDay();
  const missing = resource.error?.status === 404;
  const savedNotice = location.state?.cycleAction === 'created' ? 'Ciclo criado como Planejado.' : location.state?.cycleAction === 'updated' ? 'Alterações salvas.' : '';
  function refresh(message) { setNotice(typeof message === 'string' ? message : ''); resource.reload(); }
  useEffect(() => { document.title = cycle ? `${cycle.nome} | Leia+` : 'Detalhes do ciclo | Leia+'; }, [cycle]);

  return <ContentContainer className="inner-page cycle-details-page">
    <Link className="text-link catalog-back" to={backTo}><span aria-hidden="true">←</span> Voltar aos ciclos</Link>
    {(notice || savedNotice) && <Alert severity="success" className="cycle-notice">{notice || savedNotice}</Alert>}
    {!isCatalogId(id) ? <><PageHeader title="Referência de ciclo inválida" /><EmptyState title="Confira o endereço" description="O código do ciclo precisa ser um número inteiro positivo válido." /></>
      : resource.status === 'loading' ? <><PageHeader title="Detalhes do ciclo" /><LoadingState message="Abrindo o ciclo…" /></>
        : resource.status === 'error' ? <><PageHeader title={missing ? 'Ciclo não encontrado' : 'Detalhes do ciclo'} />{missing ? <EmptyState title="Este ciclo não está disponível" description="O ciclo pode ter sido removido ou o endereço pode estar incorreto." action={<PrimaryButton component={Link} to={backTo}>Explorar ciclos</PrimaryButton>} /> : <ErrorState title="Não foi possível carregar o ciclo" message={resource.error.policy?.userMessage} onRetry={resource.reload} />}</>
          : <ContentCard component="article" className="cycle-detail-card">
            <PageHeader eyebrow="CICLO DE LEITURA" title={cycle.nome} />
            <Link className="text-link cycle-agenda-link" to={`/encontros?cicloId=${cycle.id}`}>Consultar encontros deste ciclo <span aria-hidden="true">→</span></Link>
            <CycleActions cycle={cycle} editTo={`/admin/ciclos/${cycle.id}/editar${context.valid && params.size ? `?${cycleQuery(context.filters)}` : ''}`} onRefresh={refresh} onDeleted={() => navigate(backTo, { replace: true, state: { cycleAction: 'deleted' } })} />
            <div className="cycle-detail-grid">
              <section aria-labelledby="cycle-book-heading" className="cycle-featured-book">
                <span className="cycle-book-mark" aria-hidden="true">▤</span><h2 id="cycle-book-heading">Livro deste ciclo</h2>
                <h3>{cycle.livro.titulo}</h3><p>{cycle.livro.autor}</p><p>{cycle.livro.totalPaginas.toLocaleString('pt-BR')} páginas</p>
                <PrimaryButton component={Link} to={`/catalogo/${cycle.livroId}`}>Ver detalhes do livro</PrimaryButton>
              </section>
              <div className="cycle-detail-copy">
                <section aria-labelledby="cycle-status-heading"><h2 id="cycle-status-heading">Situação registrada</h2><StatusBadge status={cycle.situacao} /><p className="cycle-status-note">Esta situação é definida pela administração e não muda automaticamente com as datas.</p></section>
                <section aria-labelledby="cycle-period-heading"><h2 id="cycle-period-heading">Período previsto</h2><CyclePeriod cycle={cycle} today={today} /><p className="cycle-timezone-note">Referência do calendário: America/Sao_Paulo (horário de São Paulo).</p></section>
                <section aria-labelledby="cycle-instructions-heading"><h2 id="cycle-instructions-heading">Orientações</h2><p className="cycle-instructions">{cycle.orientacoes?.trim() ? cycle.orientacoes : 'Nenhuma orientação informada para este ciclo.'}</p></section>
              </div>
            </div>
            {user.perfil === 'LEITOR' && <CycleParticipation key={cycle.id} cycle={cycle} onReloadCycle={resource.reload} />}
          </ContentCard>}
  </ContentContainer>;
}
