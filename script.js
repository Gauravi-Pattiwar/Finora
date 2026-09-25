/* ============================================================
  FINORA - FINANCE + AURA â€” STAGE 1
   All logic below is rule-based JavaScript. No AI API is used.
   ============================================================ */

function refreshIcons() {
  try {
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.warn("Icon render skipped:", e);
  }
}
refreshIcons();

/* ---------- THEME ---------- */
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const themeLabel = document.getElementById("themeLabel");

function applyTheme(theme) {
  const selectedTheme = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = selectedTheme;
  const isLight = selectedTheme === "light";
  themeIcon.setAttribute("data-lucide", isLight ? "moon" : "sun");
  themeLabel.textContent = isLight ? "Dark" : "Light";
  themeToggle.setAttribute(
    "aria-label",
    `Switch to ${isLight ? "dark" : "light"} mode`,
  );
  refreshIcons();
  localStorage.setItem("fha_theme", selectedTheme);
}

const savedTheme = localStorage.getItem("fha_theme");
const systemPrefersLight =
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: light)").matches;
applyTheme(savedTheme || (systemPrefersLight ? "light" : "dark"));

themeToggle.addEventListener("click", () => {
  const nextTheme = document.body.dataset.theme === "light" ? "dark" : "light";
  applyTheme(nextTheme);
  showToast(
    nextTheme === "light" ? "Light mode enabled." : "Dark mode enabled.",
  );
});

/* ---------- DEMO DATA ---------- */
const DEMO = {
  income: 60000,
  expenses: 32000,
  savings: 12000,
  debt: 150000,
  emi: 7000,
  emergencyFund: 70000,
  investments: 100000,
  riskPreference: "Medium",
  goalType: "Emergency Fund",
  goalTimeline: 6,
  goalTarget: 0,
  goalCurrent: 0,
};
const DEMO_SPEND = {
  Food: 6000,
  Transport: 4000,
  Shopping: 5000,
  Entertainment: 2000,
  Bills: 7000,
  Education: 2000,
  Healthcare: 2000,
  Other: 4000,
};
let lastValues = null;
let lastScores = null;
let charts = {};
const CAT_COLORS = [
  "#22d3c8",
  "#34d399",
  "#f2b134",
  "#f2707a",
  "#a78bfa",
  "#60a5fa",
  "#fb923c",
  "#94a3b8",
];
const ESSENTIAL_CATS = ["Food", "Bills", "Healthcare", "Transport"];

/* ---------- AUTH GATE ---------- */
const authOverlay = document.getElementById("authOverlay");
const signInBtn = document.getElementById("signInBtn");
const createAccountBtn = document.getElementById("createAccountBtn");
const demoAccessBtn = document.getElementById("demoAccessBtn");
const skipAuthBtn = document.getElementById("skipAuthBtn");

function openMainApp(source = "guest") {
  authOverlay.classList.add("hidden");
  localStorage.setItem("fha_auth_source", source);
  const nameField = document.getElementById("authEmail");
  if (nameField && nameField.value.trim()) {
    localStorage.setItem("fha_user_email", nameField.value.trim());
  }
  showToast(source === "demo" ? "Demo mode enabled." : "Welcome!");
}

if (new URLSearchParams(window.location.search).has("fromProfile")) {
  openMainApp("guest");
}

signInBtn.addEventListener("click", () => {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value.trim();
  if (!email || !password) {
    showToast("Please enter your email and password.");
    return;
  }
  openMainApp("signin");
});

createAccountBtn.addEventListener("click", () => {
  const email = document.getElementById("authEmail").value.trim();
  if (!email) {
    showToast("Please enter your email to create an account.");
    return;
  }
  openMainApp("signup");
});

demoAccessBtn.addEventListener("click", () => {
  loadDemoData();
  openMainApp("demo");
});

if (skipAuthBtn) {
  skipAuthBtn.addEventListener("click", () => {
    openMainApp("guest");
  });
}

/* ---------- NAV ---------- */
const hamburgerBtn = document.getElementById("hamburgerBtn");
const navlinks = document.getElementById("navlinks");
hamburgerBtn.addEventListener("click", () => navlinks.classList.toggle("open"));
navlinks
  .querySelectorAll("a")
  .forEach((a) =>
    a.addEventListener("click", () => navlinks.classList.remove("open")),
  );
function scrollToSection(id) {
  document.getElementById(id).scrollIntoView({ behavior: "smooth" });
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(showToast._h);
  showToast._h = setTimeout(() => {
    t.style.display = "none";
  }, 2600);
}

function formatINR(num) {
  num = Math.round(num || 0);
  return "₹" + num.toLocaleString("en-IN");
}

const MONTHLY_ANALYSES_KEY = "fha_monthly_analyses";

function getMonthKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function syncMonthlyAnalysis(snapshot) {
  const userId = localStorage.getItem("fha_user_email");
  if (!userId || window.location.protocol === "file:") return;
  fetch("/api/analyses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...snapshot, userId }),
  }).catch(() => {
    // Local storage remains the offline fallback when the API is unavailable.
  });
}

function saveMonthlyAnalysisSnapshot(assessment = getReportAssessment()) {
  if (!assessment) return;
  const saved = JSON.parse(localStorage.getItem(MONTHLY_ANALYSES_KEY) || "{}");
  const month = getMonthKey();
  const snapshot = {
    month,
    updatedAt: new Date().toISOString(),
    assessment,
    spending: getSpendData(),
    budgets: getBudgets(),
    goals: getGoals(),
    pdfs: Object.fromEntries(
      Object.entries(getSavedPdfs()).map(([type, pdf]) => [
        type,
        {
          filename: pdf.filename,
          month: pdf.month,
          savedAt: pdf.savedAt,
        },
      ]),
    ),
  };
  saved[month] = snapshot;
  localStorage.setItem(MONTHLY_ANALYSES_KEY, JSON.stringify(saved));
  syncMonthlyAnalysis(snapshot);
}

const SAVED_PDFS_KEY = "fha_saved_pdfs";
const MONTHLY_DOCUMENTS_KEY = "fha_monthly_documents";

function getSavedPdfs() {
  return JSON.parse(localStorage.getItem(SAVED_PDFS_KEY) || "{}");
}

function saveGeneratedPdf(type, doc, filename) {
  const now = new Date();
  const saved = getSavedPdfs();
  saved[type] = {
    filename,
    savedAt: now.toISOString(),
    month: now.toLocaleString("en-IN", {
      month: "long",
      year: "numeric",
    }),
    dataUri: doc.output("datauristring"),
  };
  localStorage.setItem(SAVED_PDFS_KEY, JSON.stringify(saved));
  const monthlyDocuments = JSON.parse(
    localStorage.getItem(MONTHLY_DOCUMENTS_KEY) || "{}",
  );
  const month = getMonthKey(now);
  monthlyDocuments[month] = monthlyDocuments[month] || {};
  monthlyDocuments[month][type] = saved[type];
  localStorage.setItem(MONTHLY_DOCUMENTS_KEY, JSON.stringify(monthlyDocuments));
  saveMonthlyAnalysisSnapshot();
  renderProfile();
}

function downloadSavedPdf(type) {
  const pdf = getSavedPdfs()[type];
  if (!pdf) {
    showToast("Generate this PDF first from its section.");
    return;
  }
  const link = document.createElement("a");
  link.href = pdf.dataUri;
  link.download = pdf.filename;
  link.click();
}

function renderProfile() {
  const profileStats = document.getElementById("profileStats");
  if (!profileStats) return;
  const assessment = getReportAssessment();
  const spending = getSpendData();
  const budgets = getBudgets();
  const goals = getGoals();
  const savedPdfs = getSavedPdfs();
  const scores = assessment ? computeScores(assessment) : null;
  const email = localStorage.getItem("fha_user_email");
  const profileName = document.getElementById("profileName");
  const profileMeta = document.getElementById("profileMeta");
  const profileAvatar = document.getElementById("profileAvatar");
  profileName.textContent = email || "Finora user";
  profileMeta.textContent = email
    ? "Your financial workspace is stored locally in this browser."
    : "Use sign in or create account to label this local workspace.";
  profileAvatar.textContent = (email || "F").charAt(0).toUpperCase();

  const stats = [
    ["Financial health", scores ? `${scores.overall} / 100` : "Not calculated"],
    ["Reported spending", formatINR(spending.total)],
    ["Saved goals", goals.length],
    ["Stored PDFs", Object.keys(savedPdfs).length],
  ];
  profileStats.innerHTML = stats
    .map(
      ([label, value]) =>
        `<div class="profile-stat"><div class="label">${label}</div><div class="value">${value}</div></div>`,
    )
    .join("");

  const documents = [
    ["budget", "Monthly planner", "finora-monthly-budget.pdf"],
    [
      "report",
      "Monthly financial report",
      "finora-monthly-financial-report.pdf",
    ],
  ];
  document.getElementById("profileDocuments").innerHTML = documents
    .map(([type, label, fallback]) => {
      const pdf = savedPdfs[type];
      const date = pdf
        ? new Date(pdf.savedAt).toLocaleString("en-IN")
        : "Not generated yet";
      return `<div class="profile-document"><div><strong>${label}</strong><span>${pdf ? `Saved ${date}` : date}</span></div>${pdf ? `<button type="button" class="btn btn-ghost" onclick="downloadSavedPdf('${type}')"><i data-lucide="download"></i>Download</button>` : `<span>${fallback}</span>`}</div>`;
    })
    .join("");

  const analysis = assessment
    ? [
        ["Monthly income", formatINR(assessment.income)],
        ["Monthly expenses", formatINR(assessment.expenses)],
        ["Monthly savings", formatINR(assessment.savings)],
        ["Savings rate", `${Math.round(scores.savingsRate * 100)}%`],
        [
          "Debt / EMI",
          `${formatINR(assessment.debt)} / ${formatINR(assessment.emi)}`,
        ],
        [
          "Emergency fund",
          `${formatINR(assessment.emergencyFund)} (${scores.monthsCovered.toFixed(1)} months)`,
        ],
        ["Investments", formatINR(assessment.investments)],
        ["Budget categories", `${Object.keys(budgets).length} saved`],
        [
          "Spending categories",
          `${spending.labels.filter((_, i) => spending.values[i] > 0).length} reported`,
        ],
        ["Goal records", `${goals.length} saved`],
      ]
    : [];
  document.getElementById("profileAnalysis").innerHTML = analysis.length
    ? `<div class="profile-analysis-list">${analysis.map(([label, value]) => `<div class="profile-analysis-item"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>`
    : '<p class="profile-empty">Calculate your financial health to see your complete analysis here.</p>';
  refreshIcons();
}

function loadDemoData() {
  Object.keys(DEMO).forEach((key) => {
    const el = document.getElementById(key);
    if (el) el.value = DEMO[key];
  });
  document.querySelectorAll(".spend-input").forEach((inp) => {
    inp.value = DEMO_SPEND[inp.dataset.cat];
  });
  lastValues = null;
  lastScores = null;
  document.getElementById("dashboardContent").classList.add("hidden");
  document.getElementById("dashboardEmpty").classList.remove("hidden");
  document.getElementById("recList").classList.add("hidden");
  document.getElementById("recEmpty").classList.remove("hidden");
  renderSpending(getSpendData());
  renderBudget();
  renderMonthlyReport();
  renderProfile();
  if (lastValues) drawDashboardCharts(lastValues, lastScores);
  document.getElementById("demoBanner").classList.add("show");
  scrollToSection("assessment");
  showToast("Demo data loaded.");
}
document.getElementById("loadDemoHome").addEventListener("click", loadDemoData);
document.getElementById("loadDemoForm").addEventListener("click", loadDemoData);

/* ---------- VALIDATION ---------- */
function setError(id, msg) {
  document.getElementById("err-" + id).textContent = msg || "";
  document.getElementById(id).classList.toggle("invalid", !!msg);
}
function validateAssessment(v) {
  let ok = true;
  const req = [
    "income",
    "expenses",
    "savings",
    "debt",
    "emi",
    "emergencyFund",
    "investments",
    "goalTimeline",
    "goalTarget",
    "goalCurrent",
  ];
  req.forEach((id) => setError(id, ""));

  if (!(v.income > 0)) {
    setError("income", "Income must be greater than zero.");
    ok = false;
  }
  [
    "expenses",
    "savings",
    "debt",
    "emi",
    "emergencyFund",
    "investments",
    "goalCurrent",
  ].forEach((k) => {
    if (v[k] < 0) {
      setError(k, "Value cannot be negative.");
      ok = false;
    }
  });
  if (v.goalTarget < 0) {
    setError("goalTarget", "Goal target cannot be negative.");
    ok = false;
  }
  if (!(v.goalTimeline > 0)) {
    setError("goalTimeline", "Timeline must be greater than zero.");
    ok = false;
  }
  return ok;
}

/* ============================================================
   SCORING ENGINE â€” transparent, rule-based, 0-100 per category
   ============================================================ */
function computeScores(v) {
  // 1. CASH FLOW SCORE
  // Based on the share of income left after expenses.
  // surplusRatio = (income - expenses) / income
  const surplusRatio = v.income > 0 ? (v.income - v.expenses) / v.income : 0;
  let cashFlow = Math.round(50 + surplusRatio * 100);
  cashFlow = Math.max(0, Math.min(100, cashFlow));

  // 2. SAVINGS SCORE
  // Based on savings rate = monthly savings / monthly income.
  // 20%+ savings rate is treated as an excellent (100) score.
  const savingsRate = v.income > 0 ? v.savings / v.income : 0;
  let savingsScore = Math.round((savingsRate / 0.2) * 100);
  savingsScore = Math.max(0, Math.min(100, savingsScore));

  // 3. DEBT SCORE
  // Based on EMI-to-income ratio (a standard affordability measure).
  // 0% EMI/income = 100 score, 50%+ EMI/income = 0 score.
  const emiRatio = v.income > 0 ? v.emi / v.income : 0;
  let debtScore = Math.round(100 - (emiRatio / 0.5) * 100);
  debtScore = Math.max(0, Math.min(100, debtScore));

  // 4. EMERGENCY FUND SCORE
  // Based on months of expenses the emergency fund can cover.
  // 6+ months covered = 100 score.
  const monthsCovered = v.expenses > 0 ? v.emergencyFund / v.expenses : 0;
  let efScore = Math.round((monthsCovered / 6) * 100);
  efScore = Math.max(0, Math.min(100, efScore));

  // 5. GOAL PROGRESS SCORE
  // Based on current goal amount / target goal amount.
  const goalRatio = v.goalTarget > 0 ? v.goalCurrent / v.goalTarget : 0;
  let goalScore = Math.round(goalRatio * 100);
  goalScore = Math.max(0, Math.min(100, goalScore));

  // OVERALL SCORE = simple weighted average of the five pillars
  const overall = Math.round(
    cashFlow * 0.25 +
      savingsScore * 0.25 +
      debtScore * 0.2 +
      efScore * 0.2 +
      goalScore * 0.1,
  );

  return {
    cashFlow,
    savingsScore,
    debtScore,
    efScore,
    goalScore,
    overall,
    monthsCovered,
    savingsRate,
    emiRatio,
    surplusRatio,
  };
}

function scoreTag(score) {
  if (score >= 75) return { label: "Strong", color: "var(--emerald)" };
  if (score >= 50) return { label: "Moderate", color: "var(--amber)" };
  return { label: "Needs Attention", color: "var(--red)" };
}

/* ---------- ASSESSMENT SUBMIT ---------- */
document
  .getElementById("assessmentForm")
  .addEventListener("submit", function (e) {
    e.preventDefault();
    const v = {
      income: parseFloat(document.getElementById("income").value) || 0,
      expenses: parseFloat(document.getElementById("expenses").value) || 0,
      savings: parseFloat(document.getElementById("savings").value) || 0,
      debt: parseFloat(document.getElementById("debt").value) || 0,
      emi: parseFloat(document.getElementById("emi").value) || 0,
      emergencyFund:
        parseFloat(document.getElementById("emergencyFund").value) || 0,
      investments:
        parseFloat(document.getElementById("investments").value) || 0,
      riskPreference: document.getElementById("riskPreference").value,
      goalType: document.getElementById("goalType").value,
      goalTimeline:
        parseFloat(document.getElementById("goalTimeline").value) || 0,
      goalTarget: parseFloat(document.getElementById("goalTarget").value) || 0,
      goalCurrent:
        parseFloat(document.getElementById("goalCurrent").value) || 0,
    };
    if (!validateAssessment(v)) {
      showToast("Please fix the highlighted fields.");
      return;
    }

    lastValues = v;
    lastScores = computeScores(v);
    localStorage.setItem("fha_assessment", JSON.stringify(v));
    saveMonthlyAnalysisSnapshot(v);

    renderDashboard(v, lastScores);
    renderRecommendations(v, lastScores);
    renderMonthlyReport();
    renderProfile();
    showToast("Financial health calculated.");
    scrollToSection("dashboard");
  });

/* ---------- RENDER DASHBOARD ---------- */
function renderDashboard(v, s) {
  document.getElementById("dashboardEmpty").classList.add("hidden");
  document.getElementById("dashboardContent").classList.remove("hidden");

  document.getElementById("overallScoreVal").textContent = s.overall;
  const tag = scoreTag(s.overall);
  const tagEl = document.getElementById("overallTag");
  tagEl.textContent = tag.label;
  tagEl.style.background = tag.color + "22";
  tagEl.style.color = tag.color;

  const circumference = 2 * Math.PI * 62;
  const ring = document.getElementById("scoreRingFill");
  ring.setAttribute("stroke-dasharray", circumference);
  ring.setAttribute(
    "stroke-dashoffset",
    circumference - (s.overall / 100) * circumference,
  );
  ring.setAttribute("stroke", tag.color);

  const cards = [
    {
      icon: "trending-up",
      title: "Cash Flow",
      value: s.cashFlow,
      desc: `Your expenses use approximately ${Math.round((v.income ? v.expenses / v.income : 0) * 100)}% of your monthly income, leaving ${Math.round(s.surplusRatio * 100)}% as surplus.`,
    },
    {
      icon: "piggy-bank",
      title: "Savings",
      value: s.savingsScore,
      desc: `You save approximately ${Math.round(s.savingsRate * 100)}% of your monthly income.`,
    },
    {
      icon: "credit-card",
      title: "Debt",
      value: s.debtScore,
      desc: `Your monthly EMI represents approximately ${Math.round(s.emiRatio * 100)}% of your income.`,
    },
    {
      icon: "shield",
      title: "Emergency Fund",
      value: s.efScore,
      desc: `Your emergency fund currently covers approximately ${s.monthsCovered.toFixed(1)} months of reported expenses.`,
    },
    {
      icon: "target",
      title: "Goal Progress",
      value: s.goalScore,
      desc: `You have reached ${s.goalScore}% of your "${v.goalType}" goal target.`,
    },
  ];
  document.getElementById("scoreCards").innerHTML = cards
    .map(
      (c) => `
    <div class="score-card">
      <div class="top"><span class="title">${c.title}</span><i data-lucide="${c.icon}"></i></div>
      <div class="value">${c.value}<span style="font-size:.9rem;color:var(--text-faint);"> /100</span></div>
      ${c.title === "Goal Progress" ? "" : `<div class="bar-track"><div class="bar-fill" style="width:${c.value}%;background:${scoreTag(c.value).color};"></div></div>`}
      <div class="desc">${c.desc}</div>
    </div>
  `,
    )
    .join("");

  const summary = [
    { icon: "wallet", label: "Monthly Income", val: v.income },
    { icon: "shopping-cart", label: "Monthly Expenses", val: v.expenses },
    { icon: "piggy-bank", label: "Monthly Savings", val: v.savings },
    { icon: "credit-card", label: "Total Debt", val: v.debt },
    { icon: "shield", label: "Emergency Fund", val: v.emergencyFund },
    { icon: "line-chart", label: "Investments", val: v.investments },
  ];
  document.getElementById("summaryCards").innerHTML = summary
    .map(
      (c) => `
    <div class="summary-card">
      <div class="icon"><i data-lucide="${c.icon}"></i></div>
      <div><div class="lbl">${c.label}</div><div class="amt">${formatINR(c.val)}</div></div>
    </div>
  `,
    )
    .join("");

  refreshIcons();
  drawDashboardCharts(v, s);
}

function drawDashboardCharts(v, s) {
  const ctxIES = document.getElementById("chartIES").getContext("2d");
  if (charts.ies) charts.ies.destroy();
  charts.ies = new Chart(ctxIES, {
    type: "bar",
    data: {
      labels: ["Income", "Expenses", "Savings"],
      datasets: [
        {
          data: [v.income, v.expenses, v.savings],
          backgroundColor: ["#22d3c8", "#f2707a", "#34d399"],
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#93a3bd" }, grid: { display: false } },
        y: {
          ticks: { color: "#93a3bd" },
          grid: { color: "rgba(255,255,255,.06)" },
        },
      },
    },
  });

  const spend = getSpendData();
  const ctxMini = document.getElementById("chartSpendMini").getContext("2d");
  if (charts.mini) charts.mini.destroy();
  const hasSpend = spend.total > 0;
  charts.mini = new Chart(ctxMini, {
    type: "doughnut",
    data: {
      labels: hasSpend ? spend.labels : ["No spending data yet"],
      datasets: [
        {
          data: hasSpend ? spend.values : [1],
          backgroundColor: hasSpend ? CAT_COLORS : ["#2a3550"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#93a3bd", boxWidth: 10, font: { size: 10 } },
        },
      },
    },
  });

  renderGoalProgress(v);
}

function renderGoalProgress(v) {
  const savedGoal = getGoals()[0];
  const goalTarget = Math.max(
    0,
    savedGoal ? savedGoal.target : v.goalTarget || 0,
  );
  const goalCurrent = Math.max(
    0,
    savedGoal ? savedGoal.current : v.goalCurrent || 0,
  );
  const goalPct =
    goalTarget > 0
      ? Math.min(100, Math.round((goalCurrent / goalTarget) * 100))
      : 0;
  const goalName = savedGoal
    ? savedGoal.name
    : goalTarget > 0
      ? v.goalType
      : "No financial goal set";
  document.getElementById("goalSummaryBox").innerHTML =
    `<span class="goal-name">${goalTarget > 0 ? goalName : "No financial goal set"}</span><span class="goal-amount">${goalTarget > 0 ? `${formatINR(goalCurrent)} saved of ${formatINR(goalTarget)}` : "Add a goal to start tracking progress."}</span>`;
  document.getElementById("goalProgressFill").style.width = `${goalPct}%`;
  document.getElementById("goalProgressLabel").textContent =
    `${goalPct}% complete`;
  document.getElementById("goalProgressRemaining").textContent =
    goalTarget > 0
      ? `${formatINR(Math.max(0, goalTarget - goalCurrent))} remaining`
      : "No goal set";
}

/* ============================================================
   SPENDING ANALYSIS
   ============================================================ */
function getSpendData() {
  const labels = [],
    values = [];
  document.querySelectorAll(".spend-input").forEach((inp) => {
    labels.push(inp.dataset.cat);
    values.push(parseFloat(inp.value) || 0);
  });
  const total = values.reduce((a, b) => a + b, 0);
  return { labels, values, total };
}

document
  .getElementById("analyzeSpendBtn")
  .addEventListener("click", function () {
    const spend = getSpendData();
    localStorage.setItem("fha_spending", JSON.stringify(spend));
    saveMonthlyAnalysisSnapshot();
    renderSpending(spend);
    renderBudget();
    renderMonthlyReport();
    renderProfile();
    if (lastValues) drawDashboardCharts(lastValues, lastScores);
    showToast("Spending analyzed.");
  });

function renderSpending(spend) {
  document.getElementById("spendTotalVal").textContent = formatINR(spend.total);

  const ctx = document.getElementById("chartSpendMain").getContext("2d");
  if (charts.spendMain) charts.spendMain.destroy();
  const hasData = spend.total > 0;
  charts.spendMain = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: hasData ? spend.labels : ["No data"],
      datasets: [
        {
          data: hasData ? spend.values : [1],
          backgroundColor: hasData ? CAT_COLORS : ["#2a3550"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  });

  const catList = document.getElementById("catList");
  if (!hasData) {
    catList.innerHTML =
      '<p style="color:var(--text-faint);font-size:.85rem;">Enter your spending by category to see the breakdown.</p>';
  } else {
    catList.innerHTML = spend.labels
      .map((label, i) => {
        const pct = Math.round((spend.values[i] / spend.total) * 100);
        return `<div class="cat-row">
        <span class="dotc" style="background:${CAT_COLORS[i]};"></span>
        <span class="name">${label}</span>
        <span class="pct">${pct}%</span>
        <span class="val">${formatINR(spend.values[i])}</span>
      </div>`;
      })
      .join("");
  }

  const insightsBox = document.getElementById("spendInsights");
  if (!hasData) {
    insightsBox.innerHTML = "";
    return;
  }

  const insights = [];
  const topIdx = spend.values.indexOf(Math.max(...spend.values));
  const topPct = Math.round((spend.values[topIdx] / spend.total) * 100);
  insights.push(
    `${spend.labels[topIdx]} represents ${topPct}% of your reported spending, the largest single category.`,
  );

  let essentialTotal = 0;
  spend.labels.forEach((label, i) => {
    if (ESSENTIAL_CATS.includes(label)) essentialTotal += spend.values[i];
  });
  const essentialPct = Math.round((essentialTotal / spend.total) * 100);
  insights.push(
    `Your essential expenses (Food, Bills, Healthcare, Transport) represent approximately ${essentialPct}% of your spending.`,
  );

  const discIdx = spend.labels.indexOf("Entertainment");
  const shopIdx = spend.labels.indexOf("Shopping");
  const discretionary =
    (spend.values[discIdx] || 0) + (spend.values[shopIdx] || 0);
  const discPct = Math.round((discretionary / spend.total) * 100);
  if (discPct > 20) {
    insights.push(
      `Discretionary spending on Shopping and Entertainment makes up approximately ${discPct}% of your total spending, which may be worth reviewing.`,
    );
  }

  insightsBox.innerHTML = insights
    .map(
      (msg) =>
        `<div class="insight-box"><i data-lucide="lightbulb"></i><span>${msg}</span></div>`,
    )
    .join("");
  refreshIcons();
}

/* ============================================================
   BUDGET PLANNER AND MONTHLY REPORT
   ============================================================ */
const BUDGET_CATS = ["Food", "Transport", "Shopping", "Bills", "Other"];

function getBudgets() {
  return JSON.parse(localStorage.getItem("fha_budgets") || "{}");
}

function getBudgetValues() {
  const budgets = {};
  document.querySelectorAll(".budget-input").forEach((input) => {
    budgets[input.dataset.cat] = parseFloat(input.value) || 0;
  });
  return budgets;
}

function renderBudget() {
  const budgets = getBudgets();
  const spending = getSpendData();
  const spendingByCategory = {};
  spending.labels.forEach((label, i) => {
    spendingByCategory[label] = spending.values[i];
  });

  document.querySelectorAll(".budget-input").forEach((input) => {
    if (Object.prototype.hasOwnProperty.call(budgets, input.dataset.cat))
      input.value = budgets[input.dataset.cat];
  });

  document.getElementById("budgetResults").innerHTML = BUDGET_CATS.map(
    (category) => {
      const budget = budgets[category] || 0;
      const spent = spendingByCategory[category] || 0;
      const remaining = budget - spent;
      const usedPct =
        budget > 0
          ? Math.min(100, Math.round((spent / budget) * 100))
          : spent > 0
            ? 100
            : 0;
      const isOver = remaining < 0;
      return `<div class="budget-result${isOver ? " over" : ""}">
      <h4>${category}</h4>
      <div class="budget-numbers"><span>Spent ${formatINR(spent)}</span><span>Plan ${formatINR(budget)}</span></div>
      <div class="budget-remaining">${isOver ? `${formatINR(Math.abs(remaining))} over` : `${formatINR(remaining)} left`}</div>
      <div class="budget-track"><div class="budget-fill" style="width:${usedPct}%;"></div></div>
    </div>`;
    },
  ).join("");
}

document.getElementById("budgetForm").addEventListener("submit", function (e) {
  e.preventDefault();
  localStorage.setItem("fha_budgets", JSON.stringify(getBudgetValues()));
  saveMonthlyAnalysisSnapshot();
  renderBudget();
  renderProfile();
  showToast("Monthly budget saved.");
});

function getPdfDocument() {
  return window.jspdf && window.jspdf.jsPDF ? new window.jspdf.jsPDF() : null;
}

function pdfMoney(value) {
  return `INR ${Math.round(value || 0).toLocaleString("en-IN")}`;
}

const PDF_COLORS = {
  navy: [11, 21, 38],
  teal: [34, 211, 200],
  ink: [31, 43, 61],
  muted: [93, 109, 138],
  pale: [239, 247, 250],
  line: [220, 229, 236],
  red: [217, 84, 92],
};

function pdfHeader(doc, title, subtitle) {
  doc.setFillColor(...PDF_COLORS.navy);
  doc.rect(0, 0, 210, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("Finora", 20, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Finance + Aura", 20, 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, 190, 17, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(subtitle, 190, 25, { align: "right" });
  doc.setTextColor(...PDF_COLORS.ink);
}

function pdfFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setDrawColor(...PDF_COLORS.line);
    doc.line(20, 285, 190, 285);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(
      "Finora - Finance + Aura | Browser-based personal finance prototype",
      20,
      292,
    );
    doc.text(`Page ${page} of ${pageCount}`, 190, 292, { align: "right" });
  }
  doc.setTextColor(...PDF_COLORS.ink);
}

function pdfSectionTitle(doc, title, y) {
  doc.setFillColor(...PDF_COLORS.teal);
  doc.roundedRect(20, y, 170, 9, 2, 2, "F");
  doc.setTextColor(...PDF_COLORS.navy);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(title, 25, y + 6);
  doc.setTextColor(...PDF_COLORS.ink);
}

function pdfTableHeader(doc, columns, y) {
  doc.setFillColor(...PDF_COLORS.pale);
  doc.rect(20, y - 6, 170, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.ink);
  columns.forEach((column) =>
    doc.text(column.label, column.x, y, { align: column.align || "left" }),
  );
}

function pdfTableRow(doc, cells, y, index, options = {}) {
  if (index % 2 === 1) {
    doc.setFillColor(249, 251, 252);
    doc.rect(20, y - 6, 170, 10, "F");
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  cells.forEach((cell) =>
    doc.text(String(cell.text), cell.x, y, { align: cell.align || "left" }),
  );
  doc.setDrawColor(...PDF_COLORS.line);
  doc.line(20, y + 4, 190, y + 4);
}

document
  .getElementById("downloadBudgetBtn")
  .addEventListener("click", function () {
    const doc = getPdfDocument();
    if (!doc) {
      showToast("PDF download is unavailable right now.");
      return;
    }
    const budgets = getBudgets();
    const spending = getSpendData();
    const spendingByCategory = {};
    spending.labels.forEach((label, i) => {
      spendingByCategory[label] = spending.values[i];
    });
    pdfHeader(
      doc,
      "Monthly Budget Plan",
      `Generated ${new Date().toLocaleDateString("en-IN")}`,
    );
    pdfSectionTitle(doc, "Budget versus reported spending", 48);
    pdfTableHeader(
      doc,
      [
        { label: "Category", x: 25 },
        { label: "Planned", x: 110, align: "right" },
        { label: "Spent", x: 145, align: "right" },
        { label: "Remaining", x: 185, align: "right" },
      ],
      69,
    );
    BUDGET_CATS.forEach((category, index) => {
      const y = 79 + index * 11;
      const budget = budgets[category] || 0;
      const spent = spendingByCategory[category] || 0;
      const remaining = budget - spent;
      pdfTableRow(
        doc,
        [
          { text: category, x: 25 },
          { text: pdfMoney(budget), x: 110, align: "right" },
          { text: pdfMoney(spent), x: 145, align: "right" },
          { text: pdfMoney(remaining), x: 185, align: "right" },
        ],
        y,
        index,
      );
      if (remaining < 0) {
        doc.setTextColor(...PDF_COLORS.red);
        doc.setFont("helvetica", "bold");
        doc.text("Over budget", 185, y + 8, { align: "right" });
        doc.setTextColor(...PDF_COLORS.ink);
      }
    });
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(
      "Remaining is calculated as planned budget minus reported spending.",
      20,
      145,
    );
    pdfFooter(doc);
    saveGeneratedPdf("budget", doc, "finora-monthly-budget.pdf");
    doc.save("finora-monthly-budget.pdf");
  });

function getReportAssessment() {
  const income = parseFloat(document.getElementById("income").value) || 0;
  if (income <= 0) return null;
  return {
    income,
    expenses: parseFloat(document.getElementById("expenses").value) || 0,
    savings: parseFloat(document.getElementById("savings").value) || 0,
    debt: parseFloat(document.getElementById("debt").value) || 0,
    emi: parseFloat(document.getElementById("emi").value) || 0,
    emergencyFund:
      parseFloat(document.getElementById("emergencyFund").value) || 0,
    investments: parseFloat(document.getElementById("investments").value) || 0,
    riskPreference: document.getElementById("riskPreference").value,
    goalType: document.getElementById("goalType").value,
    goalTimeline:
      parseFloat(document.getElementById("goalTimeline").value) || 0,
    goalTarget: parseFloat(document.getElementById("goalTarget").value) || 0,
    goalCurrent: parseFloat(document.getElementById("goalCurrent").value) || 0,
  };
}

function renderMonthlyReport() {
  const v = getReportAssessment();
  const summary = document.getElementById("reportSummary");
  const details = document.getElementById("reportDetails");
  const status = document.getElementById("reportStatus");
  if (!v) {
    status.textContent =
      "Complete your assessment to generate a full monthly report.";
    summary.innerHTML = "";
    details.innerHTML =
      '<p class="report-empty">Your report will appear here after you calculate your financial health.</p>';
    return;
  }
  const scores = computeScores(v);
  const spend = getSpendData();
  const goals = getGoals();
  status.textContent = `Report based on your current assessment and ${spend.total ? "reported spending" : "available financial details"}.`;
  summary.innerHTML = [
    ["Income", formatINR(v.income)],
    ["Expenses", formatINR(v.expenses)],
    ["Savings", formatINR(v.savings)],
    ["Total debt", formatINR(v.debt)],
    ["Goal progress", `${scores.goalScore}%`],
  ]
    .map(
      (item) =>
        `<div class="report-stat"><div class="label">${item[0]}</div><div class="value">${item[1]}</div></div>`,
    )
    .join("");

  const goalRows = goals.length
    ? goals
        .map((goal) => {
          const pct =
            goal.target > 0
              ? Math.min(100, Math.round((goal.current / goal.target) * 100))
              : 0;
          return `<tr><td>${goal.name}</td><td>${formatINR(goal.current)} / ${formatINR(goal.target)}</td><td>${pct}%</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="3">No additional saved goals yet.</td></tr>`;
  details.innerHTML = `<table class="report-table">
    <thead><tr><th>Financial measure</th><th>Value</th><th>Details</th></tr></thead>
    <tbody>
      <tr><td>Financial health score</td><td>${scores.overall} / 100</td><td>${scoreTag(scores.overall).label}</td></tr>
      <tr><td>Monthly EMI</td><td>${formatINR(v.emi)}</td><td>${Math.round(scores.emiRatio * 100)}% of income</td></tr>
      <tr><td>Emergency fund</td><td>${formatINR(v.emergencyFund)}</td><td>${scores.monthsCovered.toFixed(1)} months covered</td></tr>
      <tr><td>Investments</td><td>${formatINR(v.investments)}</td><td>Risk preference: ${v.riskPreference}</td></tr>
    </tbody>
  </table>
  <h3 style="font-size:1rem;margin:26px 0 8px;">Saved goal progress</h3>
  <table class="report-table"><thead><tr><th>Goal</th><th>Current / target</th><th>Progress</th></tr></thead><tbody>${goalRows}</tbody></table>`;
}

document
  .getElementById("downloadReportBtn")
  .addEventListener("click", function () {
    const doc = getPdfDocument();
    const v = getReportAssessment();
    if (!doc) {
      showToast("PDF download is unavailable right now.");
      return;
    }
    if (!v) {
      showToast("Complete the assessment before downloading a report.");
      return;
    }
    const scores = computeScores(v);
    const spend = getSpendData();
    const goals = getGoals();
    pdfHeader(
      doc,
      "Monthly Financial Report",
      `Generated ${new Date().toLocaleDateString("en-IN")}`,
    );
    pdfSectionTitle(doc, "Financial snapshot", 48);
    const rows = [
      ["Monthly income", pdfMoney(v.income)],
      ["Monthly expenses", pdfMoney(v.expenses)],
      ["Monthly savings", pdfMoney(v.savings)],
      ["Total debt", pdfMoney(v.debt)],
      ["Monthly EMI", pdfMoney(v.emi)],
      ["Emergency fund", pdfMoney(v.emergencyFund)],
      ["Investments", pdfMoney(v.investments)],
      ["Financial health score", `${scores.overall} / 100`],
      ["Goal progress", `${scores.goalScore}%`],
      ["Reported spending", pdfMoney(spend.total)],
    ];
    pdfTableHeader(
      doc,
      [
        { label: "Financial measure", x: 25 },
        { label: "Value", x: 185, align: "right" },
      ],
      69,
    );
    rows.forEach((row, index) => {
      const y = 79 + index * 10;
      pdfTableRow(
        doc,
        [
          { text: row[0], x: 25 },
          { text: row[1], x: 185, align: "right" },
        ],
        y,
        index,
      );
    });
    let y = 190;
    pdfSectionTitle(doc, "Saved goal progress", y);
    pdfTableHeader(
      doc,
      [
        { label: "Goal", x: 25 },
        { label: "Current / target", x: 125 },
        { label: "Progress", x: 185, align: "right" },
      ],
      y + 20,
    );
    if (!goals.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("No additional saved goals.", 25, y + 34);
    } else {
      let goalRowY = y + 30;
      goals.forEach((goal, index) => {
        if (goalRowY > 270) {
          doc.addPage();
          pdfHeader(
            doc,
            "Monthly Financial Report",
            "Saved goal progress continued",
          );
          pdfSectionTitle(doc, "Saved goal progress continued", 48);
          pdfTableHeader(
            doc,
            [
              { label: "Goal", x: 25 },
              { label: "Current / target", x: 125 },
              { label: "Progress", x: 185, align: "right" },
            ],
            69,
          );
          goalRowY = 88;
        }
        const pct =
          goal.target > 0
            ? Math.min(100, Math.round((goal.current / goal.target) * 100))
            : 0;
        pdfTableRow(
          doc,
          [
            { text: goal.name, x: 25 },
            {
              text: `${pdfMoney(goal.current)} / ${pdfMoney(goal.target)}`,
              x: 125,
            },
            { text: `${pct}%`, x: 185, align: "right" },
          ],
          goalRowY,
          index,
        );
        goalRowY += 11;
      });
    }
    pdfFooter(doc);
    saveGeneratedPdf("report", doc, "finora-monthly-financial-report.pdf");
    doc.save("finora-monthly-financial-report.pdf");
  });

/* ============================================================
   RECOMMENDATION ENGINE â€” rule-based, explainable
   ============================================================ */
function renderRecommendations(v, s) {
  const recs = [];

  if (s.savingsRate < 0.15) {
    recs.push({
      icon: "piggy-bank",
      tone: "amber",
      title: "Increase your savings rate",
      text: "Your current savings rate is relatively low. Reviewing discretionary expenses may help increase monthly savings.",
      why: `Your savings rate is approximately ${Math.round(s.savingsRate * 100)}% of your monthly income, below the healthy 15â€“20% benchmark used in this assessment.`,
    });
  }
  if (s.monthsCovered < 3) {
    recs.push({
      icon: "shield-alert",
      tone: "red",
      title: "Build your emergency fund",
      text: "Your emergency fund currently covers less than approximately 3 months of reported expenses. Consider gradually building an emergency reserve.",
      why: `Your emergency fund covers approximately ${s.monthsCovered.toFixed(1)} months of reported expenses, below the recommended 3â€“6 month buffer.`,
    });
  }
  const expenseRatio = v.income > 0 ? v.expenses / v.income : 0;
  if (expenseRatio > 0.7) {
    recs.push({
      icon: "wallet",
      tone: "amber",
      title: "Review recurring expenses",
      text: "A large portion of your income is currently allocated to expenses. Reviewing recurring and discretionary expenses may improve cash-flow stability.",
      why: `Your monthly expenses are approximately ${Math.round(expenseRatio * 100)}% of your monthly income.`,
    });
  }
  if (s.emiRatio > 0.35) {
    recs.push({
      icon: "credit-card",
      tone: "red",
      title: "Reassess debt obligations",
      text: "Your current debt obligations may be placing pressure on your monthly cash flow. Reviewing repayment priorities may improve financial stability.",
      why: `Your monthly EMI is approximately ${Math.round(s.emiRatio * 100)}% of your monthly income, above the commonly used 35% affordability threshold.`,
    });
  }
  if (s.goalScore >= 60) {
    recs.push({
      icon: "trending-up",
      tone: "emerald",
      title: "Keep up your goal progress",
      text: "Your current progress indicates that you are moving steadily toward your selected financial goal.",
      why: `You have reached ${s.goalScore}% of your "${v.goalType}" target of ${formatINR(v.goalTarget)}.`,
    });
  }
  if (recs.length === 0) {
    recs.push({
      icon: "check-circle-2",
      tone: "emerald",
      title: "Your financial health looks balanced",
      text: "Based on the figures you entered, your cash flow, savings, debt and emergency fund all fall within healthy ranges.",
      why: "No individual indicator crossed the rule-based thresholds used to flag a concern in this assessment.",
    });
  }

  const toneColor = {
    amber: "var(--amber)",
    red: "var(--red)",
    emerald: "var(--emerald)",
  };
  document.getElementById("recEmpty").classList.add("hidden");
  const list = document.getElementById("recList");
  list.classList.remove("hidden");
  list.innerHTML = recs
    .map(
      (r, i) => `
    <div class="rec-card">
      <div class="rec-top">
        <div class="icon" style="background:${toneColor[r.tone]}22;"><i data-lucide="${r.icon}" style="color:${toneColor[r.tone]};"></i></div>
        <div class="body">
          <h4>${r.title}</h4>
          <p>${r.text}</p>
          <button class="rec-toggle" onclick="toggleWhy(${i})"><i data-lucide="chevron-down" id="chev-${i}"></i>Why am I seeing this?</button>
          <div class="rec-why" id="why-${i}">${r.why}</div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
  refreshIcons();
}
function toggleWhy(i) {
  const el = document.getElementById("why-" + i);
  const chev = document.getElementById("chev-" + i);
  el.classList.toggle("open");
  chev.style.transform = el.classList.contains("open")
    ? "rotate(180deg)"
    : "rotate(0deg)";
}

/* ============================================================
   GOALS â€” stored in LocalStorage
   ============================================================ */
function getGoals() {
  return JSON.parse(localStorage.getItem("fha_goals") || "[]");
}
function saveGoals(goals) {
  localStorage.setItem("fha_goals", JSON.stringify(goals));
}

document.getElementById("goalForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const name = document.getElementById("gName").value.trim();
  const target = parseFloat(document.getElementById("gTarget").value);
  const current = parseFloat(document.getElementById("gCurrent").value);
  const date = document.getElementById("gDate").value;
  if (!name || !(target > 0) || current < 0 || !date) {
    showToast("Please fill all goal fields correctly.");
    return;
  }

  const goals = getGoals();
  goals.push({ id: Date.now(), name, target, current, date });
  saveGoals(goals);
  saveMonthlyAnalysisSnapshot();
  renderGoals();
  renderMonthlyReport();
  renderProfile();
  this.reset();
  showToast("Goal added.");
});

function deleteGoal(id) {
  const goals = getGoals().filter((g) => g.id !== id);
  saveGoals(goals);
  saveMonthlyAnalysisSnapshot();
  renderGoals();
  renderMonthlyReport();
  renderProfile();
  showToast("Goal deleted.");
}

function renderGoals() {
  const goals = getGoals();
  const grid = document.getElementById("goalsGrid");
  const empty = document.getElementById("goalsEmpty");
  const assessment = getReportAssessment();
  if (goals.length === 0) {
    empty.classList.remove("hidden");
    grid.innerHTML = "";
    if (assessment) renderGoalProgress(assessment);
    return;
  }
  empty.classList.add("hidden");

  grid.innerHTML = goals
    .map((g) => {
      const pct = Math.min(100, Math.round((g.current / g.target) * 100));
      const remaining = Math.max(0, g.target - g.current);
      return `<div class="goal-card">
      <div class="head">
        <h4>${g.name}</h4>
        <button class="del" onclick="deleteGoal(${g.id})"><i data-lucide="trash-2"></i></button>
      </div>
      <div class="goal-amounts"><span>${formatINR(g.current)} / ${formatINR(g.target)}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;"></div></div>
      <div class="goal-pct"><span>${pct}% Complete</span><span>${formatINR(remaining)} Remaining</span></div>
    </div>`;
    })
    .join("");
  refreshIcons();
  if (assessment) renderGoalProgress(assessment);
}

/* ---------- CLEAR DATA ---------- */
document.getElementById("clearDataBtn").addEventListener("click", function () {
  if (
    confirm(
      "This will permanently delete your saved assessment, spending data and goals from this browser. Continue?",
    )
  ) {
    localStorage.removeItem("fha_assessment");
    localStorage.removeItem("fha_spending");
    localStorage.removeItem("fha_budgets");
    localStorage.removeItem("fha_goals");
    localStorage.removeItem(SAVED_PDFS_KEY);
    localStorage.removeItem(MONTHLY_ANALYSES_KEY);
    localStorage.removeItem(MONTHLY_DOCUMENTS_KEY);
    showToast("All local data cleared.");
    setTimeout(() => location.reload(), 700);
  }
});

/* ---------- RESTORE FROM LOCALSTORAGE ON LOAD ---------- */
function restoreFromStorage() {
  const savedAssessment = localStorage.getItem("fha_assessment");
  if (savedAssessment) {
    const v = JSON.parse(savedAssessment);
    Object.keys(v).forEach((key) => {
      const el = document.getElementById(key);
      if (el) el.value = v[key];
    });
    lastValues = v;
    lastScores = computeScores(v);
    renderDashboard(v, lastScores);
    renderRecommendations(v, lastScores);
  }
  const savedSpend = localStorage.getItem("fha_spending");
  if (savedSpend) {
    const spend = JSON.parse(savedSpend);
    spend.labels.forEach((label, i) => {
      const inp = document.querySelector(`.spend-input[data-cat="${label}"]`);
      if (inp) inp.value = spend.values[i];
    });
    renderSpending(spend);
  } else {
    renderSpending(getSpendData());
  }
  renderBudget();
  renderMonthlyReport();
  renderGoals();
  renderProfile();
}
restoreFromStorage();
