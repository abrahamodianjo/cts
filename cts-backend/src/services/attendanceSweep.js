const { pool } = require('../db');

const MISSED_CLOCK_OUT_HOURS = 12;

async function sweepMissedClockOuts(organizationId) {
  const params = [MISSED_CLOCK_OUT_HOURS];
  let query = `
    UPDATE shift_visits sv
    SET status = 'missed_clock_out'
    FROM shifts s
    WHERE sv.shift_id = s.id
      AND sv.status = 'in_progress'
      AND sv.planned_end < now() - ($1 || ' hours')::interval`;
  if (organizationId) {
    params.push(organizationId);
    query += ` AND s.organization_id = $${params.length}`;
  }
  query += ` RETURNING sv.*`;

  const result = await pool.query(query, params);
  return result.rows;
}

module.exports = { sweepMissedClockOuts, MISSED_CLOCK_OUT_HOURS };
