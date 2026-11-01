import Chip from '@mui/material/Chip';

const statuses = {
  PENDENTE: { label: 'Pendente', tone: 'yellow' },
  ATIVO: { label: 'Ativo', tone: 'blue' },
  INATIVO: { label: 'Inativo', tone: 'sand' },
};

export function StatusBadge({ status }) {
  const item = statuses[status] || { label: 'Situação não reconhecida', tone: 'cream' };
  return <Chip component="span" size="small" label={item.label} className={`status-badge status-badge-${item.tone}`} />;
}
