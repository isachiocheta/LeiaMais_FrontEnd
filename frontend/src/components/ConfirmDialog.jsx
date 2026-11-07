import { useId, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import useMediaQuery from '@mui/material/useMediaQuery';
import { PrimaryButton } from './PrimaryButton.jsx';

export function ConfirmDialog({
  open, title, description, onConfirm, onCancel,
  confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', pending = false,
  errorMessage, confirmDisabled = false, recoveryAction,
}) {
  const id = useId();
  const lock = useRef(false);
  const cancelRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const busy = pending || submitting;

  function cancel() {
    if (busy || lock.current) return;
    setFailed(false);
    onCancel();
  }

  async function confirm() {
    if (busy || lock.current || confirmDisabled) return;
    lock.current = true;
    setSubmitting(true);
    setFailed(false);
    try {
      await onConfirm();
    } catch {
      setFailed(true);
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={cancel}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      transitionDuration={reducedMotion ? 0 : undefined}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: { 'aria-busy': busy },
        transition: { onEntered: () => cancelRef.current?.focus() },
      }}
    >
      <DialogTitle id={`${id}-title`} sx={{ overflowWrap: 'anywhere' }}>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id={`${id}-description`}>{description}</DialogContentText>
        {failed && <p className="dialog-error" role="alert">{errorMessage || 'Não foi possível concluir. Tente novamente.'}</p>}
        {failed && recoveryAction}
      </DialogContent>
      <DialogActions>
        <Button ref={cancelRef} autoFocus onClick={cancel} disabled={busy}>{cancelLabel}</Button>
        <PrimaryButton onClick={confirm} disabled={busy || confirmDisabled}>{busy ? 'Aguarde…' : confirmLabel}</PrimaryButton>
      </DialogActions>
    </Dialog>
  );
}
