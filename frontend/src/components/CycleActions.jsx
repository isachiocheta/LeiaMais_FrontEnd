import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import { api } from '../services/api.js';
import { createCycleService } from '../services/cycles.js';
import { cycleWriteFeedback } from '../utils/cycle-form.js';
import { useAuth } from '../hooks/useAuth.js';
import { ConfirmDialog } from './ConfirmDialog.jsx';

const cycles = createCycleService(api);
const actions = {
  start: { label: 'Iniciar ciclo', description: 'A situação passará de Planejado para Em andamento. O servidor só permite iniciar dentro do período previsto e se nenhum outro ciclo estiver em andamento. Não será possível voltar a Planejado.' },
  complete: { label: 'Concluir ciclo', description: 'A situação passará de Em andamento para Concluído. A conclusão é recusada se houver encontros agendados. Esta transição não permite reabrir o ciclo.' },
  delete: { label: 'Excluir ciclo', description: 'O ciclo será excluído definitivamente. A exclusão é recusada se houver participações ou encontros vinculados; nenhum vínculo será removido por esta ação.' },
};

export function CycleActions({ cycle, editTo, onRefresh, onDeleted }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [pending, setPending] = useState(false);
  const requestRef = useRef(null);
  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, []);
  if (user?.perfil !== 'ADMIN_CLUBE') return null;
  const transition = cycle.situacao === 'PLANEJADO' ? 'start' : cycle.situacao === 'EM_ANDAMENTO' ? 'complete' : null;
  const needsRefresh = Boolean(feedback?.conflict || feedback?.uncertain);

  function open(operation) { setFeedback(null); setSelected({ operation, cycle }); }
  function refresh() { setSelected(null); setFeedback(null); onRefresh(); }
  async function confirm() {
    if (requestRef.current || !selected) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true);
    try {
      if (selected.operation === 'delete') await cycles.deleteCycle(selected.cycle.id, { signal: controller.signal });
      else await cycles.transitionCycle(selected.cycle.id, selected.cycle.situacao, { signal: controller.signal });
      if (requestRef.current !== controller) return;
      setSelected(null);
      if (selected.operation === 'delete') onDeleted();
      else {
        onRefresh(selected.operation === 'start' ? 'Ciclo iniciado.' : 'Ciclo concluído.');
      }
    } catch (error) {
      if (requestRef.current === controller) setFeedback(cycleWriteFeedback(error, selected.operation));
      throw error;
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setPending(false); }
    }
  }

  return <section className="cycle-admin-actions" aria-label="Administração do ciclo">
    {!selected && needsRefresh && <Alert severity="error">{feedback.message}<Button onClick={refresh}>Atualizar dados do ciclo</Button></Alert>}
    <div className="cycle-action-buttons"><Button component={Link} variant="outlined" to={editTo} disabled={pending || needsRefresh}>Editar ciclo</Button>{transition && <Button variant="contained" onClick={() => open(transition)} disabled={pending || needsRefresh}>{actions[transition].label}</Button>}<Button variant="outlined" onClick={() => open('delete')} disabled={pending || needsRefresh}>Excluir ciclo</Button><Button onClick={refresh} disabled={pending}>Atualizar dados</Button></div>
    {selected && <ConfirmDialog open title={`${actions[selected.operation].label}: ${selected.cycle.nome}`} description={actions[selected.operation].description} confirmLabel={actions[selected.operation].label} onConfirm={confirm} onCancel={() => setSelected(null)} pending={pending} errorMessage={feedback?.message} confirmDisabled={needsRefresh} recoveryAction={needsRefresh && <Button onClick={refresh}>Atualizar dados do ciclo</Button>} />}
  </section>;
}
