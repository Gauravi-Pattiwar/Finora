import bcrypt from "bcryptjs";
import { getDb } from "./_db.js";
import { createToken } from "./_auth.js";

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { action, email: rawEmail, password } = req.body || {};
    const email = normalizeEmail(rawEmail);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    const users = (await getDb()).collection("users");
    await users.createIndex({ email: 1 }, { unique: true });

    if (action === "register") {
      const existing = await users.findOne({ email });
      if (existing)
        return res
          .status(409)
          .json({ error: "An account already exists for this email" });
      const passwordHash = await bcrypt.hash(password, 12);
      const result = await users.insertOne({
        email,
        passwordHash,
        createdAt: new Date(),
      });
      const user = { _id: result.insertedId, email };
      return res.status(201).json({ token: createToken(user), email });
    }

    if (action === "login") {
      const user = await users.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res
          .status(401)
          .json({ error: "Email or password is incorrect" });
      }
      return res.status(200).json({ token: createToken(user), email });
    }

    return res.status(400).json({ error: "Unsupported authentication action" });
  } catch (error) {
    console.error("Authentication API error:", error);
    return res
      .status(500)
      .json({ error: "Authentication service unavailable" });
  }
}
