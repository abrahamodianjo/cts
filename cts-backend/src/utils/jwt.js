const jwt = require('jsonwebtoken');

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      organization_id: user.organization_id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

module.exports = { signAccessToken };
