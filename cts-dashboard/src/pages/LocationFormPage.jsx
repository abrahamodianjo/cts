import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Paper, Title, TextInput, Select, NumberInput, Button, Group, Alert, Loader, Switch } from '@mantine/core';
import { useForm } from '@mantine/form';
import { api } from '../api/client';

const LOCATION_TYPES = [
  { value: 'facility', label: 'Facility (care home)' },
  { value: 'client_home', label: "Client's home (domiciliary)" },
];

export function LocationFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const form = useForm({
    initialValues: {
      name: '',
      location_type: 'facility',
      address_line1: '',
      address_line2: '',
      city: '',
      postcode: '',
      latitude: '',
      longitude: '',
      radius_metres: 100,
      is_active: true,
    },
    validate: {
      name: (v) => (v.trim() ? null : 'Name is required'),
      address_line1: (v) => (v.trim() ? null : 'Address is required'),
      city: (v) => (v.trim() ? null : 'City is required'),
      postcode: (v) => (v.trim() ? null : 'Postcode is required'),
      latitude: (v) => (v === '' || Number.isNaN(Number(v)) ? 'Latitude must be a number' : null),
      longitude: (v) => (v === '' || Number.isNaN(Number(v)) ? 'Longitude must be a number' : null),
    },
  });

  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    api
      .get(`/locations/${id}`)
      .then((res) => {
        if (cancelled) return;
        const loc = res.data.location;
        form.setValues({
          name: loc.name,
          location_type: loc.location_type,
          address_line1: loc.address_line1,
          address_line2: loc.address_line2 || '',
          city: loc.city,
          postcode: loc.postcode,
          latitude: loc.latitude,
          longitude: loc.longitude,
          radius_metres: loc.radius_metres,
          is_active: loc.is_active,
        });
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this location.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  async function handleSubmit(values) {
    setSaving(true);
    setError(null);
    const payload = {
      ...values,
      latitude: Number(values.latitude),
      longitude: Number(values.longitude),
      radius_metres: Number(values.radius_metres),
    };
    try {
      if (isEdit) {
        await api.patch(`/locations/${id}`, payload);
        navigate(`/locations/${id}`);
      } else {
        const res = await api.post('/locations', payload);
        navigate(`/locations/${res.data.location.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save this location.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loader />;

  return (
    <Paper withBorder p="md" maw={560}>
      <Title order={3} mb="md">
        {isEdit ? 'Edit location' : 'New location'}
      </Title>
      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <TextInput label="Name" mb="sm" {...form.getInputProps('name')} />
        <Select label="Type" mb="sm" data={LOCATION_TYPES} {...form.getInputProps('location_type')} />
        <TextInput label="Address line 1" mb="sm" {...form.getInputProps('address_line1')} />
        <TextInput label="Address line 2" mb="sm" {...form.getInputProps('address_line2')} />
        <TextInput label="City" mb="sm" {...form.getInputProps('city')} />
        <TextInput label="Postcode" mb="sm" {...form.getInputProps('postcode')} />
        <Group grow mb="sm">
          <NumberInput label="Latitude" decimalScale={6} {...form.getInputProps('latitude')} />
          <NumberInput label="Longitude" decimalScale={6} {...form.getInputProps('longitude')} />
        </Group>
        <NumberInput label="Radius (metres)" mb="sm" min={1} {...form.getInputProps('radius_metres')} />
        {isEdit && (
          <Switch
            label="Active"
            mb="md"
            checked={form.values.is_active}
            onChange={(event) => form.setFieldValue('is_active', event.currentTarget.checked)}
          />
        )}
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </Group>
      </form>
    </Paper>
  );
}
