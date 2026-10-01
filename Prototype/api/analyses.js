import { getDb } from "./_db.js";
import { requireUser } from "./_auth.js";

let collectionPromise;

function compactPoints(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((point) => {
      const text = String(point || "")
        .replace(/\s+/g, " ")
        .trim();
      const sentence = text.match(/^(.+?[.!?])(?:\s+|$)/)?.[1] || text;
      const words = sentence.split(" ").filter(Boolean);
      if (words.length > 16) return `${words.slice(0, 16).join(" ")}...`;
      return sentence && /[.!?]$/.test(sentence)
        ? sentence
        : sentence
          ? `${sentence}.`
          : "";
    })
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeAiFeature(value) {
  if (Array.isArray(value)) return { points: compactPoints(value) };
  if (!value || typeof value !== "object") return { points: [] };
  return {
    points: compactPoints(value.points),
    ...(value.full !== undefined ? { full: value.full } : {}),
  };
}

function getLegacyPoints(type, value) {
  if (Array.isArray(value?.points)) return compactPoints(value.points);
  if (type === "summary") {
    return compactPoints([
      value?.overallAssessment,
      value?.priorityFocus,
      value?.areasToImprove?.[0] || value?.strengths?.[0],
    ]);
  }
  if (type === "recommendations") {
    const recommendations = Array.isArray(value) ? value : [];
    return compactPoints(
      recommendations.map((item) => {
        const title = String(item?.title || "")
          .trim()
          .replace(/[.!?]+$/, "");
        const recommendation = String(item?.recommendation || "").trim();
        return title && recommendation
          ? `${title}: ${recommendation}`
          : recommendation || title;
      }),
    );
  }
  const plan = value?.plan || value || {};
  const firstStep = plan.suggestedApproach?.[0];
  return compactPoints([
    plan.goalSummary,
    plan.feasibilityAssessment,
    firstStep?.detail || firstStep?.step,
    plan.progressAdvice,
  ]);
}

async function migrateLegacyAiProfile(collection, userId) {
  const profiles = (await getDb()).collection("userProfiles");
  const legacy = await profiles.findOne({ userId });
  if (!legacy) return;

  const generatedAt = new Date(
    legacy.aiGeneratedAt || legacy.updatedAt || Date.now(),
  );
  const month = Number.isNaN(generatedAt.getTime())
    ? new Date().toISOString().slice(0, 7)
    : `${generatedAt.getFullYear()}-${String(generatedAt.getMonth() + 1).padStart(2, "0")}`;
  const existing = await collection.findOne(
    { userId, month },
    { projection: { ai: 1 } },
  );
  const update = { userId, month, updatedAt: new Date() };
  for (const [field, legacyField] of [
    ["summary", "aiSummary"],
    ["recommendations", "aiRecommendations"],
    ["goalPlan", "aiGoalPlan"],
  ]) {
    const legacyValue = legacy[legacyField];
    const points = getLegacyPoints(field, legacyValue);
    const existingFeature = existing?.ai?.[field];
    const existingPoints = Array.isArray(existingFeature)
      ? existingFeature
      : existingFeature?.points;
    if (points.length && !existingPoints?.length) {
      const hasFullPayload =
        Array.isArray(legacyValue) ||
        (legacyValue &&
          typeof legacyValue === "object" &&
          !Array.isArray(legacyValue.points));
      update[`ai.${field}`] = {
        points,
        ...(hasFullPayload ? { full: legacyValue } : {}),
      };
    }
  }
  if (Object.keys(update).length > 3) {
    await collection.updateOne(
      { userId, month },
      { $set: update },
      { upsert: true },
    );
  }
  await profiles.updateOne(
    { userId },
    {
      $unset: {
        aiSummary: "",
        aiRecommendations: "",
        aiGoalPlan: "",
        aiGeneratedAt: "",
      },
    },
  );
}

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
      await migrateLegacyAiProfile(collection, user.email);
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
        updatedAt: new Date(),
      };
      for (const field of [
        "assessment",
        "spending",
        "budgets",
        "goals",
        "pdfs",
      ]) {
        if (body[field] !== undefined) snapshot[field] = body[field];
      }
      if (body.ai && typeof body.ai === "object") {
        for (const field of ["summary", "recommendations", "goalPlan"]) {
          if (body.ai[field] !== undefined) {
            snapshot[`ai.${field}`] = normalizeAiFeature(body.ai[field]);
          }
        }
      }
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
