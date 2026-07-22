import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Group, Title, Paper, Badge, Text, Loader, Alert } from '@mantine/core';
import { api } from '../api/client';

export function LocationsListPage() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/locations')
      .then((res) => {
        if (!cancelled) setLocations(res.data.locations);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load locations.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="md">
        <Title order={3}>Locations</Title>
        <Button onClick={() => navigate('/locations/new')}>New location</Button>
      </Group>

      {loading && <Loader size="sm" />}
      {error && <Alert color="red">{error}</Alert>}

      {!loading && !error && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>City</Table.Th>
              <Table.Th>Postcode</Table.Th>
              <Table.Th>Radius (m)</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {locations.map((loc) => (
              <Table.Tr key={loc.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/locations/${loc.id}`)}>
                <Table.Td>{loc.name}</Table.Td>
                <Table.Td>{loc.location_type}</Table.Td>
                <Table.Td>{loc.city}</Table.Td>
                <Table.Td>{loc.postcode}</Table.Td>
                <Table.Td>{loc.radius_metres}</Table.Td>
                <Table.Td>
                  <Badge color={loc.is_active ? 'green' : 'gray'} variant="light">
                    {loc.is_active ? 'active' : 'inactive'}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
            {locations.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="dimmed">No locations yet.</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  );
}
