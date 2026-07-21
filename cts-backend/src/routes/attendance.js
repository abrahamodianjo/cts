const express = require('express');

const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { haversineDistanceMetres } = require('../utils/geo');
const { sweepMissedClockOuts } = require('../services/attendanceSweep');

const router = express.Router();

router.use(requireAuth);

const EVENT_TYPES = ['clock_in', 'clock_out'];
const WINDOW_MINUTES = 30;

router.post('/scan', async (req, res) => {
  const { token, latitude, longitude, event_type, device_info } = req.body;

  if (!token || latitude === undefined || longitude === undefined || !event_type) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (!EVENT_TYPES.includes(event_type)) {
    return res.status(400).json({ error: 'invalid_event_type' });
  }
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'invalid_coordinates' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const credResult = await client.query(
      `SELECT c.id AS credential_id, c.type AS credential_type, c.location_id,
              l.organization_id, l.radius_metres, l.latitude AS loc_lat, l.longitude AS loc_lng,
              l.is_active AS location_active
       FROM credentials c
       JOIN locations l ON l.id = c.location_id
       WHERE c.token = $1 AND c.is_active = true`,
      [token]
    );
    const cred = credResult.rows[0];
    if (!cred || !cred.location_active || cred.organization_id !== req.user.organization_id) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'invalid_credential' });
    }

    let visit;
    let lateClockOut = false;

    if (event_type === 'clock_in') {
      const windowQuery = `
        SELECT sv.id, sv.shift_id, sv.status, sv.planned_start, sv.planned_end, s.status AS shift_status
        FROM shift_visits sv
        JOIN shifts s ON s.id = sv.shift_id
        WHERE s.staff_id = $1
          AND sv.location_id = $2
          AND now() BETWEEN (sv.planned_start - ($3 || ' minutes')::interval)
                         AND (sv.planned_end + ($3 || ' minutes')::interval)`;

      const matchResult = await client.query(
        `${windowQuery} AND sv.status = 'planned' ORDER BY sv.planned_start LIMIT 1`,
        [req.user.sub, cred.location_id, WINDOW_MINUTES]
      );
      visit = matchResult.rows[0];

      if (!visit) {
        const anyResult = await client.query(
          `${windowQuery} ORDER BY sv.planned_start LIMIT 1`,
          [req.user.sub, cred.location_id, WINDOW_MINUTES]
        );
        const candidate = anyResult.rows[0];
        await client.query('ROLLBACK');
        if (!candidate) {
          return res.status(404).json({ error: 'no_shift_visit_in_window' });
        }
        return res.status(409).json({ error: 'visit_not_awaiting_clock_in', visit_status: candidate.status });
      }
    } else {
      // clock_out has no time-window limit: a visit the staff already clocked into
      // can be closed out whenever, but is flagged if it runs well past planned_end.
      const matchResult = await client.query(
        `SELECT sv.id, sv.shift_id, sv.status, sv.planned_start, sv.planned_end, s.status AS shift_status
         FROM shift_visits sv
         JOIN shifts s ON s.id = sv.shift_id
         WHERE s.staff_id = $1
           AND sv.location_id = $2
           AND sv.status = 'in_progress'
         ORDER BY sv.planned_start
         LIMIT 1`,
        [req.user.sub, cred.location_id]
      );
      visit = matchResult.rows[0];

      if (!visit) {
        const candidateResult = await client.query(
          `SELECT sv.status
           FROM shift_visits sv
           JOIN shifts s ON s.id = sv.shift_id
           WHERE s.staff_id = $1 AND sv.location_id = $2
           ORDER BY sv.planned_start DESC
           LIMIT 1`,
          [req.user.sub, cred.location_id]
        );
        const candidate = candidateResult.rows[0];
        await client.query('ROLLBACK');
        if (!candidate) {
          return res.status(404).json({ error: 'no_shift_visit_found' });
        }
        return res.status(409).json({ error: 'visit_not_in_progress', visit_status: candidate.status });
      }

      lateClockOut = Date.now() - new Date(visit.planned_end).getTime() > WINDOW_MINUTES * 60 * 1000;
    }

    const distance = haversineDistanceMetres(lat, lng, cred.loc_lat, cred.loc_lng);
    const flagReasons = [];
    if (distance > cred.radius_metres) flagReasons.push('gps_outside_radius');
    if (lateClockOut) flagReasons.push('late_clock_out');
    const flagged = flagReasons.length > 0;
    const flagReason = flagged ? flagReasons.join(',') : null;

    const eventResult = await client.query(
      `INSERT INTO attendance_events
         (shift_visit_id, staff_id, location_id, credential_id, event_type,
          gps_latitude, gps_longitude, distance_metres, method, flagged, flag_reason, device_info)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        visit.id, req.user.sub, cred.location_id, cred.credential_id, event_type,
        lat, lng, distance, cred.credential_type, flagged, flagReason, device_info || null,
      ]
    );

    const newVisitStatus = event_type === 'clock_in' ? 'in_progress' : 'completed';
    await client.query(`UPDATE shift_visits SET status = $1 WHERE id = $2`, [newVisitStatus, visit.id]);

    let newShiftStatus = visit.shift_status;
    if (event_type === 'clock_in' && visit.shift_status === 'scheduled') {
      newShiftStatus = 'in_progress';
    }
    if (event_type === 'clock_out') {
      const remaining = await client.query(
        `SELECT count(*)::int AS remaining FROM shift_visits
         WHERE shift_id = $1 AND status NOT IN ('completed', 'missed')`,
        [visit.shift_id]
      );
      if (remaining.rows[0].remaining === 0) {
        newShiftStatus = 'completed';
      }
    }
    if (newShiftStatus !== visit.shift_status) {
      await client.query(`UPDATE shifts SET status = $1 WHERE id = $2`, [newShiftStatus, visit.shift_id]);
    }

    await client.query('COMMIT');

    const shiftVisitResult = await pool.query(`SELECT * FROM shift_visits WHERE id = $1`, [visit.id]);
    const shiftResult = await pool.query(`SELECT * FROM shifts WHERE id = $1`, [visit.shift_id]);

    res.status(201).json({
      attendance_event: eventResult.rows[0],
      shift_visit: shiftVisitResult.rows[0],
      shift: shiftResult.rows[0],
      flagged,
      distance_metres: distance,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
});

router.post('/sweep-missed-clock-outs', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const swept = await sweepMissedClockOuts(req.user.organization_id);
    res.json({ swept_count: swept.length, shift_visits: swept });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/missed-clock-outs', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sv.*, s.staff_id
       FROM shift_visits sv
       JOIN shifts s ON s.id = sv.shift_id
       WHERE s.organization_id = $1 AND sv.status = 'missed_clock_out'
       ORDER BY sv.planned_end`,
      [req.user.organization_id]
    );
    res.json({ shift_visits: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
