import Box from '@mui/material/Box';

export function ContentContainer({ component = 'div', className = '', children, ...props }) {
  return (
    <Box component={component} className={`page-width ${className}`.trim()} {...props}>
      {children}
    </Box>
  );
}
