import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import { ErrorState } from './ErrorState.jsx';

export function CatalogFilters({ query, genres }) {
  const options = genres.data || [];
  const selected = query.filters.generoId;
  const missing = selected && !options.some((genre) => String(genre.id) === selected);
  const sizes = [...new Set([6, 12, 24, 48, query.filters.pageSize])].filter((size) => Number.isInteger(size) && size >= 1 && size <= 50).sort((a, b) => a - b);
  return <section className="catalog-filter-section" aria-labelledby="catalog-filters-title">
    <h2 id="catalog-filters-title">Encontre sua próxima leitura</h2>
    <form className="catalog-filters" onSubmit={(event) => { event.preventDefault(); query.update({}); }} role="search" aria-label="Buscar livros">
      <TextField
        className="catalog-search" id="catalog-q" name="q" label="Buscar por título ou autor" type="search" fullWidth
        value={query.draft} onChange={(event) => query.setDraft(event.target.value)}
        error={Array.from(query.draft.trim()).length > 160} helperText={Array.from(query.draft.trim()).length > 160 ? 'A busca deve ter no máximo 160 caracteres.' : 'Digite até 160 caracteres. A busca é atualizada após uma breve pausa.'}
      />
      <TextField select label="Gênero" id="catalog-genero" value={selected} fullWidth
        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }} disabled={genres.status === 'loading'}
        onChange={(event) => query.update({ generoId: event.target.value })} error={Boolean(query.errors.generoId)}
        helperText={query.errors.generoId || (genres.status === 'loading' ? 'Carregando gêneros…' : genres.status === 'success' && options.length === 0 ? 'Nenhum gênero disponível.' : ' ')}>
        <option value="">Todos os gêneros</option>
        {missing && <option value={selected}>Gênero não disponível na lista</option>}
        {options.map((genre) => <option key={genre.id} value={genre.id}>{genre.nome}</option>)}
      </TextField>
      <TextField select label="Ordenar por" id="catalog-sort" value={query.filters.sort} fullWidth
        slotProps={{ select: { native: true } }} onChange={(event) => query.update({ sort: event.target.value })}
        error={Boolean(query.errors.sort)} helperText={query.errors.sort || ' '}>
        {!['titulo', 'anoPublicacao'].includes(query.filters.sort) && <option value={query.filters.sort}>Ordenação inválida</option>}
        <option value="titulo">Título</option><option value="anoPublicacao">Ano de publicação</option>
      </TextField>
      <TextField select label="Direção" id="catalog-direction" value={query.filters.direction} fullWidth
        slotProps={{ select: { native: true } }} onChange={(event) => query.update({ direction: event.target.value })}
        error={Boolean(query.errors.direction)} helperText={query.errors.direction || ' '}>
        {!['asc', 'desc'].includes(query.filters.direction) && <option value={query.filters.direction}>Direção inválida</option>}
        <option value="asc">Crescente</option><option value="desc">Decrescente</option>
      </TextField>
      <TextField select label="Livros por página" id="catalog-page-size" value={String(query.filters.pageSize)} fullWidth
        slotProps={{ select: { native: true } }} onChange={(event) => query.update({ pageSize: Number(event.target.value) })}
        error={Boolean(query.errors.pageSize)} helperText={query.errors.pageSize || ' '}>
        {!sizes.includes(query.filters.pageSize) && <option value={String(query.filters.pageSize)}>Quantidade inválida</option>}
        {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
      </TextField>
      <Button type="button" onClick={query.clear} disabled={!query.hasChanges} className="catalog-clear">Limpar filtros</Button>
    </form>
    {genres.status === 'error' && <ErrorState title="Não foi possível carregar os gêneros" message={genres.error.policy?.userMessage} onRetry={genres.reload} retryLabel="Carregar gêneros novamente" />}
    {query.filters.sort === 'anoPublicacao' && <p className="catalog-year-note">Livros sem ano de publicação informado aparecem ao final em ambas as direções.</p>}
  </section>;
}
