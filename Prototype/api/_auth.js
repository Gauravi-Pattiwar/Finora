import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "finora-prototype-jwt-secret-key-2026";

export function getToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

export function getUserFromRequest(req) {
  const token = getToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function requireUser(req, res) {
  const user = getUserFromRequest(req);
  if (!user?.email) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return user;
}

export function createToken(user) {
  return jwt.sign(
    {
      sub: String(user._id || user.email || "user"),
      email: user.email,
      username: user.username || user.email,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

