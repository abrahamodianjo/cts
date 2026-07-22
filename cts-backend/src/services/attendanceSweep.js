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

  // Reconcile shift status across every non-terminal shift in scope, not just the
  // ones this run touched — catches any shift left stranded by a rollup that ran
  // before this reconciliation existed, in addition to the ones just swept.
  const rollupParams = [TERMINAL_VISIT_STATUSES];
  let rollupQuery = `
    UPDATE shifts s
    SET status = 'completed'
    WHERE s.status NOT IN ('completed', 'cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM shift_visits sv2
        WHERE sv2.shift_id = s.id
          AND sv2.status != ALL($1::text[])
      )
      AND EXISTS (SELECT 1 FROM shift_visits sv3 WHERE sv3.shift_id = s.id)`;
  if (organizationId) {
    rollupParams.push(organizationId);
    rollupQuery += ` AND s.organization_id = $${rollupParams.length}`;
  }
  await pool.query(rollupQuery, rollupParams);

  return sweptVisits;
}

module.exports = { sweepMissedClockOuts, MISSED_CLOCK_OUT_HOURS };
