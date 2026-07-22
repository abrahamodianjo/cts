import { AppShell, Group, Title, Button, NavLink, Text } from '@mantine/core';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <AppShell header={{ height: 60 }} navbar={{ width: 220, breakpoint: 'sm' }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>CTS Dashboard</Title>
          <Group>
            <Text size="sm" c="dimmed">
              {user?.first_name} {user?.last_name} · {user?.role}
            </Text>
            <Button variant="subtle" onClick={handleLogout}>
              Log out
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        <NavLink label="Live Board" active={location.pathname === '/'} onClick={() => navigate('/')} />
        <NavLink
          label="Locations"
          active={location.pathname.startsWith('/locations')}
          onClick={() => navigate('/locations')}
        />
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
