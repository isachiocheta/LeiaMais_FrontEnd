import Paper from '@mui/material/Paper';

export function ContentCard({ component = 'div', className = '', children, ...props }) {
  return (
    <Paper component={component} square elevation={0} className={`content-card ${className}`.trim()} {...props}>
      {children}
    </Paper>
  );
}
