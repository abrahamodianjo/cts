const { pool } = require('../db');
const { TERMINAL_VISIT_STATUSES } = require('../utils/visitStatus');

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
  const sweptVisits = result.rows;

  const shiftIds = [...new Set(sweptVisits.map((v) => v.shift_id))];
  if (shiftIds.length > 0) {
    await pool.query(
      `UPDATE shifts s
       SET status = 'completed'
       WHERE s.id = ANY($1::uuid[])
         AND s.status NOT IN ('completed', 'cancelled')
         AND NOT EXISTS (
           SELECT 1 FROM shift_visits sv2
           WHERE sv2.shift_id = s.id
             AND sv2.status != ALL($2::text[])
         )`,
      [shiftIds, TERMINAL_VISIT_STATUSES]
    );
  }

  return sweptVisits;
}

module.exports = { sweepMissedClockOuts, MISSED_CLOCK_OUT_HOURS };
