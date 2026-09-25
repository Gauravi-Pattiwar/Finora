const SAVED_PDFS_KEY = "fha_saved_pdfs";
let cloudMonthlyAnalyses = null;

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

function formatINR(value) {
  return "₹" + Math.round(value || 0).toLocaleString("en-IN");
}

function getJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function getSavedPdfs() {
  return getJson(SAVED_PDFS_KEY, {});
}

function getMonthlyAnalyses() {
  return cloudMonthlyAnalyses || getJson("fha_monthly_analyses", {});
}

async function loadCloudAnalyses() {
  const userId = localStorage.getItem("fha_user_email");
  if (!userId || window.location.protocol === "file:") return;
  try {
    const response = await fetch(
      `/api/analyses?userId=${encodeURIComponent(userId)}`,
    );
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
  return getJson("fha_monthly_documents", {});
}

function getPdfMonthKey(pdf) {
  if (!pdf?.savedAt) return null;
  const date = new Date(pdf.savedAt);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getScore(assessment) {
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

  document.getElementById("profileName").textContent = email || "Finora user";
  document.getElementById("profileMeta").textContent = email
    ? "Your financial workspace is stored locally in this browser."
    : "Use sign in or create account to label this local workspace.";
  document.getElementById("profileAvatar").textContent = (email || "F")
    .charAt(0)
    .toUpperCase();

  const documentMonths = Object.values(savedPdfs)
    .map(getPdfMonthKey)
    .filter(Boolean);
  const monthlyEntries = [
    ...new Set([
      ...Object.keys(monthlyAnalyses),
      ...Object.keys(monthlyDocuments),
      ...documentMonths,
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
            const monthLabel = new Date(
              `${entry.month}-01T00:00:00`,
            ).toLocaleString("en-IN", {
              month: "long",
              year: "numeric",
            });
            return `<article class="profile-month"><div class="profile-month-head"><div><h4>${monthLabel}</h4><span>Updated ${new Date(entry.updatedAt).toLocaleString("en-IN")}</span></div><strong>${entryScore.overall} / 100</strong></div><div class="profile-month-stats"><span>Income <b>${formatINR(assessment.income)}</b></span><span>Expenses <b>${formatINR(assessment.expenses)}</b></span><span>Savings <b>${formatINR(assessment.savings)}</b></span><span>Spending <b>${formatINR(spendingTotal)}</b></span><span>Debt <b>${formatINR(assessment.debt)}</b></span><span>EMI <b>${formatINR(assessment.emi)}</b></span><span>Emergency fund <b>${formatINR(assessment.emergencyFund)}</b></span><span>Investments <b>${formatINR(assessment.investments)}</b></span></div><div class="profile-month-grid"><div class="profile-month-detail"><h5>Spending categories</h5><div class="profile-month-list">${spendingRows || '<span class="profile-month-empty">No spending recorded</span>'}</div></div><div class="profile-month-detail"><h5>Budget categories</h5><div class="profile-month-list">${budgetRows || '<span class="profile-month-empty">No budget recorded</span>'}</div></div><div class="profile-month-detail"><h5>Goals</h5><div class="profile-month-list">${goalRows}</div></div><div class="profile-month-detail"><h5>Documents</h5><div class="profile-month-list">${documentRows}</div></div></div></article>`;
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

renderProfile();
loadCloudAnalyses();
