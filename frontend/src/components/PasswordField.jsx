import { useEffect, useState } from 'react';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';

function Eye({ visible }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    {visible && <path d="m3 3 18 18" stroke="currentColor" strokeWidth="1.7" />}
  </svg>;
}

export function PasswordField({ id, name, label, value, onChange, inputRef, error, helperText, disabled = false, autoComplete = 'new-password', revealLabel = 'senha' }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { if (!value) setVisible(false); }, [value]);
  return <TextField
    id={id} name={name} label={label} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required fullWidth
    value={value} onChange={onChange} inputRef={inputRef} error={error} helperText={helperText} disabled={disabled}
    slotProps={{
      htmlInput: { autoCapitalize: 'none', spellCheck: false },
      input: { endAdornment: <InputAdornment position="end"><IconButton
        type="button" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${revealLabel}`} aria-pressed={visible}
        onClick={() => setVisible((current) => !current)} onMouseDown={(event) => event.preventDefault()} disabled={disabled}
      ><Eye visible={visible} /></IconButton></InputAdornment> },
    }}
  />;
}
