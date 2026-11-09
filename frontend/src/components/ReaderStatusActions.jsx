import Button from '@mui/material/Button';
import { readerActions, READER_ACTIONS } from '../utils/reader-actions.js';

export function ReaderStatusActions({ reader, disabled, onSelect }) {
  return <div className="reader-status-actions">{readerActions(reader).map((operation) => <Button key={operation} variant={operation === 'approve' ? 'contained' : 'outlined'} disabled={disabled} aria-label={`${READER_ACTIONS[operation].label}: ${reader.nome}, ${reader.email}`} onClick={() => onSelect(reader, operation)}>{READER_ACTIONS[operation].label}</Button>)}</div>;
}
