const jwt = require("jsonwebtoken");
const config = require("./config");

function findUser(username) {
  return config.users.find((user) => user.username === String(username || "").toLowerCase());
}

function authenticateUser(username, password) {
  const user = findUser(username);
  if (!user || user.password !== password) {
    return null;
  }

  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}

function signToken(user) {
  return jwt.sign(
    {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
    config.jwtSecret,
    { expiresIn: "12h" }
  );
}

function requireAuth(roles = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    try {
      const user = jwt.verify(token, config.jwtSecret);
      req.user = user;

      if (roles.length > 0 && !roles.includes(user.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      return next();
    } catch (_error) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

module.exports = {
  authenticateUser,
  signToken,
  requireAuth,
};
