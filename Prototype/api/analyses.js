import { getDb } from "./_db.js";
import { requireUser } from "./_auth.js";

let collectionPromise;

async function getCollection() {
  if (!collectionPromise) {
    collectionPromise = (async () => {
      const collection = (await getDb()).collection("monthlyAnalyses");
      await collection.createIndex({ userId: 1, month: 1 }, { unique: true });
      return collection;
    })();
  }
  return collectionPromise;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const user = requireUser(req, res);
    if (!user) return;
    const collection = await getCollection();

    if (req.method === "GET") {
      const analyses = await collection
        .find({ userId: user.email })
        .sort({ month: -1 })
        .limit(120)
        .toArray();
      return res.status(200).json(analyses);
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const month = String(body.month || "").trim();
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: "A YYYY-MM month is required" });
      }

      const snapshot = {
        userId: user.email,
        month,
        assessment: body.assessment || null,
        spending: body.spending || null,
        budgets: body.budgets || {},
        goals: body.goals || [],
        pdfs: body.pdfs || {},
        updatedAt: new Date(),
      };
      await collection.updateOne(
        { userId: user.email, month },
        { $set: snapshot },
        { upsert: true },
      );
      return res.status(200).json({ ok: true, month });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Monthly analyses API error:", error);
    return res.status(500).json({ error: "Unable to access monthly analyses" });
  }
}
