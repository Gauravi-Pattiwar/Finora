import { getDb } from "./_db.js";
import { requireUser } from "./_auth.js";

let collectionPromise;

function compactPoint(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 5)
    .join(" ");
}

function compactPoints(values) {
  return values.map(compactPoint).filter(Boolean).slice(0, 3);
}

function compactSummary(summary) {
  return {
    points: compactPoints(
      summary?.points || [
        summary?.priorityFocus,
        summary?.strengths?.[0],
        summary?.areasToImprove?.[0],
        summary?.overallAssessment,
      ],
    ),
  };
}

function compactRecommendations(recommendations) {
  const items = Array.isArray(recommendations)
    ? recommendations
    : recommendations?.points || [];
  return {
    points: compactPoints(
      items.map((item) =>
        typeof item === "string"
          ? item
          : [item?.title, item?.recommendation].filter(Boolean).join(" "),
      ),
    ),
  };
}

function compactGoalPlan(goalPlan) {
  const plan = goalPlan?.plan || goalPlan || {};
  const approach = plan.suggestedApproach?.[0];
  return {
    points: compactPoints(
      plan.points || [
        plan.goalSummary,
        plan.feasibilityAssessment,
        approach && [approach.step, approach.detail].filter(Boolean).join(" "),
        plan.progressAdvice,
      ],
    ),
  };
}

function compactProfile(profile) {
  const compacted = {};
  if (profile.aiSummary)
    compacted.aiSummary = compactSummary(profile.aiSummary);
  if (profile.aiRecommendations) {
    compacted.aiRecommendations = compactRecommendations(
      profile.aiRecommendations,
    );
  }
  if (profile.aiGoalPlan)
    compacted.aiGoalPlan = compactGoalPlan(profile.aiGoalPlan);
  return compacted;
}

async function getCollection() {
  if (!collectionPromise) {
    collectionPromise = (async () => {
      const db = await getDb();
      const collection = db.collection("userProfiles");
      await collection.createIndex({ userId: 1 }, { unique: true });
      return collection;
    })();
  }
  return collectionPromise;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const user = requireUser(req, res);
    if (!user) return;
    const collection = await getCollection();

    // GET — return the stored AI cache for this user
    if (req.method === "GET") {
      const profile = await collection.findOne(
        { userId: user.email },
        { projection: { _id: 0, userId: 0 } },
      );
      const savedProfile = profile || {};
      const compacted = compactProfile(savedProfile);
      const fieldsToUpdate = Object.fromEntries(
        Object.entries(compacted).filter(
          ([key, value]) =>
            JSON.stringify(savedProfile[key]) !== JSON.stringify(value),
        ),
      );
      if (Object.keys(fieldsToUpdate).length) {
        await collection.updateOne(
          { userId: user.email },
          { $set: fieldsToUpdate },
        );
      }
      return res.status(200).json({ ...savedProfile, ...compacted });
    }

    // POST — upsert the AI cache fields (only update fields that are sent)
    if (req.method === "POST") {
      const body = req.body || {};
      const update = { updatedAt: new Date() };

      if (body.aiSummary !== undefined)
        update.aiSummary = compactSummary(body.aiSummary);
      if (body.aiRecommendations !== undefined) {
        update.aiRecommendations = compactRecommendations(
          body.aiRecommendations,
        );
      }
      if (body.aiGoalPlan !== undefined)
        update.aiGoalPlan = compactGoalPlan(body.aiGoalPlan);
      if (body.aiGeneratedAt !== undefined)
        update.aiGeneratedAt = body.aiGeneratedAt;

      await collection.updateOne(
        { userId: user.email },
        { $set: update },
        { upsert: true },
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Profile API error:", error);
    return res.status(500).json({ error: "Unable to access profile data" });
  }
}
