import Chip from '@mui/material/Chip';

const statuses = {
  PENDENTE: { label: 'Pendente', tone: 'yellow' },
  ATIVO: { label: 'Ativo', tone: 'blue' },
  INATIVO: { label: 'Inativo', tone: 'sand' },
  PLANEJADO: { label: 'Planejado', tone: 'yellow', icon: '◇' },
  EM_ANDAMENTO: { label: 'Em andamento', tone: 'blue', icon: '▶' },
  CONCLUIDO: { label: 'Concluído', tone: 'sand', icon: '✓' },
  AGENDADO: { label: 'Agendado', tone: 'yellow', icon: '◷' },
  REALIZADO: { label: 'Realizado', tone: 'blue', icon: '✓' },
  CANCELADO: { label: 'Cancelado', tone: 'sand', icon: '×' },
};

export function StatusBadge({ status }) {
  const item = statuses[status] || { label: 'Situação não reconhecida', tone: 'cream' };
  return <Chip component="span" size="small" label={<>{item.icon && <span aria-hidden="true">{item.icon} </span>}{item.label}</>} className={`status-badge status-badge-${item.tone}`} />;
}
