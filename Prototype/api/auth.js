import bcrypt from "bcryptjs";
import { getDb } from "./_db.js";
import { createToken } from "./_auth.js";

// In-memory user fallback when MongoDB is unavailable
const memoryUsers = new Map([
  [
    "demo@finora.app",
    {
      _id: "mem_demo_1",
      email: "demo@finora.app",
      username: "demo_user",
      passwordHash: bcrypt.hashSync("password123", 8),
    },
  ],
]);

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      action,
      username: rawUsername,
      email: rawEmail,
      password,
    } = req.body || {};
    const username = normalizeUsername(rawUsername);
    const email = normalizeEmail(rawEmail);
    if (typeof password !== "string" || password.length < 4) {
      return res
        .status(400)
        .json({ error: "Password must be at least 4 characters" });
    }

    let usersCollection = null;
    try {
      usersCollection = (await getDb()).collection("users");
      await usersCollection.createIndex({ email: 1 }, { unique: true });
      await usersCollection.createIndex(
        { username: 1 },
        { unique: true, sparse: true },
      );
    } catch {
      usersCollection = null;
    }

    if (action === "register") {
      const effectiveUsername = username || email.split("@")[0] || "user";
      if (!email.includes("@")) {
        return res.status(400).json({ error: "Enter a valid email address" });
      }

      if (usersCollection) {
        const existing = await usersCollection.findOne({
          $or: [{ email }, { username: effectiveUsername }],
        });
        if (existing) {
          return res
            .status(409)
            .json({ error: "That username or email is already registered" });
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const result = await usersCollection.insertOne({
          email,
          username: effectiveUsername,
          passwordHash,
          createdAt: new Date(),
        });
        const user = {
          _id: result.insertedId,
          email,
          username: effectiveUsername,
        };
        return res
          .status(201)
          .json({ token: createToken(user), email, username: effectiveUsername });
      }

      // Memory fallback
      const existingMem = Array.from(memoryUsers.values()).find(
        (u) => u.email === email || u.username === effectiveUsername,
      );
      if (existingMem) {
        return res
          .status(409)
          .json({ error: "That username or email is already registered" });
      }
      const passwordHash = await bcrypt.hash(password, 8);
      const newUser = {
        _id: "mem_" + Date.now(),
        email,
        username: effectiveUsername,
        passwordHash,
      };
      memoryUsers.set(email, newUser);
      return res
        .status(201)
        .json({ token: createToken(newUser), email, username: effectiveUsername });
    }

    if (action === "login") {
      const identifier = normalizeUsername(rawUsername || rawEmail);
      const emailIdentifier = normalizeEmail(rawUsername || rawEmail);
      if (!identifier) {
        return res.status(400).json({ error: "Enter your username or email" });
      }

      let user = null;
      if (usersCollection) {
        try {
          user = await usersCollection.findOne({
            $or: [{ username: identifier }, { email: emailIdentifier }],
          });
        } catch {
          user = null;
        }
      }

      if (!user) {
        user = Array.from(memoryUsers.values()).find(
          (u) =>
            u.username.toLowerCase() === identifier ||
            u.email.toLowerCase() === emailIdentifier,
        );
      }

      if (!user) {
        return res
          .status(404)
          .json({ error: "No account found. Please create an account first." });
      }

      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        return res
          .status(401)
          .json({ error: "Incorrect password. Please try again." });
      }

      return res.status(200).json({
        token: createToken(user),
        email: user.email,
        username: user.username || user.email,
      });
    }

    return res.status(400).json({ error: "Unsupported authentication action" });
  } catch (error) {
    console.error("Authentication API error:", error);
    return res
      .status(500)
      .json({ error: "Authentication service error. Please try again." });
  }
}

