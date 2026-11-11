import { ReactNode } from 'react';
import Link from 'next/link';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';

const NAV_ITEMS = [{ href: '/rooms', label: 'Rooms' }];

type AppLayoutProps = {
  children: ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <>
      <AppBar position="static">
        <Toolbar sx={{ flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h6" component="span">
            Roombook
          </Typography>
          <Box component="nav" aria-label="Main" sx={{ display: 'flex', gap: 1 }}>
            {NAV_ITEMS.map((item) => (
              <Button key={item.href} component={Link} href={item.href} color="inherit">
                {item.label}
              </Button>
            ))}
          </Box>
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="md" sx={{ py: 3 }}>
        {children}
      </Container>
    </>
  );
}
