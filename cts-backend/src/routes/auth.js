const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');

const { pool } = require('../db');
const { signAccessToken } = require('../utils/jwt');

const router = express.Router();

const VALID_ROLES = ['admin', 'manager', 'staff'];

router.post('/register', async (req, res) => {
  const { organization_id, email, password, first_name, last_name, role, phone } = req.body;

  if (!organization_id || !email || !password || !first_name || !last_name || !role) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'invalid_role' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, organization_id, email, first_name, last_name, role, created_at`,
      [organization_id, email.toLowerCase(), password_hash, first_name, last_name, role, phone || null]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'email_already_registered' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'invalid_organization_id' });
    }
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  try {
    const result = await pool.query(
      `SELECT id, organization_id, email, password_hash, first_name, last_name, role, is_active
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );
    const user = result.rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const accessToken = signAccessToken(user);

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresInDays = Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS || 30);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
      [user.id, refreshTokenHash, expiresInDays]
    );

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        organization_id: user.organization_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
