import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import { useAuth } from '../hooks/useAuth.js';
import { AUTH_STATUS } from '../app/auth-controller.js';
import { api } from '../services/api.js';
import { createRegistrationService, registrationFeedback } from '../services/registration.js';
import { validateRegistration } from '../utils/registration-validation.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { PasswordField } from '../components/PasswordField.jsx';
import { PrimaryButton } from '../components/PrimaryButton.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { SessionProblem } from '../components/SessionProblem.jsx';
import flower from '../assets/flor2.png';

const registration = createRegistrationService(api);

export function RegistrationPage() {
  const auth = useAuth();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const nomeRef = useRef(null);
  const emailRef = useRef(null);
  const senhaRef = useRef(null);
  const confirmacaoRef = useRef(null);
  const errorRef = useRef(null);
  const successRef = useRef(null);
  const sending = useRef(false);
  const requestRef = useRef(null);
  const busy = submitting || auth.status === AUTH_STATUS.CHECKING;

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  useEffect(() => {
    if (success) successRef.current?.focus();
    else if (fieldErrors.nome) nomeRef.current?.focus();
    else if (fieldErrors.email) emailRef.current?.focus();
    else if (fieldErrors.senha) senhaRef.current?.focus();
    else if (fieldErrors.confirmacao) confirmacaoRef.current?.focus();
    else if (submitError) errorRef.current?.focus();
  }, [success, fieldErrors, submitError]);

  async function submit(event) {
    event.preventDefault();
    if (sending.current || busy || success) return;
    const errors = validateRegistration({ nome, email, senha, confirmacao });
    setFieldErrors(errors);
    setSubmitError(null);
    if (Object.keys(errors).length) return;
    sending.current = true;
    setSubmitting(true);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      await registration.register({ nome, email, senha }, { signal: controller.signal });
      if (requestRef.current === controller) setSuccess(true);
    } catch (error) {
      if (requestRef.current === controller) {
        const feedback = registrationFeedback(error);
        setFieldErrors(feedback.fields);
        setSubmitError(feedback.message);
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        sending.current = false;
        setSenha('');
        setConfirmacao('');
        setSubmitting(false);
      }
    }
  }

  if (auth.status === AUTH_STATUS.AUTHENTICATED) return <Navigate to="/minha-area" replace />;

  return (
    <section className="login-section">
      <ContentContainer className="login-wrap">
        <ContentCard className="login-card registration-card">
          <img src={flower} width="58" height="75" alt="" className="login-flower" />
          {success ? <div ref={successRef} tabIndex={-1} role="status" aria-labelledby="cadastro-recebido" className="registration-success">
            <PageHeader id="cadastro-recebido" eyebrow="UM NOVO CAPÍTULO À ESPERA" title="Cadastro recebido!" />
            <p>Sua conta aguarda a aprovação do administrador do clube.</p>
            <p>O cadastro ainda não libera o acesso. Após a aprovação, você poderá entrar com seu e-mail e sua senha para participar das leituras.</p>
            <PrimaryButton component={Link} to="/login">Voltar ao login</PrimaryButton>
            <Link className="text-link" to="/sobre">Conheça o clube <span aria-hidden="true">↗</span></Link>
          </div> : <>
            <PageHeader eyebrow="SEU LUGAR ENTRE AS PÁGINAS" title="Faça parte do Leia+" description="Solicite seu cadastro de leitor. A administração do clube analisa cada solicitação antes de liberar o acesso." />
            {auth.status === AUTH_STATUS.CHECKING ? <LoadingState message="Verificando sua sessão…" /> : <>
              {auth.status === AUTH_STATUS.TEMPORARY_ERROR && <div className="login-notice"><SessionProblem /></div>}
              <p className="registration-required">Todos os campos são obrigatórios.</p>
              {submitError && <Alert severity="error" ref={errorRef} tabIndex={-1} className="login-notice">{submitError}</Alert>}
              <form onSubmit={submit} noValidate aria-label="Solicitar cadastro no Leia+" aria-busy={submitting} className="login-form registration-form">
                <TextField
                  id="cadastro-nome" label="Nome" name="nome" autoComplete="name" required fullWidth
                  value={nome} onChange={(event) => setNome(event.target.value)} inputRef={nomeRef}
                  error={Boolean(fieldErrors.nome)} helperText={fieldErrors.nome || 'De 2 a 100 caracteres, sem contar espaços nas extremidades.'} disabled={busy}
                />
                <TextField
                  id="cadastro-email" label="E-mail" name="email" type="email" autoComplete="email" required fullWidth
                  value={email} onChange={(event) => setEmail(event.target.value)} inputRef={emailRef}
                  error={Boolean(fieldErrors.email)} helperText={fieldErrors.email || 'Use um e-mail válido com até 254 caracteres.'} disabled={busy}
                  slotProps={{ htmlInput: { autoCapitalize: 'none', spellCheck: false } }}
                />
                <PasswordField
                  id="cadastro-senha" label="Senha" name="senha" value={senha} onChange={(event) => setSenha(event.target.value)} inputRef={senhaRef}
                  error={Boolean(fieldErrors.senha)} disabled={busy}
                  helperText={<>{fieldErrors.senha && <><span>{fieldErrors.senha}</span><br /></>}Mínimo de 10 caracteres e máximo de 72 bytes UTF-8. Acentos e emojis podem ocupar mais de um byte. Espaços fazem parte da senha.<br /><span>{Array.from(senha).length} caracteres · {new TextEncoder().encode(senha).length}/72 bytes UTF-8</span></>}
                />
                <PasswordField
                  id="cadastro-confirmacao" label="Confirmação de senha" name="confirmacao" revealLabel="confirmação de senha"
                  value={confirmacao} onChange={(event) => setConfirmacao(event.target.value)} inputRef={confirmacaoRef}
                  error={Boolean(fieldErrors.confirmacao)} helperText={fieldErrors.confirmacao || 'Digite a mesma senha, incluindo espaços.'} disabled={busy}
                />
                <PrimaryButton type="submit" disabled={busy} fullWidth>{submitting ? 'Enviando cadastro…' : 'Solicitar cadastro'}</PrimaryButton>
              </form>
              <p className="auth-switch">Já tem cadastro? <Link to="/login">Voltar ao login.</Link></p>
            </>}
          </>}
        </ContentCard>
      </ContentContainer>
    </section>
  );
}
