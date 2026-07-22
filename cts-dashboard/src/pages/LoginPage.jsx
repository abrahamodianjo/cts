import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Paper, TextInput, PasswordInput, Button, Title, Alert, Stack, Center } from '@mantine/core';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      if (err.message === 'staff_not_allowed') {
        setError('Staff accounts cannot access the admin dashboard.');
      } else if (err.response?.status === 401) {
        setError('Invalid email or password.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Center h="100vh">
      <Paper withBorder shadow="md" p="xl" w={380}>
        <Stack>
          <Title order={2} ta="center">
            CTS Dashboard
          </Title>
          <form onSubmit={handleSubmit}>
            <Stack>
              <TextInput
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                required
                autoFocus
              />
              <PasswordInput
                label="Password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                required
              />
              {error && (
                <Alert color="red" variant="light">
                  {error}
                </Alert>
              )}
              <Button type="submit" loading={loading} fullWidth>
                Log in
              </Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Center>
  );
}
