require('dotenv').config();
const express = require('express');

const { pool } = require('./db');
const authRouter = require('./routes/auth');
const locationsRouter = require('./routes/locations');

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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`cts-backend listening on port ${port}`);
});
