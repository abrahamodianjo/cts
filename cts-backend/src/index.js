require('dotenv').config();
const express = require('express');

const { pool } = require('./db');
const authRouter = require('./routes/auth');
const locationsRouter = require('./routes/locations');
const shiftsRouter = require('./routes/shifts');
const attendanceRouter = require('./routes/attendance');
const statusRouter = require('./routes/status');
const { sweepMissedClockOuts } = require('./services/attendanceSweep');

const app = express();
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

app.use('/auth', authRouter);
app.use('/locations', locationsRouter);
app.use('/shifts', shiftsRouter);
app.use('/attendance', attendanceRouter);
app.use('/status', statusRouter);

const MISSED_CLOCK_OUT_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
setInterval(() => {
  sweepMissedClockOuts()
    .then((swept) => {
      if (swept.length > 0) {
        console.log(`missed-clock-out sweep: marked ${swept.length} visit(s)`);
      }
    })
    .catch((err) => console.error('missed-clock-out sweep failed', err));
}, MISSED_CLOCK_OUT_SWEEP_INTERVAL_MS);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`cts-backend listening on port ${port}`);
});
