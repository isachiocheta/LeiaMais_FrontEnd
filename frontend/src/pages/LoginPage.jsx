import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import { useAuth } from '../hooks/useAuth.js';
import { AUTH_STATUS } from '../app/auth-controller.js';
import { safeReturnTo } from '../utils/return-to.js';
import { validateLogin } from '../utils/login-validation.js';
import { ContentContainer } from '../components/ContentContainer.jsx';
import { ContentCard } from '../components/ContentCard.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { PrimaryButton } from '../components/PrimaryButton.jsx';
import { LoadingState } from '../components/LoadingState.jsx';
import { SessionProblem } from '../components/SessionProblem.jsx';
import flower from '../assets/flor2.png';

function Eye({ visible }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    {visible && <path d="m3 3 18 18" stroke="currentColor" strokeWidth="1.7" />}
  </svg>;
}

export function LoginPage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [visible, setVisible] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const errorRef = useRef(null);
  const sending = useRef(false);
  const returnTo = safeReturnTo(params.get('retorno'));
  const busy = submitting || auth.status === AUTH_STATUS.CHECKING;

  useEffect(() => {
    if (fieldErrors.email) emailRef.current?.focus();
    else if (fieldErrors.senha) passwordRef.current?.focus();
    else if (submitError) errorRef.current?.focus();
  }, [fieldErrors, submitError]);

  async function submit(event) {
    event.preventDefault();
    if (sending.current || busy || auth.needsVerification) return;
    const errors = validateLogin({ email, senha });
    setFieldErrors(errors);
    setSubmitError(null);
    if (Object.keys(errors).length) return;
    sending.current = true;
    setSubmitting(true);
    try {
      await auth.login({ email, senha });
    } catch (error) {
      setFieldErrors({ email: error.fieldErrors?.email?.[0], senha: error.fieldErrors?.senha?.[0] });
      setSubmitError(error);
    } finally {
      setSenha('');
      setVisible(false);
      sending.current = false;
      setSubmitting(false);
    }
  }

  if (auth.status === AUTH_STATUS.AUTHENTICATED) return <Navigate to={returnTo} replace />;

  return (
    <section className="login-section">
      <ContentContainer className="login-wrap">
        <ContentCard className="login-card">
          <img src={flower} width="58" height="75" alt="" className="login-flower" />
          <PageHeader eyebrow="SEU PRÓXIMO CAPÍTULO COMEÇA AQUI" title="Entre no Leia+" description="Suas leituras e encontros esperam por você." />
          {auth.status === AUTH_STATUS.CHECKING && auth.action !== 'login' ? <LoadingState message="Verificando sua sessão…" /> : <>
            {auth.reason === 'expired' && <Alert severity="warning" className="login-notice">Sua sessão não está mais disponível. Entre novamente.</Alert>}
            {auth.reason === 'signed_out' && <p role="status" className="login-notice">Você saiu da sua conta.</p>}
            {auth.status === AUTH_STATUS.TEMPORARY_ERROR && <div className="login-notice"><SessionProblem /></div>}
            {submitError && !auth.needsVerification && auth.status !== AUTH_STATUS.TEMPORARY_ERROR && <Alert severity="error" ref={errorRef} tabIndex={-1} className="login-notice">{submitError.policy?.userMessage || 'Não foi possível entrar. Tente novamente.'}</Alert>}
            <form onSubmit={submit} noValidate aria-label="Entrar no Leia+" aria-busy={busy} className="login-form">
              <TextField
                id="login-email" label="E-mail" name="email" type="email" autoComplete="username" required fullWidth
                value={email} onChange={(event) => setEmail(event.target.value)} inputRef={emailRef}
                error={Boolean(fieldErrors.email)} helperText={fieldErrors.email || ' '}
                disabled={busy || auth.needsVerification}
                slotProps={{ htmlInput: { autoCapitalize: 'none', spellCheck: false } }}
              />
              <TextField
                id="login-senha" label="Senha" name="senha" type={visible ? 'text' : 'password'} autoComplete="current-password" required fullWidth
                value={senha} onChange={(event) => setSenha(event.target.value)} inputRef={passwordRef}
                error={Boolean(fieldErrors.senha)} helperText={fieldErrors.senha || ' '}
                disabled={busy || auth.needsVerification}
                slotProps={{ input: { endAdornment: <InputAdornment position="end"><IconButton
                  type="button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible}
                  onClick={() => setVisible((current) => !current)} onMouseDown={(event) => event.preventDefault()}
                  disabled={busy || auth.needsVerification}
                ><Eye visible={visible} /></IconButton></InputAdornment> } }}
              />
              <PrimaryButton type="submit" disabled={busy || auth.needsVerification} fullWidth>{busy ? 'Entrando…' : 'Entrar'}</PrimaryButton>
            </form>
            <p className="login-footnote">O acesso dos leitores é liberado após a aprovação do cadastro pela administração do clube.</p>
          </>}
          <Link className="text-link" to="/sobre">Conheça o clube <span aria-hidden="true">↗</span></Link>
        </ContentCard>
      </ContentContainer>
    </section>
  );
}
