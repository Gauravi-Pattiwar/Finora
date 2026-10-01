import "dotenv/config";

// Single configurable Gemini Model name with fallback cascade
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const FALLBACK_MODELS = [
  ...new Set([
    DEFAULT_MODEL,
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.7-flash",
    "gemini-flash-lite-latest",
    "gemini-3.8-flash",
  ]),
];

const DISCLAIMER_TEXT =
  "This AI-generated information is for educational and informational purposes only. It does not constitute certified financial advice, investment guarantees, or recommendations to buy or sell financial products.";

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

/**
 * Strips markdown json code fences if present and parses JSON safely.
 */
function cleanAndParseJSON(rawText) {
  if (!rawText) return null;
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Attempt regex extraction of first json object or array
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {}
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch {}
    }
    throw new Error(
      "Failed to parse AI response into structured JSON: " + err.message,
    );
  }
}

/**
 * Calls the Google Gemini REST API with model fallback handling.
 */
async function callGemini(prompt, systemInstruction = "") {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured in the server environment (.env).",
    );
  }

  // De-duplicate model candidates
  const modelsToTry = [...new Set(FALLBACK_MODELS.filter(Boolean))];
  let lastError = null;

  for (const model of modelsToTry) {
    const cleanModelName = model.replace(/^models\//, "");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();

      if (!res.ok) {
        const errorMsg =
          data?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        // Retry on: model not found (404), service unavailable/high demand (503), or unsupported
        const shouldRetry =
          res.status === 404 ||
          res.status === 503 ||
          errorMsg.toLowerCase().includes("not found") ||
          errorMsg.toLowerCase().includes("unsupported") ||
          errorMsg.toLowerCase().includes("high demand") ||
          errorMsg.toLowerCase().includes("unavailable") ||
          errorMsg.toLowerCase().includes("no longer available");
        if (shouldRetry) {
          console.warn(
            `[Finora AI] Model "${cleanModelName}" not available (${errorMsg}). Trying fallback model...`,
          );
          lastError = new Error(errorMsg);
          continue;
        }
        throw new Error(errorMsg);
      }

      const candidateText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      if (!candidateText) {
        throw new Error("Received empty response from Gemini API.");
      }

      const parsed = cleanAndParseJSON(candidateText);
      return {
        modelUsed: cleanModelName,
        data: parsed,
      };
    } catch (err) {
      lastError = err;
      if (err.name === "AbortError") {
        throw new Error("Gemini API request timed out after 20 seconds.");
      }
      // If network/rate error or parse error, keep trying fallback if applicable
      console.warn(
        `[Finora AI] Attempt with model ${cleanModelName} failed:`,
        err.message,
      );
    }
  }

  throw (
    lastError ||
    new Error("Failed to communicate with Gemini API across all model options.")
  );
}

/* ==========================================================================
   FEATURE 1: AI FINANCIAL HEALTH SUMMARY
   ========================================================================== */
async function handleSummary(profile) {
  const systemInstruction = `You are Finora AI, an educational financial health advisor based on the research paper "Financial Health Advisory: A Survey of Digital, AI-Enabled and Personalized Approaches".
Your role is to provide holistic, empathetic, educational guidance based strictly on the user's provided financial data.
DO NOT provide guaranteed financial advice, stock trading tips, or speculative investment predictions.
Always return response in strict JSON matching this schema:
{
  "overallAssessment": "string (2-3 sentences summarizing cash flow, savings, debt, emergency readiness)",
  "strengths": ["string", "string", ...],
  "areasToImprove": ["string", "string", ...],
  "priorityFocus": "string (single most impactful next step)",
  "educationalNote": "string (short educational insight on holistic financial health)"
}`;

  const prompt = `Analyze the following holistic financial health profile:
- Monthly Income: ₹${profile.income || 0}
- Monthly Expenses: ₹${profile.expenses || 0}
- Monthly Savings: ₹${profile.savings || 0}
- Total Debt: ₹${profile.debt || 0}
- Monthly EMI: ₹${profile.emi || 0}
- Emergency Fund: ₹${profile.emergencyFund || 0} (covers ${(profile.monthsCovered || 0).toFixed(1)} months)
- Current Investments: ₹${profile.investments || 0}
- Risk Preference: ${profile.riskPreference || "Medium"}
- Overall Health Score: ${profile.overallScore || 0}/100
- Score Breakdown: Cash Flow: ${profile.cashFlow || 0}, Savings: ${profile.savingsScore || 0}, Debt: ${profile.debtScore || 0}, Emergency Fund: ${profile.efScore || 0}, Goal: ${profile.goalScore || 0}
- Savings Rate: ${Math.round((profile.savingsRate || 0) * 100)}%
- EMI-to-Income Ratio: ${Math.round((profile.emiRatio || 0) * 100)}%
- Expense-to-Income Ratio: ${Math.round((profile.expenseRatio || 0) * 100)}%
- Primary Goal: ${profile.goalType || "None"} (Target: ₹${profile.goalTarget || 0}, Current: ₹${profile.goalCurrent || 0}, Timeline: ${profile.goalTimeline || 0} months)
- Spending Breakdown: ${JSON.stringify(profile.spending || {})}

Generate a concise, realistic, and personalized Financial Health Summary based strictly on these numbers.`;

  const result = await callGemini(prompt, systemInstruction);
  return {
    ...result.data,
    modelUsed: result.modelUsed,
    disclaimer: DISCLAIMER_TEXT,
  };
}

/* ==========================================================================
   FEATURE 2 & 3: PERSONALIZED RECOMMENDATIONS + EXPLAINABLE AI
   ========================================================================== */
async function handleRecommendations(profile) {
  const systemInstruction = `You are Finora AI, an educational financial health advisory system.
Generate 3 to 5 highly personalized, explainable financial recommendations based strictly on the user's real calculations and numbers.
Keep Phase 1 rule-based foundations intact.

Return strict JSON matching this schema:
{
  "recommendations": [
    {
      "id": "string (e.g. rec-1)",
      "title": "string (clear action title)",
      "priority": "High" | "Medium" | "Low",
      "tone": "emerald" | "amber" | "red",
      "icon": "piggy-bank" | "shield" | "trending-up" | "credit-card" | "wallet" | "target",
      "recommendation": "string (actionable educational suggestion)",
      "whyItMatters": "string (clear reason why this is important for holistic financial health)",
      "relevantData": "string (e.g., Emergency fund: 2.2 months | Savings rate: 20%)",
      "explanation": {
        "dataConsidered": ["string (e.g., Monthly expenses: ₹32,000)", "string (e.g., Emergency fund: ₹70,000)", ...],
        "reason": "string (direct rule/math calculation behind this suggestion)",
        "expectedBenefit": "string (positive holistic outcome if addressed)",
        "assumptions": "string (e.g., Assumes monthly expenses represent standard recurring spending)",
        "limitations": "string (e.g., Does not account for sudden unexpected capital gains or unlisted family assets)"
      }
    }
  ]
}`;

  const prompt = `Generate 3 to 5 personalized, explainable recommendations for this user profile:
- Monthly Income: ₹${profile.income || 0}
- Monthly Expenses: ₹${profile.expenses || 0}
- Monthly Savings: ₹${profile.savings || 0}
- Savings Rate: ${Math.round((profile.savingsRate || 0) * 100)}%
- Total Debt: ₹${profile.debt || 0}
- Monthly EMI: ₹${profile.emi || 0}
- EMI-to-Income Ratio: ${Math.round((profile.emiRatio || 0) * 100)}%
- Emergency Fund: ₹${profile.emergencyFund || 0} (${(profile.monthsCovered || 0).toFixed(1)} months coverage)
- Current Investments: ₹${profile.investments || 0}
- Risk Preference: ${profile.riskPreference || "Medium"}
- Goal: "${profile.goalType || "General Savings"}" (Target: ₹${profile.goalTarget || 0}, Saved: ₹${profile.goalCurrent || 0}, Timeline: ${profile.goalTimeline || 0} months, Progress: ${profile.goalScore || 0}%)
- Reported Category Spending: ${JSON.stringify(profile.spending || {})}
- Pillar Scores: Cash Flow: ${profile.cashFlow || 0}/100, Savings: ${profile.savingsScore || 0}/100, Debt: ${profile.debtScore || 0}/100, Emergency: ${profile.efScore || 0}/100, Goal: ${profile.goalScore || 0}/100, Overall: ${profile.overallScore || 0}/100

Ensure every recommendation includes complete Explainable AI fields (dataConsidered, reason, expectedBenefit, assumptions, limitations).`;

  const result = await callGemini(prompt, systemInstruction);
  return {
    recommendations: result.data.recommendations || [],
    modelUsed: result.modelUsed,
    disclaimer: DISCLAIMER_TEXT,
  };
}

/* ==========================================================================
   FEATURE 4: AI GOAL PLANNER
   ========================================================================== */
async function handleGoalPlan(goalData) {
  // Pre-calculate exact mathematical numbers in JavaScript
  const target = Math.max(0, parseFloat(goalData.target) || 0);
  const current = Math.max(0, parseFloat(goalData.current) || 0);
  const timelineMonths = Math.max(
    1,
    parseInt(goalData.timelineMonths, 10) || 1,
  );
  const remaining = Math.max(0, target - current);
  const requiredMonthlyContribution = Math.round(remaining / timelineMonths);
  const monthlyIncome = parseFloat(goalData.income) || 0;
  const monthlyExpenses = parseFloat(goalData.expenses) || 0;
  const monthlySavings = parseFloat(goalData.savings) || 0;
  const currentSurplus = Math.max(0, monthlyIncome - monthlyExpenses);
  const completionPercentage =
    target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  const systemInstruction = `You are Finora AI, an educational financial goal coach.
Your job is to provide contextual educational guidance around a user's financial goal.
The exact mathematical calculations (remaining amount, required monthly contribution) have already been calculated.
DO NOT guarantee that the user will achieve the goal or offer risky speculative tactics.

Return strict JSON matching this schema:
{
  "goalSummary": "string (concise overview of goal and timeline)",
  "feasibilityAssessment": "string (practical assessment comparing required contribution of ₹${requiredMonthlyContribution}/mo with monthly savings/surplus)",
  "suggestedApproach": [
    { "step": "string (title)", "detail": "string (actionable educational tip)" }
  ],
  "potentialChallenges": ["string", "string"],
  "progressAdvice": "string (encouraging milestone advice)",
  "milestonePlan": [
    { "milestone": "string", "targetAmount": "string", "focus": "string" }
  ]
}`;

  const prompt = `Analyze this financial goal with the exact pre-calculated figures:
- Goal Name: "${goalData.name || "My Goal"}"
- Target Amount: ₹${target.toLocaleString("en-IN")}
- Current Amount Saved: ₹${current.toLocaleString("en-IN")} (${completionPercentage}% reached)
- Remaining Amount: ₹${remaining.toLocaleString("en-IN")}
- Timeline: ${timelineMonths} months
- Required Monthly Contribution: ₹${requiredMonthlyContribution.toLocaleString("en-IN")}/month
- User's Monthly Income: ₹${monthlyIncome.toLocaleString("en-IN")}
- User's Monthly Expenses: ₹${monthlyExpenses.toLocaleString("en-IN")}
- User's Current Monthly Savings: ₹${monthlySavings.toLocaleString("en-IN")}
- User's Current Monthly Cash Flow Surplus: ₹${currentSurplus.toLocaleString("en-IN")}
- Risk Preference: ${goalData.riskPreference || "Medium"}

Provide a realistic, personalized, and encouraging educational plan.`;

  const result = await callGemini(prompt, systemInstruction);
  return {
    math: {
      target,
      current,
      remaining,
      timelineMonths,
      requiredMonthlyContribution,
      currentMonthlySavings: monthlySavings,
      currentSurplus,
      completionPercentage,
    },
    plan: result.data,
    modelUsed: result.modelUsed,
    disclaimer: DISCLAIMER_TEXT,
  };
}

/* ==========================================================================
   MAIN EXPRESS / SERVERLESS HANDLER
   ========================================================================== */
export default async function aiHandler(req, res) {
  // CORS & OPTIONS
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    return res.status(204).end();
  }

  // Determine requested action from URL path or body
  const rawPath = (req.path || req.url || "")
    .split("?")[0]
    .replace(/^\/api\/ai\/?/, "")
    .replace(/^\//, "");
  const action = rawPath || req.query?.action || req.body?.action || "status";

  if (req.method === "GET" || action === "status") {
    const apiKey = getApiKey();
    return res.status(200).json({
      ok: true,
      service: "finora-ai-service",
      configured: Boolean(apiKey),
      configuredModel: DEFAULT_MODEL,
      fallbackModels: FALLBACK_MODELS,
      disclaimer: DISCLAIMER_TEXT,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const payload = req.body || {};

    if (action === "summary") {
      const summary = await handleSummary(payload);
      return res.status(200).json({ success: true, ...summary });
    }

    if (action === "recommendations") {
      const recommendations = await handleRecommendations(payload);
      return res.status(200).json({ success: true, ...recommendations });
    }

    if (action === "goal-plan") {
      const goalPlan = await handleGoalPlan(payload);
      return res.status(200).json({ success: true, ...goalPlan });
    }

    return res.status(400).json({
      error: `Unknown AI action: "${action}". Supported actions: summary, recommendations, goal-plan, status.`,
    });
  } catch (error) {
    console.error("[Finora AI Error]:", error.message);
    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "An unexpected error occurred while communicating with Gemini.",
      fallbackMessage:
        "AI analysis is temporarily unavailable. Your existing financial dashboard and rule-based analysis are still available.",
    });
  }
}
