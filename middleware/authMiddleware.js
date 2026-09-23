const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers['authorization'];

  // Check if header is present and formatted as 'Bearer <token>'
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. No token provided.' 
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify token using secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Contains { id, role, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        code: 'TOKEN_EXPIRED',
        message: 'Your session has expired. Please log in again.' 
      });
    }
    return res.status(403).json({ 
      success: false, 
      code: 'TOKEN_INVALID',
      message: 'Invalid or expired token.' 
    });
  }
};

module.exports = verifyToken;
