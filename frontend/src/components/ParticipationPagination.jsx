import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';

export function ParticipationPagination({ meta, query, label }) {
  const pages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  const sizes = [...new Set([6, 12, 24, 48, meta.pageSize])].sort((a, b) => a - b);
  return <nav className="reading-pagination" aria-label={label}>
    <TextField select label="Registros por página" value={meta.pageSize} onChange={(event) => query.changeSize(Number(event.target.value))} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>{sizes.map((size) => <option key={size} value={size}>{size}</option>)}</TextField>
    <div className="reading-page-buttons"><Button onClick={() => query.goPage(meta.page - 1)} disabled={meta.page <= 1}>Página anterior</Button><span>Página {meta.page} de {pages}</span><Button onClick={() => query.goPage(meta.page + 1)} disabled={meta.page >= pages}>Próxima página</Button></div>
  </nav>;
}
