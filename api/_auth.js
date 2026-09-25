import jwt from "jsonwebtoken";

export function getToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

export function getUserFromRequest(req) {
  const token = getToken(req);
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
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
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }
  return jwt.sign(
    { sub: user._id.toString(), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}
