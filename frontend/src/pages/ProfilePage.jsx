import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { useAuth } from '../hooks/useAuth.js';
import { startRequest } from '../utils/request-task.js';
import { NEW_PASSWORD_GUIDANCE, profileFeedback, validatePasswordChange, validateProfileName } from '../utils/profile-validation.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { PrimaryButton } from '../components/PrimaryButton.jsx';
import { PasswordField } from '../components/PasswordField.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { ErrorState } from '../components/ErrorState.jsx';

const emptyPasswords = () => ({ senhaAtual: '', novaSenha: '', confirmacao: '' });

function PasswordChangeForm({ auth, disabled, onBusyChange, onReload }) {
  const [values, setValues] = useState(emptyPasswords);
  const [fields, setFields] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const sending = useRef(false);
  const request = useRef(null);
  const inputs = useRef({});
  const feedbackRef = useRef(null);
  const busy = disabled || submitting;

  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => {
    const first = ['senhaAtual', 'novaSenha', 'confirmacao'].find((field) => fields[field]);
    if (first) inputs.current[first]?.focus();
    else if (feedback) feedbackRef.current?.focus();
  }, [fields, feedback]);

  async function submit(event) {
    event.preventDefault();
    if (sending.current || busy || feedback?.uncertain) return;
    const errors = validatePasswordChange(values);
    setFields(errors); setFeedback(null);
    if (Object.keys(errors).length) return;
    sending.current = true;
    setSubmitting(true); onBusyChange(true);
    const controller = new AbortController(); request.current = controller;
    try {
      await auth.changeOwnPassword({ senhaAtual: values.senhaAtual, novaSenha: values.novaSenha }, { signal: controller.signal });
    } catch (error) {
      if (!controller.signal.aborted) {
        const result = profileFeedback(error, { password: true });
        setFields(result.fields); setFeedback(result);
      }
    } finally {
      // As senhas não permanecem no formulário após uma tentativa enviada à API.
      setValues(emptyPasswords());
      sending.current = false;
      if (!controller.signal.aborted) { setSubmitting(false); onBusyChange(false); }
    }
  }

  return <ContentCard component="section" className="own-profile-card own-profile-password" aria-labelledby="profile-password-title">
    <p className="eyebrow">CUIDE DO SEU ACESSO</p>
    <h2 id="profile-password-title">Trocar senha</h2>
    <p id="profile-password-effect">Após a troca, todas as sessões anteriores serão invalidadas, inclusive esta. Você precisará entrar novamente com a nova senha.</p>
    <p id="profile-password-guidance" className="own-profile-guidance">{NEW_PASSWORD_GUIDANCE}</p>
    {feedback && <Alert severity={feedback.uncertain ? 'warning' : 'error'} ref={feedbackRef} tabIndex={-1} className="own-profile-feedback">
      {feedback.message}
      {feedback.conflict && <Button type="button" onClick={onReload} disabled={busy}>Consultar conta atual</Button>}
      {feedback.uncertain && <Button type="button" onClick={auth.reauthenticateAfterUncertainPassword} disabled={busy}>Ir para o login</Button>}
    </Alert>}
    <form className="own-profile-form" onSubmit={submit} noValidate aria-label="Trocar minha senha" aria-describedby="profile-password-effect profile-password-guidance" aria-busy={submitting}>
      {[
        ['senhaAtual', 'Senha atual', 'current-password', 'senha atual'],
        ['novaSenha', 'Nova senha', 'new-password', 'nova senha'],
        ['confirmacao', 'Confirme a nova senha', 'new-password', 'confirmação da nova senha'],
      ].map(([name, label, autoComplete, revealLabel]) => <PasswordField
        key={name} id={`profile-${name}`} name={name} label={label} autoComplete={autoComplete} revealLabel={revealLabel}
        value={values[name]} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
        inputRef={(element) => { inputs.current[name] = element; }}
        error={Boolean(fields[name])} helperText={fields[name] || (name === 'senhaAtual' ? 'Informe o valor exato, incluindo espaços.' : name === 'confirmacao' ? 'A confirmação fica somente neste formulário.' : 'Mínimo de 10 caracteres; máximo de 72 bytes UTF-8.')}
        disabled={busy || feedback?.uncertain === true}
      />)}
      <PrimaryButton type="submit" disabled={busy || feedback?.uncertain === true}>{submitting ? 'Alterando senha…' : 'Alterar senha'}</PrimaryButton>
    </form>
  </ContentCard>;
}

function ProfileForms({ auth, reloading, onReload, children }) {
  const { user } = auth;
  const [nome, setNome] = useState(user.nome);
  const [fields, setFields] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [success, setSuccess] = useState(false);
  const [nameBusy, setNameBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const sending = useRef(false);
  const request = useRef(null);
  const nameRef = useRef(null);
  const feedbackRef = useRef(null);
  const busy = reloading || nameBusy || passwordBusy;

  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => {
    if (fields.nome) nameRef.current?.focus();
    else if (feedback || success) feedbackRef.current?.focus();
  }, [fields, feedback, success]);

  async function saveName(event) {
    event.preventDefault();
    if (sending.current || busy) return;
    const errors = validateProfileName(nome);
    setFields(errors); setFeedback(null); setSuccess(false);
    if (Object.keys(errors).length) return;
    sending.current = true; setNameBusy(true);
    const controller = new AbortController(); request.current = controller;
    try {
      const saved = await auth.updateOwnName({ nome }, { signal: controller.signal });
      if (!controller.signal.aborted) { setNome(saved.nome); setSuccess(true); }
    } catch (error) {
      if (!controller.signal.aborted) {
        const result = profileFeedback(error); setFields(result.fields); setFeedback(result);
      }
    } finally { sending.current = false; if (!controller.signal.aborted) setNameBusy(false); }
  }

  return <>
    <ContentCard component="section" className="own-profile-identity" aria-labelledby="profile-identity-title">
      <h2 id="profile-identity-title">Sua conta no clube</h2>
      <dl>
        <div><dt>Nome salvo</dt><dd>{user.nome}</dd></div>
        <div><dt>E-mail</dt><dd>{user.email}</dd></div>
        <div><dt>Perfil</dt><dd>{user.perfil === 'ADMIN_CLUBE' ? 'Administração do clube' : 'Leitor'}</dd></div>
        <div><dt>Situação</dt><dd><StatusBadge status={user.situacao} /></dd></div>
      </dl>
      <p>Somente o nome pode ser editado aqui. E-mail, perfil e situação são dados somente para leitura.</p>
    </ContentCard>
    {children}
    <div className="own-profile-columns">
      <ContentCard component="section" className="own-profile-card" aria-labelledby="profile-name-title">
        <p className="eyebrow">DO SEU JEITO</p>
        <h2 id="profile-name-title">Editar nome</h2>
        <p>Use de 2 a 100 caracteres. Espaços no início e no fim do nome são removidos pelo servidor.</p>
        {success && <Alert severity="success" role="status" ref={feedbackRef} tabIndex={-1} className="own-profile-feedback">Seu nome foi atualizado.</Alert>}
        {feedback && <Alert severity={feedback.uncertain ? 'warning' : 'error'} ref={feedbackRef} tabIndex={-1} className="own-profile-feedback">
          {feedback.message}
          {(feedback.conflict || feedback.uncertain) && <Button type="button" onClick={onReload} disabled={busy}>Consultar dados atuais</Button>}
        </Alert>}
        <form onSubmit={saveName} className="own-profile-form" noValidate aria-label="Editar meu nome" aria-busy={nameBusy}>
          <TextField id="profile-nome" name="nome" label="Nome" autoComplete="name" required fullWidth inputRef={nameRef}
            value={nome} onChange={(event) => { setNome(event.target.value); setSuccess(false); }}
            error={Boolean(fields.nome)} helperText={fields.nome || 'De 2 a 100 caracteres.'} disabled={busy} />
          <PrimaryButton type="submit" disabled={busy}>{nameBusy ? 'Salvando nome…' : 'Salvar nome'}</PrimaryButton>
          {nome !== user.nome && <Button type="button" onClick={() => { setNome(user.nome); setFields({}); setFeedback(null); setSuccess(false); }} disabled={busy}>Usar nome salvo</Button>}
        </form>
      </ContentCard>
      <PasswordChangeForm auth={auth} disabled={reloading || nameBusy} onBusyChange={setPasswordBusy} onReload={onReload} />
    </div>
  </>;
}

function OwnProfile({ auth }) {
  const [attempt, setAttempt] = useState(0);
  const [resource, setResource] = useState({ status: 'loading', loaded: false, error: null });
  const reload = () => setAttempt((value) => value + 1);
  const read = auth.readOwnProfile;
  useEffect(() => {
    setResource((current) => ({ ...current, status: 'loading', error: null }));
    const task = startRequest(read, {
      onSuccess: () => setResource({ status: 'success', loaded: true, error: null }),
      onError: (error) => setResource((current) => ({ ...current, status: 'error', error })),
    });
    return task.cancel;
  }, [read, attempt]);

  return <ContentContainer className="inner-page own-profile-page">
    <Link className="text-link" to="/minha-area">← Voltar à minha área</Link>
    <PageHeader eyebrow="SUA CONTA, SEU PRÓXIMO CAPÍTULO" title="Meu perfil" description="Confira seus dados e cuide do seu acesso ao Leia+." />
    {!resource.loaded ? resource.status === 'loading' ? <LoadingState message="Carregando seu perfil…" />
      : <ErrorState title="Não foi possível carregar seu perfil" message={resource.error.policy?.userMessage} onRetry={reload} />
      : <ProfileForms auth={auth} reloading={resource.status === 'loading'} onReload={reload}>
        {resource.status === 'loading' && <LoadingState compact message="Consultando seus dados atuais…" />}
        {resource.status === 'error' && <ErrorState title="Não foi possível atualizar a consulta" message="Os dados exibidos são da consulta anterior. Seu nome em edição foi preservado." onRetry={reload} />}
        {attempt > 0 && resource.status === 'success' && <Alert severity="info" role="status">Dados da conta consultados. O nome em edição foi preservado; compare com o nome salvo acima.</Alert>}
      </ProfileForms>}
  </ContentContainer>;
}

export function ProfilePage() {
  const auth = useAuth();
  return <OwnProfile key={auth.user.id} auth={auth} />;
}
