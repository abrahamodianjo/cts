const express = require('express');

const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

router.use(requireAuth, requireRole(['admin', 'manager']));

function handleDbError(err, res) {
  if (err.code === '22P02') {
    return res.status(400).json({ error: 'invalid_id' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'invalid_reference' });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: 'duplicate_visit_order' });
  }
  console.error(err);
  return res.status(500).json({ error: 'internal_error' });
}

async function getOrgShift(organizationId, shiftId) {
  const result = await pool.query(
    `SELECT * FROM shifts WHERE id = $1 AND organization_id = $2`,
    [shiftId, organizationId]
  );
  return result.rows[0];
}

router.post('/', async (req, res) => {
  const { staff_id, scheduled_start, scheduled_end, notes } = req.body;
  if (!staff_id || !scheduled_start || !scheduled_end) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  try {
    const staffCheck = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND organization_id = $2`,
      [staff_id, req.user.organization_id]
    );
    if (staffCheck.rows.length === 0) {
      return res.status(400).json({ error: 'invalid_staff_id' });
    }

    const result = await pool.query(
      `INSERT INTO shifts (organization_id, staff_id, scheduled_start, scheduled_end, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.organization_id, staff_id, scheduled_start, scheduled_end, notes || null, req.user.sub]
    );
    res.status(201).json({ shift: result.rows[0] });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.get('/', async (req, res) => {
  try {
    const { staff_id } = req.query;
    const params = [req.user.organization_id];
    let query = `SELECT * FROM shifts WHERE organization_id = $1`;
    if (staff_id) {
      params.push(staff_id);
      query += ` AND staff_id = $${params.length}`;
    }
    query += ` ORDER BY scheduled_start`;
    const result = await pool.query(query, params);
    res.json({ shifts: result.rows });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const shift = await getOrgShift(req.user.organization_id, req.params.id);
    if (!shift) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ shift });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.post('/:id/visits', async (req, res) => {
  const { location_id, visit_order, planned_start, planned_end } = req.body;
  if (!location_id || !planned_start || !planned_end) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  try {
    const shift = await getOrgShift(req.user.organization_id, req.params.id);
    if (!shift) {
      return res.status(404).json({ error: 'not_found' });
    }

    const locationCheck = await pool.query(
      `SELECT id FROM locations WHERE id = $1 AND organization_id = $2`,
      [location_id, req.user.organization_id]
    );
    if (locationCheck.rows.length === 0) {
      return res.status(400).json({ error: 'invalid_location_id' });
    }

    let order = visit_order;
    if (order === undefined) {
      const maxResult = await pool.query(
        `SELECT COALESCE(MAX(visit_order), 0) AS max FROM shift_visits WHERE shift_id = $1`,
        [shift.id]
      );
      order = maxResult.rows[0].max + 1;
    }

    const result = await pool.query(
      `INSERT INTO shift_visits (shift_id, location_id, visit_order, planned_start, planned_end)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [shift.id, location_id, order, planned_start, planned_end]
    );
    res.status(201).json({ shift_visit: result.rows[0] });
  } catch (err) {
    handleDbError(err, res);
  }
});

router.get('/:id/visits', async (req, res) => {
  try {
    const shift = await getOrgShift(req.user.organization_id, req.params.id);
    if (!shift) {
      return res.status(404).json({ error: 'not_found' });
    }
    const result = await pool.query(
      `SELECT * FROM shift_visits WHERE shift_id = $1 ORDER BY visit_order`,
      [shift.id]
    );
    res.json({ shift_visits: result.rows });
  } catch (err) {
    handleDbError(err, res);
  }
});

module.exports = router;
