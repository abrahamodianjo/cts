const crypto = require('crypto');
const express = require('express');

const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

const LOCATION_TYPES = ['facility', 'client_home'];
const CREDENTIAL_TYPES = ['nfc', 'qr'];
const UPDATABLE_FIELDS = [
  'name', 'location_type', 'address_line1', 'address_line2',
  'city', 'postcode', 'latitude', 'longitude', 'radius_metres', 'is_active',
];

router.use(requireAuth, requireRole(['admin', 'manager']));

function handleDbError(err, res) {
  if (err.code === '22P02') {
    return res.status(400).json({ error: 'invalid_id' });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: 'conflict' });
  }
  console.error(err);
  return res.status(500).json({ error: 'internal_error' });
}

async function getOrgLocation(organizationId, locationId) {
  const result = await pool.query(
    `SELECT * FROM locations WHERE id = $1 AND organization_id = $2`,
    [locationId, organizationId]
  );
  return result.rows[0];
}

router.post('/', async (req, res) => {
  const {
    name, location_type, address_line1, address_line2,
    city, postcode, latitude, longitude, radius_metres,
  } = req.body;

  if (!name || !location_type || !address_line1 || !city || !postcode
      || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (!LOCATION_TYPES.includes(location_type)) {
    return res.status(400).json({ error: 'invalid_location_type' });
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'invalid_coordinates' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO locations
         (organization_id, name, location_type, address_line1, address_line2, city, postcode, latitude, longitude, radius_metres)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.user.organization_id, name, location_type, address_line1, address_line2 || null,
        city, postcode, lat, lng, radius_metres ?? 100,
      ]
    );
    res.status(201).json({ location: result.rows[0] });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM locations WHERE organization_id = $1 ORDER BY name`,
      [req.user.organization_id]
    );
    res.json({ locations: result.rows });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const location = await getOrgLocation(req.user.organization_id, req.params.id);
    if (!location) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ location });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.patch('/:id', async (req, res) => {
  if (req.body.location_type !== undefined && !LOCATION_TYPES.includes(req.body.location_type)) {
    return res.status(400).json({ error: 'invalid_location_type' });
  }

  const updates = [];
  const values = [];
  let i = 1;
  for (const field of UPDATABLE_FIELDS) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${i}`);
      values.push(req.body[field]);
      i++;
    }
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: 'no_fields_to_update' });
  }

  values.push(req.params.id, req.user.organization_id);

  try {
    const result = await pool.query(
      `UPDATE locations SET ${updates.join(', ')}
       WHERE id = $${i} AND organization_id = $${i + 1}
       RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ location: result.rows[0] });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE locations SET is_active = false
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [req.params.id, req.user.organization_id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ location: result.rows[0] });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.post('/:id/credentials', async (req, res) => {
  const { type } = req.body;
  if (!CREDENTIAL_TYPES.includes(type)) {
    return res.status(400).json({ error: 'invalid_type' });
  }

  try {
    const location = await getOrgLocation(req.user.organization_id, req.params.id);
    if (!location) {
      return res.status(404).json({ error: 'not_found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE credentials SET is_active = false WHERE location_id = $1 AND is_active = true`,
        [location.id]
      );
      const token = crypto.randomBytes(32).toString('base64url');
      const result = await client.query(
        `INSERT INTO credentials (location_id, type, token, is_active)
         VALUES ($1, $2, $3, true)
         RETURNING id, location_id, type, token, is_active, rotated_at, created_at`,
        [location.id, type, token]
      );
      await client.query('COMMIT');
      res.status(201).json({ credential: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    handleDbError(err, res);
  }
});

router.get('/:id/credentials/active', async (req, res) => {
  try {
    const location = await getOrgLocation(req.user.organization_id, req.params.id);
    if (!location) {
      return res.status(404).json({ error: 'not_found' });
    }

    const result = await pool.query(
      `SELECT id, location_id, type, token, is_active, rotated_at, created_at
       FROM credentials WHERE location_id = $1 AND is_active = true`,
      [location.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'no_active_credential' });
    }
    res.json({ credential: result.rows[0] });
  } catch (err) {
    handleDbError(err, res);
  }
});

module.exports = router;
