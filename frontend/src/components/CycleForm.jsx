import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { cycleFormValues, cycleFormPayload, validateCycleForm, cycleWriteFeedback } from '../utils/cycle-form.js';
import { PrimaryButton } from './PrimaryButton.jsx';
import { BookPicker } from './BookPicker.jsx';

export function CycleForm({ initialCycle, onSave, onReload, backTo }) {
  const [values, setValues] = useState(() => cycleFormValues(initialCycle));
  const [selectedBook, setSelectedBook] = useState(initialCycle?.livro ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);
  const refs = useRef({});
  const errorRef = useRef(null);
  const requestRef = useRef(null);
  const sending = useRef(false);
  const payload = cycleFormPayload(values, initialCycle);
  const unchanged = initialCycle && Object.keys(payload).length === 0;
  const locked = feedback?.uncertain || feedback?.conflict;
  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, []);
  useEffect(() => {
    const field = Object.keys(cycleFormValues()).find((key) => errors[key]);
    if (field) refs.current[field]?.focus();
    else if (feedback) errorRef.current?.focus();
  }, [errors, feedback]);

  function field(name, label, helperText, extra = {}) {
    return {
      id: `ciclo-${name}`, name, label, value: values[name], fullWidth: true,
      onChange: (event) => setValues((current) => ({ ...current, [name]: event.target.value })),
      inputRef: (node) => { refs.current[name] = node; },
      disabled: saving, error: Boolean(errors[name]), helperText: errors[name] || helperText,
      ...extra,
    };
  }

  async function submit(event) {
    event.preventDefault();
    if (sending.current || saving || locked || unchanged) return;
    const invalid = validateCycleForm(values);
    setErrors(invalid);
    setFeedback(null);
    if (Object.keys(invalid).length) return;
    sending.current = true;
    setSaving(true);
    const controller = new AbortController();
    requestRef.current = controller;
    try { await onSave(payload, { signal: controller.signal }); }
    catch (error) {
      if (requestRef.current === controller) {
        const next = cycleWriteFeedback(error, initialCycle ? 'update' : 'create');
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
    <p className="cycle-form-intro">Nome, livro e datas são obrigatórios. {initialCycle ? 'A situação é alterada pelas ações de iniciar e concluir no detalhe.' : 'O ciclo será criado como Planejado.'}</p>
    {feedback && <Alert ref={errorRef} tabIndex={-1} severity="error" className="cycle-form-feedback">
      {feedback.message}
      {(feedback.conflict || feedback.uncertain) && <div className="cycle-recovery">{initialCycle ? <Button onClick={onReload}>Recarregar dados e descartar alterações</Button> : <Link to={backTo}>Conferir listagem antes de tentar novamente</Link>}</div>}
    </Alert>}
    <form onSubmit={submit} noValidate aria-label={initialCycle ? 'Editar ciclo' : 'Criar ciclo'} aria-busy={saving} className="cycle-form">
      <TextField {...field('nome', 'Nome do ciclo', 'Até 120 caracteres.', { required: true })} />
      <div className="cycle-book-choice" role="group" aria-labelledby="cycle-book-label" aria-describedby="cycle-book-helper">
        <p id="cycle-book-label" className="cycle-field-label">Livro (obrigatório)</p>
        {selectedBook ? <div className="cycle-selected-book"><strong>{selectedBook.titulo}</strong><p>{selectedBook.autor}</p></div> : <p>Nenhum livro selecionado.</p>}
        <Button variant="outlined" ref={(node) => { refs.current.livroId = node; }} disabled={saving} aria-describedby="cycle-book-helper" aria-invalid={Boolean(errors.livroId)} onClick={() => setPickerOpen(true)}>{selectedBook ? 'Trocar livro' : 'Escolher livro'}</Button>
        <p id="cycle-book-helper" className={errors.livroId ? 'cycle-field-error' : 'cycle-field-help'}>{errors.livroId || 'A seleção permite buscar e percorrer todas as páginas do catálogo.'}</p>
      </div>
      <div className="cycle-date-fields">
        <TextField {...field('dataInicio', 'Data inicial', 'Dia de início do período previsto.', { type: 'date', required: true, slotProps: { inputLabel: { shrink: true } } })} />
        <TextField {...field('dataFim', 'Data final', 'Pode ser igual à data inicial.', { type: 'date', required: true, slotProps: { inputLabel: { shrink: true } } })} />
      </div>
      <p className="cycle-form-rule">As datas são do calendário de São Paulo. Para iniciar, o servidor exige que o dia esteja dentro deste período e que não exista outro ciclo em andamento.</p>
      {initialCycle && <p className="cycle-form-rule">A troca de livro exige ausência de participações e encontros. Ao alterar as datas, todos os encontros vinculados devem continuar dentro do período. O servidor confere essas condições ao salvar.</p>}
      <TextField {...field('orientacoes', 'Orientações (opcional)', `${Array.from(values.orientacoes).length}/2000 caracteres. As quebras de linha serão preservadas.`, { multiline: true, minRows: 5 })} />
      <div className="cycle-form-actions"><PrimaryButton type="submit" disabled={saving || locked || unchanged}>{saving ? 'Salvando…' : initialCycle ? 'Salvar alterações' : 'Criar ciclo'}</PrimaryButton><Link className="text-link" to={backTo}>Voltar sem salvar</Link></div>
    </form>
    {pickerOpen && <BookPicker open onClose={() => setPickerOpen(false)} onSelect={(book) => { setSelectedBook(book); setValues((current) => ({ ...current, livroId: String(book.id) })); setPickerOpen(false); }} />}
  </>;
}
