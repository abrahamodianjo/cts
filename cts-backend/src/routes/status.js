const express = require('express');

const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

router.use(requireAuth);

const STATUS_VALUES = ['available', 'with_client', 'on_break', 'traveling', 'off_shift'];

router.post('/', async (req, res) => {
  const { status, shift_id } = req.body;
  if (!STATUS_VALUES.includes(status)) {
    return res.status(400).json({ error: 'invalid_status' });
  }

  try {
    let resolvedShiftId = null;
    if (shift_id) {
      const shiftCheck = await pool.query(
        `SELECT id FROM shifts WHERE id = $1 AND staff_id = $2 AND organization_id = $3`,
        [shift_id, req.user.sub, req.user.organization_id]
      );
      if (shiftCheck.rows.length === 0) {
        return res.status(400).json({ error: 'invalid_shift_id' });
      }
      resolvedShiftId = shift_id;
    } else {
      const activeShift = await pool.query(
        `SELECT id FROM shifts WHERE staff_id = $1 AND status = 'in_progress' ORDER BY scheduled_start DESC LIMIT 1`,
        [req.user.sub]
      );
      resolvedShiftId = activeShift.rows[0]?.id || null;
    }

    const result = await pool.query(
      `INSERT INTO status_log (staff_id, shift_id, status) VALUES ($1, $2, $3) RETURNING *`,
      [req.user.sub, resolvedShiftId, status]
    );
    res.status(201).json({ status_log: result.rows[0] });
  } catch (err) {
    if (err.code === '22P02') {
      return res.status(400).json({ error: 'invalid_id' });
    }
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/live', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (s.staff_id)
         u.id AS staff_id, u.first_name, u.last_name, u.email,
         s.id AS shift_id, s.status AS shift_status, s.scheduled_start, s.scheduled_end,
         sl.status AS current_status, sl.changed_at AS status_changed_at
       FROM shifts s
       JOIN users u ON u.id = s.staff_id
       LEFT JOIN LATERAL (
         SELECT status, changed_at FROM status_log
         WHERE staff_id = s.staff_id
         ORDER BY changed_at DESC
         LIMIT 1
       ) sl ON true
       WHERE s.organization_id = $1 AND s.status = 'in_progress'
       ORDER BY s.staff_id, s.scheduled_start DESC`,
      [req.user.organization_id]
    );
    res.json({ staff: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
