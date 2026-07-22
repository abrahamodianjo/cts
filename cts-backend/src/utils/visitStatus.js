// Visit statuses from which a visit will never move again. A shift can roll up
// to 'completed' once every visit is in one of these — missed_clock_out included,
// since correcting it happens via attendance_corrections, not by reopening the visit.
const TERMINAL_VISIT_STATUSES = ['completed', 'missed', 'missed_clock_out'];

module.exports = { TERMINAL_VISIT_STATUSES };
