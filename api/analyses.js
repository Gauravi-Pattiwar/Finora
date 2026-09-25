import { MongoClient } from "mongodb";

let clientPromise;
let collectionPromise;

function getClient() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }
  if (!clientPromise) {
    clientPromise = new MongoClient(process.env.MONGODB_URI).connect();
  }
  return clientPromise;
}

async function getCollection() {
  if (!collectionPromise) {
    collectionPromise = (async () => {
      const client = await getClient();
      const collection = client
        .db(process.env.MONGODB_DB || "finora")
        .collection("monthlyAnalyses");
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
    const collection = await getCollection();

    if (req.method === "GET") {
      const userId = String(req.query.userId || "").trim();
      if (!userId) return res.status(400).json({ error: "userId is required" });
      const analyses = await collection
        .find({ userId })
        .sort({ month: -1 })
        .limit(120)
        .toArray();
      return res.status(200).json(analyses);
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const userId = String(body.userId || "").trim();
      const month = String(body.month || "").trim();
      if (!userId || !/^\d{4}-\d{2}$/.test(month)) {
        return res
          .status(400)
          .json({ error: "userId and a YYYY-MM month are required" });
      }

      const snapshot = {
        userId,
        month,
        assessment: body.assessment || null,
        spending: body.spending || null,
        budgets: body.budgets || {},
        goals: body.goals || [],
        pdfs: body.pdfs || {},
        updatedAt: new Date(),
      };
      await collection.updateOne(
        { userId, month },
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
