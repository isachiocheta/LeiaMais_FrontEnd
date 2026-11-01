import Button from '@mui/material/Button';

export function PrimaryButton({ children, ...props }) {
  return <Button variant="contained" color="secondary" {...props}>{children}</Button>;
}
