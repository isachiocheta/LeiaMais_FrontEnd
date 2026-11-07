import { useCallback, useState } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { api } from '../services/api.js';
import { createCycleService } from '../services/cycles.js';
import { isCatalogId } from '../utils/catalog-query.js';
import { useApiResource } from '../hooks/useApiResource.js';
import { CyclePicker } from './CyclePicker.jsx';

const cycles = createCycleService(api);

export function MeetingCycleFilter({ value, onChange, error }) {
  const [open, setOpen] = useState(false);
  const load = useCallback((options) => cycles.getCycle(value, options), [value]);
  const resource = useApiResource(value, load, Boolean(value) && isCatalogId(value));
  const label = !value ? 'Todos os ciclos' : resource.data?.nome || `Ciclo #${value}`;
  const helper = error || (value && resource.status === 'error' ? 'Não foi possível consultar este ciclo. Remova o filtro ou escolha outro.' : 'Busque ou navegue por todos os ciclos para filtrar a agenda.');
  return <div className="meeting-cycle-filter">
    <TextField fullWidth label="Ciclo" value={label} slotProps={{ input: { readOnly: true } }} helperText={helper} error={Boolean(error || (value && resource.status === 'error'))} />
    <Button variant="outlined" onClick={() => setOpen(true)}>Escolher ciclo</Button>
    {value && <Button onClick={() => onChange('')}>Remover filtro de ciclo</Button>}
    {open && <CyclePicker open onClose={() => setOpen(false)} onSelect={(cycle) => { onChange(String(cycle.id)); setOpen(false); }} />}
  </div>;
}
