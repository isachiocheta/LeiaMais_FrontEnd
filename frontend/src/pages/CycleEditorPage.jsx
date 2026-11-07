import { useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { createCycleService } from '../services/cycles.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { isCatalogId } from '../utils/catalog-query.js';
import { cycleQuery, readCycleQuery } from '../utils/cycle-query.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { CycleForm } from '../components/CycleForm.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

const cycles = createCycleService(api);

export function CycleEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const context = readCycleQuery(params);
  const suffix = context.valid && params.size ? `?${cycleQuery(context.filters)}` : '';
  const editing = id !== undefined;
  const backTo = editing ? `/ciclos/${id}${suffix}` : `/ciclos${suffix}`;
  const validId = !editing || isCatalogId(id);
  const load = useCallback((options) => cycles.getCycle(id, options), [id]);
  const resource = useApiResource(id, load, editing && validId);

  async function save(values, options) {
    const saved = editing ? await cycles.updateCycle(id, values, options) : await cycles.createCycle(values, options);
    navigate(`/ciclos/${saved.id}${suffix}`, { replace: true, state: { cycleAction: editing ? 'updated' : 'created' } });
  }

  return <ContentContainer className="inner-page cycle-editor-page">
    <Link className="text-link catalog-back" to={backTo}><span aria-hidden="true">←</span> {editing ? 'Voltar ao ciclo' : 'Voltar aos ciclos'}</Link>
    <PageHeader eyebrow="ADMINISTRAÇÃO DAS LEITURAS" title={editing ? 'Editar ciclo' : 'Novo ciclo'} description={resource.data?.nome || 'Organize uma leitura do clube.'} />
    {!validId ? <EmptyState title="Referência de ciclo inválida" description="Confira o endereço e volte à listagem para escolher um ciclo." />
      : editing && resource.status === 'loading' ? <LoadingState message="Carregando ciclo…" />
        : editing && resource.status === 'error' ? resource.error.status === 404 ? <EmptyState title="Ciclo não encontrado" description="Ele pode ter sido removido. Volte à listagem para conferir." /> : <ErrorState title="Não foi possível carregar o ciclo" message={resource.error.policy?.userMessage} onRetry={resource.reload} />
          : <ContentCard className="cycle-editor-card"><CycleForm initialCycle={editing ? resource.data : null} onSave={save} onReload={resource.reload} backTo={backTo} /></ContentCard>}
  </ContentContainer>;
}
