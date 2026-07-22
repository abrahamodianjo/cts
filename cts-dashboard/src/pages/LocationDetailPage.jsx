import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Paper,
  Title,
  Text,
  Group,
  Button,
  Badge,
  Loader,
  Alert,
  Stack,
  CopyButton,
  SegmentedControl,
  Divider,
} from '@mantine/core';
import { QRCodeCanvas } from 'qrcode.react';
import { api } from '../api/client';

export function LocationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qrRef = useRef(null);

  const [location, setLocation] = useState(null);
  const [credential, setCredential] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [newCredType, setNewCredType] = useState('qr');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [locRes, credRes] = await Promise.all([
        api.get(`/locations/${id}`),
        api.get(`/locations/${id}/credentials/active`).catch((err) => {
          if (err.response?.status === 404) return { data: { credential: null } };
          throw err;
        }),
      ]);
      setLocation(locRes.data.location);
      setCredential(credRes.data.credential);
    } catch {
      setError('Could not load this location.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await api.post(`/locations/${id}/credentials`, { type: newCredType });
      setCredential(res.data.credential);
    } catch {
      setError('Could not generate a new credential.');
    } finally {
      setGenerating(false);
    }
  }

  function handleDownload() {
    const canvas = qrRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${location?.name || 'location'}-credential.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  if (loading) return <Loader />;
  if (!location) return <Alert color="red">{error || 'Location not found.'}</Alert>;

  return (
    <Stack maw={560}>
      <Group justify="space-between">
        <Title order={3}>{location.name}</Title>
        <Group>
          <Badge color={location.is_active ? 'green' : 'gray'}>{location.is_active ? 'active' : 'inactive'}</Badge>
          <Button variant="default" onClick={() => navigate(`/locations/${id}/edit`)}>
            Edit
          </Button>
        </Group>
      </Group>

      {error && <Alert color="red">{error}</Alert>}

      <Paper withBorder p="md">
        <Text size="sm" c="dimmed">
          {location.address_line1}
          {location.address_line2 ? `, ${location.address_line2}` : ''}
        </Text>
        <Text size="sm" c="dimmed">
          {location.city}, {location.postcode}
        </Text>
        <Text size="sm" mt="xs">
          Type: {location.location_type} · Radius: {location.radius_metres}m
        </Text>
        <Text size="sm">
          Coordinates: {location.latitude}, {location.longitude}
        </Text>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Active credential
        </Title>

        {credential ? (
          <Stack align="flex-start">
            <Badge variant="light">{credential.type.toUpperCase()}</Badge>
            <QRCodeCanvas ref={qrRef} value={credential.token} size={200} marginSize={4} />
            <Group>
              <Text ff="monospace" size="sm">
                {credential.token}
              </Text>
              <CopyButton value={credential.token}>
                {({ copied, copy }) => (
                  <Button size="xs" variant="light" onClick={copy}>
                    {copied ? 'Copied' : 'Copy token'}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Text size="xs" c="dimmed">
              Write this token to an NFC tag, or download the QR code below to print.
            </Text>
            <Button size="sm" onClick={handleDownload}>
              Download QR code
            </Button>
          </Stack>
        ) : (
          <Text c="dimmed" mb="sm">
            No active credential for this location yet.
          </Text>
        )}

        <Divider my="md" />

        <Group align="flex-end">
          <SegmentedControl
            value={newCredType}
            onChange={setNewCredType}
            data={[
              { label: 'QR', value: 'qr' },
              { label: 'NFC', value: 'nfc' },
            ]}
          />
          <Button onClick={handleGenerate} loading={generating}>
            {credential ? 'Generate new (replaces current)' : 'Generate credential'}
          </Button>
        </Group>
      </Paper>
    </Stack>
  );
}
