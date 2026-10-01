const SAVED_PDFS_KEY = "fha_saved_pdfs";
const MONTHLY_DOCUMENTS_KEY = "fha_monthly_documents";
const MONTHLY_ANALYSES_KEY = "fha_monthly_analyses";
let cloudMonthlyAnalyses = null;

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

function formatINR(value) {
  return "₹" + Math.round(value || 0).toLocaleString("en-IN");
}

function getCurrentUserKey() {
  const email = localStorage.getItem("fha_user_email") || "";
  const username = localStorage.getItem("fha_user_name") || "";
  const id = (email || username || "guest").toLowerCase().trim();
  return `fha_workspace_${id}`;
}

function getJson(key, fallback) {
  try {
    const userKey = getCurrentUserKey();
    const rawWs = localStorage.getItem(userKey);
    if (rawWs) {
      const ws = JSON.parse(rawWs);
      const wsPropMap = {
        fha_assessment: "assessment",
        fha_spending: "spending",
        fha_budgets: "budgets",
        fha_goals: "goals",
        fha_saved_pdfs: "savedPdfs",
        fha_monthly_analyses: "monthlyAnalyses",
        fha_monthly_documents: "monthlyDocuments",
      };
      const prop = wsPropMap[key];
      if (prop && ws[prop] !== undefined && ws[prop] !== null) {
        return ws[prop];
      }
    }
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}

function getSavedPdfs() {
  return getJson(SAVED_PDFS_KEY, {});
}

function getMonthlyAnalyses() {
  const localAnalyses = getJson(MONTHLY_ANALYSES_KEY, {});
  if (!cloudMonthlyAnalyses) return localAnalyses;
  return Object.fromEntries(
    [
      ...new Set([
        ...Object.keys(localAnalyses),
        ...Object.keys(cloudMonthlyAnalyses),
      ]),
    ].map((month) => {
      const local = localAnalyses[month] || {};
      const cloud = cloudMonthlyAnalyses[month] || {};
      return [
        month,
        {
          ...local,
          ...cloud,
          ai: { ...(local.ai || {}), ...(cloud.ai || {}) },
        },
      ];
    }),
  );
}

async function loadCloudAnalyses() {
  const userId = localStorage.getItem("fha_user_email");
  if (!userId || window.location.protocol === "file:") return;
  try {
    const token = localStorage.getItem("fha_auth_token");
    if (!token) return;
    const response = await fetch("/api/analyses", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;
    const analyses = await response.json();
    cloudMonthlyAnalyses = Object.fromEntries(
      analyses.map((analysis) => [analysis.month, analysis]),
    );
    renderProfile();
  } catch {
    // Local storage remains the offline fallback when the API is unavailable.
  }
}

function getMonthlyDocuments() {
  return getJson(MONTHLY_DOCUMENTS_KEY, {});
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function getPdfMonthKey(pdf) {
  if (!pdf?.savedAt) return null;
  const date = new Date(pdf.savedAt);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getScore(assessment) {
  if (!assessment) return { overall: 0, savingsRate: 0, monthsCovered: 0 };
  const surplusRatio =
    assessment.income > 0
      ? (assessment.income - assessment.expenses) / assessment.income
      : 0;
  const savingsRate =
    assessment.income > 0 ? assessment.savings / assessment.income : 0;
  const emiRatio =
    assessment.income > 0 ? assessment.emi / assessment.income : 0;
  const monthsCovered =
    assessment.expenses > 0
      ? assessment.emergencyFund / assessment.expenses
      : 0;
  const goalRatio =
    assessment.goalTarget > 0
      ? assessment.goalCurrent / assessment.goalTarget
      : 0;
  const cashFlow = Math.max(
    0,
    Math.min(100, Math.round(50 + surplusRatio * 100)),
  );
  const savingsScore = Math.max(
    0,
    Math.min(100, Math.round((savingsRate / 0.2) * 100)),
  );
  const debtScore = Math.max(
    0,
    Math.min(100, Math.round(100 - (emiRatio / 0.5) * 100)),
  );
  const emergencyScore = Math.max(
    0,
    Math.min(100, Math.round((monthsCovered / 6) * 100)),
  );
  const goalScore = Math.max(0, Math.min(100, Math.round(goalRatio * 100)));
  return {
    overall: Math.round(
      cashFlow * 0.25 +
        savingsScore * 0.25 +
        debtScore * 0.2 +
        emergencyScore * 0.2 +
        goalScore * 0.1,
    ),
    savingsRate,
    monthsCovered,
  };
}

function renderAiList(title, items) {
  if (!Array.isArray(items) || !items.length) return "";
  return `<div class="profile-ai-expanded-group"><h6>${escapeHtml(title)}</h6><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
}

function renderFullAiResult(type, feature) {
  const full = feature?.full;
  const points = Array.isArray(feature) ? feature : feature?.points || [];
  if (!full) {
    return points.length
      ? `<p class="profile-ai-legacy-note">Only saved points are available for this month. Regenerate this AI result to view full details.</p>${renderAiList("Saved points", points)}`
      : '<p class="profile-ai-legacy-note">No generated result was saved for this month.</p>';
  }

  const sections = [];
  if (type === "summary") {
    if (full.overallAssessment)
      sections.push(`<p>${escapeHtml(full.overallAssessment)}</p>`);
    sections.push(renderAiList("Strengths", full.strengths));
    sections.push(renderAiList("Areas to improve", full.areasToImprove));
    if (full.priorityFocus)
      sections.push(
        `<p><strong>Priority focus:</strong> ${escapeHtml(full.priorityFocus)}</p>`,
      );
    if (full.educationalNote)
      sections.push(
        `<p><strong>Educational note:</strong> ${escapeHtml(full.educationalNote)}</p>`,
      );
  } else if (type === "recommendations") {
    const recommendations = Array.isArray(full)
      ? full
      : full.recommendations || [];
    sections.push(
      recommendations
        .map((item) => {
          const explanation = item.explanation || {};
          return `<article class="profile-ai-expanded-item">
        <h6>${escapeHtml(item.title || "Recommendation")}${item.priority ? ` <span>${escapeHtml(item.priority)}</span>` : ""}</h6>
        ${item.recommendation ? `<p>${escapeHtml(item.recommendation)}</p>` : ""}
        ${item.whyItMatters ? `<p><strong>Why it matters:</strong> ${escapeHtml(item.whyItMatters)}</p>` : ""}
        ${item.relevantData ? `<p><strong>Relevant data:</strong> ${escapeHtml(item.relevantData)}</p>` : ""}
        ${renderAiList("Data considered", explanation.dataConsidered)}
        ${explanation.reason ? `<p><strong>Reason:</strong> ${escapeHtml(explanation.reason)}</p>` : ""}
        ${explanation.expectedBenefit ? `<p><strong>Expected benefit:</strong> ${escapeHtml(explanation.expectedBenefit)}</p>` : ""}
        ${explanation.assumptions ? `<p><strong>Assumptions:</strong> ${escapeHtml(explanation.assumptions)}</p>` : ""}
        ${explanation.limitations ? `<p><strong>Limitations:</strong> ${escapeHtml(explanation.limitations)}</p>` : ""}
      </article>`;
        })
        .join(""),
    );
  } else {
    const plan = full.plan || {};
    const math = full.math || {};
    const mathRows = [
      ["Target", math.target],
      ["Current savings", math.current],
      ["Remaining", math.remaining],
      [
        "Timeline",
        math.timelineMonths ? `${math.timelineMonths} months` : null,
      ],
      ["Required monthly contribution", math.requiredMonthlyContribution],
      ["Current monthly savings", math.currentMonthlySavings],
      ["Current surplus", math.currentSurplus],
      [
        "Goal progress",
        math.completionPercentage !== undefined
          ? `${math.completionPercentage}%`
          : null,
      ],
      ["Current monthly savings", math.currentMonthlySavings],
      ["Current surplus", math.currentSurplus],
      [
        "Progress",
        math.completionPercentage !== undefined
          ? `${math.completionPercentage}%`
          : null,
      ],
    ].filter(([, value]) => value !== undefined && value !== null);
    if (mathRows.length) {
      sections.push(
        `<div class="profile-ai-expanded-math">${mathRows.map(([label, value]) => `<span>${escapeHtml(label)}<b>${typeof value === "number" ? formatINR(value) : escapeHtml(value)}</b></span>`).join("")}</div>`,
      );
    }
    if (plan.goalSummary)
      sections.push(`<p>${escapeHtml(plan.goalSummary)}</p>`);
    if (plan.feasibilityAssessment)
      sections.push(
        `<p><strong>Feasibility:</strong> ${escapeHtml(plan.feasibilityAssessment)}</p>`,
      );
    if (Array.isArray(plan.suggestedApproach)) {
      sections.push(
        `<div class="profile-ai-expanded-group"><h6>Suggested approach</h6><ol>${plan.suggestedApproach.map((item) => `<li><strong>${escapeHtml(item.step)}</strong>${item.detail ? `: ${escapeHtml(item.detail)}` : ""}</li>`).join("")}</ol></div>`,
      );
    }
    sections.push(
      renderAiList("Potential challenges", plan.potentialChallenges),
    );
    if (Array.isArray(plan.milestonePlan) && plan.milestonePlan.length) {
      sections.push(
        `<div class="profile-ai-expanded-group"><h6>Milestones</h6><ul>${plan.milestonePlan.map((item) => `<li><strong>${escapeHtml(item.milestone)}</strong>${item.targetAmount ? ` (${escapeHtml(item.targetAmount)})` : ""}${item.focus ? `: ${escapeHtml(item.focus)}` : ""}</li>`).join("")}</ul></div>`,
      );
    }
    if (plan.progressAdvice)
      sections.push(
        `<p><strong>Progress advice:</strong> ${escapeHtml(plan.progressAdvice)}</p>`,
      );
  }

  if (full.disclaimer)
    sections.push(
      `<p class="profile-ai-disclaimer">${escapeHtml(full.disclaimer)}</p>`,
    );
  return (
    sections.filter(Boolean).join("") ||
    '<p class="profile-ai-legacy-note">No details were included in this generated result.</p>'
  );
}

function downloadSavedPdf(type) {
  const pdf = getSavedPdfs()[type];
  if (!pdf) return;
  const link = document.createElement("a");
  link.href = pdf.dataUri;
  link.download = pdf.filename;
  link.click();
}

function downloadMonthlyPdf(month, type) {
  const pdf = getMonthlyDocuments()[month]?.[type];
  if (!pdf) return;
  const link = document.createElement("a");
  link.href = pdf.dataUri;
  link.download = pdf.filename;
  link.click();
}

function renderProfile() {
  const assessment = getJson("fha_assessment", null);
  const spending = getJson("fha_spending", {
    labels: [],
    values: [],
    total: 0,
  });
  const budgets = getJson("fha_budgets", {});
  const goals = getJson("fha_goals", []);
  const savedPdfs = getSavedPdfs();
  const monthlyAnalyses = getMonthlyAnalyses();
  const monthlyDocuments = getMonthlyDocuments();
  const email = localStorage.getItem("fha_user_email");
  let username = localStorage.getItem("fha_user_name") || "";
  try {
    const registeredUsers = JSON.parse(
      localStorage.getItem("fha_registered_users") || "[]",
    );
    const registeredUser = registeredUsers.find(
      (user) => user.email?.toLowerCase() === email?.toLowerCase(),
    );
    if (registeredUser?.username) username = registeredUser.username;
  } catch {
    // Use the saved profile name when local account data is unavailable.
  }
  username = username || email || "Finora user";

  document.getElementById("profileName").textContent = username;
  document.getElementById("profileMeta").textContent = email
    ? "Your financial workspace and monthly analysis are saved to your account when available."
    : "Use sign in or create account to label this local workspace.";
  document.getElementById("profileAvatar").textContent = (
    username ||
    email ||
    "F"
  )
    .charAt(0)
    .toUpperCase();

  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const documentMonths = Object.values(savedPdfs)
    .map(getPdfMonthKey)
    .filter(Boolean);
  const monthlyEntries = [
    ...new Set([
      ...Object.keys(monthlyAnalyses),
      ...Object.keys(monthlyDocuments),
      ...documentMonths,
      ...(assessment ? [currentMonth] : []),
    ]),
  ]
    .map(
      (month) =>
        monthlyAnalyses[month] || {
          month,
          updatedAt:
            savedPdfs.budget?.savedAt ||
            savedPdfs.report?.savedAt ||
            new Date().toISOString(),
          assessment,
          spending,
          budgets,
          goals,
        },
    )
    .sort((a, b) => b.month.localeCompare(a.month));
  document.getElementById("profileMonthlyAnalyses").innerHTML =
    monthlyEntries.length
      ? monthlyEntries
          .map((entry) => {
            const assessment = entry.assessment || {};
            const entryScore = getScore(assessment);
            const spendingTotal = entry.spending?.total || 0;
            const spendingRows = (entry.spending?.labels || [])
              .map(
                (label, index) =>
                  `<span>${label}<b>${formatINR(entry.spending.values[index])}</b></span>`,
              )
              .join("");
            const budgetRows = Object.entries(entry.budgets || {})
              .map(
                ([label, value]) =>
                  `<span>${label}<b>${formatINR(value)}</b></span>`,
              )
              .join("");
            const goalRows = (entry.goals || []).length
              ? entry.goals
                  .map((goal) => {
                    const percentage =
                      goal.target > 0
                        ? Math.min(
                            100,
                            Math.round((goal.current / goal.target) * 100),
                          )
                        : 0;
                    return `<span>${goal.name}<b>${formatINR(goal.current)} / ${formatINR(goal.target)} (${percentage}%)</b></span>`;
                  })
                  .join("")
              : '<span class="profile-month-empty">No goals recorded</span>';
            const documentRows = [
              ["budget", "Monthly planner"],
              ["report", "Financial report"],
            ]
              .map(([type, label]) => {
                const pdf =
                  monthlyDocuments[entry.month]?.[type] ||
                  (getPdfMonthKey(savedPdfs[type]) === entry.month
                    ? savedPdfs[type]
                    : null);
                return pdf
                  ? `<span>${label}<button type="button" class="btn btn-ghost profile-month-download" onclick="downloadMonthlyPdf('${entry.month}', '${type}')"><i data-lucide="download"></i>Download</button></span>`
                  : `<span>${label}<b>Not generated</b></span>`;
              })
              .join("");
            const aiLabels = [
              ["summary", "Summary", entry.ai?.summary],
              ["recommendations", "Recommendation", entry.ai?.recommendations],
              ["goalPlan", "Goal plan", entry.ai?.goalPlan],
            ];
            const aiRows = aiLabels
              .map(([type, label, feature]) => {
                const points = Array.isArray(feature)
                  ? feature
                  : feature?.points || [];
                const hasContent = points.length > 0 || Boolean(feature?.full);
                return `<button type="button" class="btn btn-ghost profile-ai-tab" role="tab" aria-selected="false" aria-controls="profile-ai-details-${entry.month}" data-ai-month="${entry.month}" data-ai-type="${type}" ${hasContent ? "" : "disabled"}>${label}</button>`;
              })
              .join("");
            const aiDetailsId = `profile-ai-details-${entry.month}`;
            const monthLabel = new Date(
              `${entry.month}-01T00:00:00`,
            ).toLocaleString("en-IN", {
              month: "long",
              year: "numeric",
            });
            return `<article class="profile-month"><div class="profile-month-head"><div><h4>${monthLabel}</h4><span>Updated ${new Date(entry.updatedAt).toLocaleString("en-IN")}</span></div><strong>${entryScore.overall} / 100</strong></div><div class="profile-month-stats"><span>Income <b>${formatINR(assessment.income)}</b></span><span>Expenses <b>${formatINR(assessment.expenses)}</b></span><span>Savings <b>${formatINR(assessment.savings)}</b></span><span>Spending <b>${formatINR(spendingTotal)}</b></span><span>Debt <b>${formatINR(assessment.debt)}</b></span><span>EMI <b>${formatINR(assessment.emi)}</b></span><span>Emergency fund <b>${formatINR(assessment.emergencyFund)}</b></span><span>Investments <b>${formatINR(assessment.investments)}</b></span></div><div class="profile-month-grid"><div class="profile-month-detail"><h5>Spending categories</h5><div class="profile-month-list">${spendingRows || '<span class="profile-month-empty">No spending recorded</span>'}</div></div><div class="profile-month-detail"><h5>Budget categories</h5><div class="profile-month-list">${budgetRows || '<span class="profile-month-empty">No budget recorded</span>'}</div></div><div class="profile-month-detail"><h5>Goals</h5><div class="profile-month-list">${goalRows}</div></div><div class="profile-month-detail"><h5>Documents</h5><div class="profile-month-list">${documentRows}</div></div><div class="profile-month-detail profile-month-ai-detail"><h5>AI-generated points</h5><div class="profile-ai-tabs" role="tablist" aria-label="AI generated content">${aiRows}</div><div id="${aiDetailsId}" class="profile-ai-details hidden" role="tabpanel" aria-live="polite"></div></div></div></article>`;
          })
          .join("")
      : '<p class="profile-empty">No monthly analysis saved yet. Calculate your assessment from the main website.</p>';
  refreshIcons();
}

function applyTheme(theme) {
  const selectedTheme = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = selectedTheme;
  const isLight = selectedTheme === "light";
  document
    .getElementById("themeIcon")
    .setAttribute("data-lucide", isLight ? "moon" : "sun");
  document.getElementById("themeLabel").textContent = isLight
    ? "Dark"
    : "Light";
  localStorage.setItem("fha_theme", selectedTheme);
  refreshIcons();
}

const savedTheme = localStorage.getItem("fha_theme");
const systemPrefersLight =
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: light)").matches;
applyTheme(savedTheme || (systemPrefersLight ? "light" : "dark"));
document.getElementById("themeToggle").addEventListener("click", () => {
  applyTheme(document.body.dataset.theme === "light" ? "dark" : "light");
});
document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("fha_auth_source");
  localStorage.removeItem("fha_user_email");
  localStorage.removeItem("fha_user_name");
  localStorage.removeItem("fha_auth_token");
  window.location.href = "index.html";
});
document.getElementById("hamburgerBtn").addEventListener("click", () => {
  document.getElementById("navlinks").classList.toggle("open");
});
document.querySelectorAll("#navlinks a").forEach((link) => {
  link.addEventListener("click", () =>
    document.getElementById("navlinks").classList.remove("open"),
  );
});

document
  .getElementById("profileMonthlyAnalyses")
  .addEventListener("click", (event) => {
    const collapseButton = event.target.closest(".profile-ai-collapse");
    if (collapseButton) {
      const card = collapseButton.closest(".profile-month-ai-detail");
      card.querySelector(".profile-ai-details").classList.add("hidden");
      card.querySelectorAll(".profile-ai-tab").forEach((tab) => {
        tab.setAttribute("aria-selected", "false");
      });
      return;
    }

    const button = event.target.closest(".profile-ai-tab");
    if (!button || button.disabled) return;

    const card = button.closest(".profile-month-ai-detail");
    const panel = card.querySelector(".profile-ai-details");
    const entry = getMonthlyAnalyses()[button.dataset.aiMonth];
    const feature = entry?.ai?.[button.dataset.aiType];
    if (!panel || !feature) return;

    card.querySelectorAll(".profile-ai-tab").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab === button));
    });
    panel.innerHTML = `<button type="button" class="profile-ai-collapse" aria-label="Close generated content" title="Close generated content"><i data-lucide="chevron-up"></i></button><div class="profile-ai-full-result">${renderFullAiResult(button.dataset.aiType, feature)}</div>`;
    panel.classList.remove("hidden");
    refreshIcons();
  });

renderProfile();
loadCloudAnalyses();
