import { useCallback, useEffect, useState } from 'react';
import { Table, Badge, Text, Loader, Alert, Title, Group, Paper } from '@mantine/core';
import { api } from '../api/client';

const POLL_INTERVAL_MS = 30000;
const CLOCK_TICK_MS = 1000;

const STATUS_COLORS = {
  available: 'green',
  with_client: 'blue',
  on_break: 'yellow',
  traveling: 'orange',
  off_shift: 'gray',
};

function formatElapsed(fromIso, now) {
  if (!fromIso) return '—';
  const from = new Date(fromIso).getTime();
  const diffMs = Math.max(0, now - from);
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
}

export function LiveBoardPage() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());

  const fetchLive = useCallback(async () => {
    try {
      const response = await api.get('/status/live');
      setStaff(response.data.staff);
      setError(null);
    } catch {
      setError('Could not load the live board.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const dataInterval = setInterval(fetchLive, POLL_INTERVAL_MS);
    return () => clearInterval(dataInterval);
  }, [fetchLive]);

  useEffect(() => {
    const clockInterval = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(clockInterval);
  }, []);

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="md">
        <Title order={3}>Live Board</Title>
        {loading && <Loader size="sm" />}
      </Group>

      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}

      {!loading && staff.length === 0 && !error && <Text c="dimmed">No staff currently clocked in.</Text>}

      {staff.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Staff</Table.Th>
              <Table.Th>Location</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Time since clock-in</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {staff.map((member) => (
              <Table.Tr key={member.staff_id}>
                <Table.Td>
                  {member.first_name} {member.last_name}
                </Table.Td>
                <Table.Td>{member.location_name || '—'}</Table.Td>
                <Table.Td>
                  <Badge color={STATUS_COLORS[member.current_status] || 'gray'} variant="light">
                    {member.current_status ? member.current_status.replace('_', ' ') : 'unknown'}
                  </Badge>
                </Table.Td>
                <Table.Td>{formatElapsed(member.clocked_in_at, now)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  );
}
