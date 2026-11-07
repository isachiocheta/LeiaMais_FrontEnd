import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import { bookFormValues, bookFormPayload, validateBookForm, bookWriteFeedback } from '../utils/book-form.js';
import { BookCover } from './BookCover.jsx';
import { PrimaryButton } from './PrimaryButton.jsx';
import { ErrorState } from './ErrorState.jsx';

export function BookForm({ initialBook, genres, onSave, backTo }) {
  const [values, setValues] = useState(() => bookFormValues(initialBook));
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(values.capaUrl);
  const refs = useRef({});
  const errorRef = useRef(null);
  const requestRef = useRef(null);
  const sending = useRef(false);
  const year = new Date().getFullYear();
  const options = genres.data || [];
  const busy = saving || genres.status !== 'success' || options.length === 0;

  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, []);
  useEffect(() => {
    const timer = setTimeout(() => setPreview(values.capaUrl), 300);
    return () => clearTimeout(timer);
  }, [values.capaUrl]);
  useEffect(() => {
    const field = Object.keys(bookFormValues()).find((key) => errors[key]);
    if (field) refs.current[field]?.focus();
    else if (feedback) errorRef.current?.focus();
  }, [errors, feedback]);

  function field(name, label, helperText, extra = {}) {
    return {
      id: `livro-${name}`, name, label, value: values[name], fullWidth: true,
      onChange: (event) => setValues((current) => ({ ...current, [name]: event.target.value })),
      inputRef: (node) => { refs.current[name] = node; },
      disabled: saving, error: Boolean(errors[name]), helperText: errors[name] || helperText,
      ...extra,
    };
  }

  async function submit(event) {
    event.preventDefault();
    if (sending.current || busy || feedback?.uncertain) return;
    const invalid = validateBookForm(values, year);
    if (!options.some((genre) => String(genre.id) === values.generoId)) invalid.generoId = 'Escolha um gênero disponível.';
    setErrors(invalid);
    setFeedback(null);
    if (Object.keys(invalid).length) return;
    sending.current = true;
    setSaving(true);
    const controller = new AbortController();
    requestRef.current = controller;
    try { await onSave(bookFormPayload(values), { signal: controller.signal }); }
    catch (error) {
      if (requestRef.current === controller) {
        const next = bookWriteFeedback(error, initialBook ? 'update' : 'create');
        setErrors(next.fields);
        setFeedback(next);
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        sending.current = false;
        setSaving(false);
      }
    }
  }

  return <>
    {genres.status === 'error' && <ErrorState title="Não foi possível carregar os gêneros" message={genres.error.policy?.userMessage} onRetry={genres.reload} retryLabel="Carregar gêneros novamente" />}
    {genres.status === 'success' && options.length === 0 && <Alert severity="warning">Não há gêneros disponíveis. É necessário um gênero para salvar o livro.</Alert>}
    <p className="book-form-instructions">Título, autor, gênero e total de páginas são obrigatórios.</p>
    {feedback && <Alert ref={errorRef} tabIndex={-1} severity="error" className="book-form-error">{feedback.message}{feedback.uncertain && <> <Link to={backTo}>Conferir listagem</Link></>}</Alert>}
    <form onSubmit={submit} noValidate aria-label={initialBook ? 'Editar livro' : 'Criar livro'} aria-busy={saving} className="book-form">
      <div className="book-form-fields">
        <TextField {...field('titulo', 'Título', 'Até 160 caracteres.', { required: true })} />
        <TextField {...field('autor', 'Autor', 'Até 120 caracteres.', { required: true })} />
        <TextField {...field('generoId', 'Gênero', genres.status === 'loading' ? 'Carregando todos os gêneros…' : 'Selecione um gênero do catálogo.', {
          required: true, select: true, disabled: saving || genres.status !== 'success', slotProps: { select: { native: true }, inputLabel: { shrink: true } },
        })}>
          <option value="">Selecione um gênero</option>
          {values.generoId && !options.some((genre) => String(genre.id) === values.generoId) && <option value={values.generoId}>Gênero atual indisponível na lista</option>}
          {options.map((genre) => <option key={genre.id} value={genre.id}>{genre.nome}</option>)}
        </TextField>
        <div className="book-number-fields">
          <TextField {...field('totalPaginas', 'Total de páginas', 'Inteiro de 1 a 2147483647.', { required: true, type: 'number', slotProps: { htmlInput: { min: 1, max: 2147483647, step: 1, inputMode: 'numeric' } } })} />
          <TextField {...field('anoPublicacao', 'Ano de publicação (opcional)', `De 1 a ${year}; deixe em branco se não informado.`, { type: 'number', slotProps: { htmlInput: { min: 1, max: year, step: 1, inputMode: 'numeric' } } })} />
        </div>
        {initialBook && <p className="book-pages-rule">Se houver qualquer ciclo vinculado, inclusive planejado ou concluído, o total de páginas deve permanecer em {initialBook.totalPaginas.toLocaleString('pt-BR')}. Os outros campos podem ser editados; o servidor verifica o vínculo ao salvar.</p>}
        <TextField {...field('descricao', 'Descrição (opcional)', `${Array.from(values.descricao).length}/2000 caracteres.`, { multiline: true, minRows: 4 })} />
        <TextField {...field('capaUrl', 'URL da capa (opcional)', 'Somente HTTPS, sem espaços nem credenciais. Deixe em branco para não informar capa.', { type: 'url' })} />
        <div className="book-form-actions">
          <PrimaryButton type="submit" disabled={busy || feedback?.uncertain}>{saving ? 'Salvando…' : initialBook ? 'Salvar alterações' : 'Cadastrar livro'}</PrimaryButton>
          <Link className="text-link" to={backTo}>{feedback?.uncertain ? 'Conferir listagem' : 'Voltar à listagem'}</Link>
        </div>
      </div>
      <aside className="book-form-preview" aria-label="Prévia da capa"><h2>Prévia da capa</h2><BookCover src={preview} title={values.titulo || 'livro'} /><p>A prévia usa a URL informada. Uma capa indisponível não impede o cadastro.</p></aside>
    </form>
  </>;
}
