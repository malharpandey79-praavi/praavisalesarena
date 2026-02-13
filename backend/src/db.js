const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const config = require("./config");
const { calculateIncentive } = require("./incentives");

const salesUsers = ["Vishal", "Aryan"];
const leadStatusValues = [
  "New",
  "Follow-up",
  "Interested",
  "Will Call Back",
  "Call Not Received",
  "Not Interested",
  "Closed",
  "Lost",
];

const callOutcomeValues = [
  "Connected",
  "Interested",
  "Not Interested",
  "Will Call Back",
  "Call Not Received",
  "Demo Booked",
];

const dataDir = path.join(__dirname, "..", "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const configuredDbPath = String(config.sqlitePath || "").trim();
const dbPath = configuredDbPath ? path.resolve(configuredDbPath) : path.join(dataDir, "sales.db");
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    privyr_lead_id TEXT UNIQUE,
    name TEXT,
    phone TEXT,
    email TEXT,
    source TEXT,
    created_at TEXT,
    received_at TEXT NOT NULL,
    assigned_to TEXT,
    status TEXT DEFAULT 'New',
    call_outcome TEXT,
    demo_booked INTEGER DEFAULT 0,
    notes TEXT,
    last_contacted_at TEXT,
    next_followup_at TEXT,
    last_activity_at TEXT,
    updated_at TEXT,
    closed_by TEXT,
    closure_date TEXT,
    closure_type TEXT,
    revenue REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS daily_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL,
    date TEXT NOT NULL,
    followups_done INTEGER DEFAULT 0,
    closures_today INTEGER DEFAULT 0,
    website_closures_today INTEGER DEFAULT 0,
    revenue_today REAL DEFAULT 0,
    calls_done_today INTEGER DEFAULT 0,
    demo_meetings_booked INTEGER DEFAULT 0,
    not_interested INTEGER DEFAULT 0,
    interested INTEGER DEFAULT 0,
    will_call_back INTEGER DEFAULT 0,
    calls_not_received INTEGER DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE(user, date)
  );

  CREATE TABLE IF NOT EXISTS lead_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    activity_type TEXT NOT NULL,
    outcome TEXT,
    notes TEXT,
    next_followup_at TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS monthly_revenue_targets (
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    revenue_target REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (month, year)
  );
`);

function ensureColumn(tableName, columnName, definitionSql) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = rows.some((row) => row.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
  }
}

ensureColumn("daily_updates", "calls_done_today", "INTEGER DEFAULT 0");
ensureColumn("daily_updates", "demo_meetings_booked", "INTEGER DEFAULT 0");
ensureColumn("daily_updates", "not_interested", "INTEGER DEFAULT 0");
ensureColumn("daily_updates", "interested", "INTEGER DEFAULT 0");
ensureColumn("daily_updates", "will_call_back", "INTEGER DEFAULT 0");
ensureColumn("daily_updates", "calls_not_received", "INTEGER DEFAULT 0");

ensureColumn("leads", "call_outcome", "TEXT");
ensureColumn("leads", "demo_booked", "INTEGER DEFAULT 0");
ensureColumn("leads", "notes", "TEXT");
ensureColumn("leads", "last_contacted_at", "TEXT");
ensureColumn("leads", "next_followup_at", "TEXT");
ensureColumn("leads", "last_activity_at", "TEXT");
ensureColumn("leads", "updated_at", "TEXT");

db.prepare("INSERT OR IGNORE INTO app_state (key, value) VALUES ('next_assignee', '0')").run();

function formatDateInTimezone(date = new Date(), timezone = config.timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function parseTimestamp(value) {
  const candidate = value ? new Date(value) : new Date();
  if (Number.isNaN(candidate.getTime())) {
    return new Date().toISOString();
  }
  return candidate.toISOString();
}

function parseNullableTimestamp(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const candidate = new Date(value);
  if (Number.isNaN(candidate.getTime())) {
    return null;
  }
  return candidate.toISOString();
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseIntSafe(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, parsed);
}

function parseBooleanToInt(value) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  const parsed = parseIntSafe(value);
  return parsed > 0 ? 1 : 0;
}

function normalizeStatus(status) {
  const candidate = String(status || "").trim();
  if (!candidate) return "New";
  return candidate;
}

function normalizeCallOutcome(outcome) {
  const candidate = String(outcome || "").trim();
  if (!candidate) return null;
  return candidate;
}

function safePercent(numerator, denominator) {
  const n = parseNumber(numerator);
  const d = parseNumber(denominator);
  if (d <= 0) return 0;
  return Number(((n / d) * 100).toFixed(2));
}

function parseMonthValue(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    throw new Error("Invalid month");
  }
  return parsed;
}

function parseYearValue(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    throw new Error("Invalid year");
  }
  return parsed;
}

function getMonthContext(dateString) {
  const fallbackDate = formatDateInTimezone(new Date());
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ""))
    ? String(dateString)
    : fallbackDate;

  const year = parseYearValue(candidate.slice(0, 4));
  const month = parseMonthValue(candidate.slice(5, 7));
  const dayValue = Number.parseInt(candidate.slice(8, 10), 10);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Number.isInteger(dayValue) ? Math.min(Math.max(dayValue, 1), daysInMonth) : 1;
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

  return {
    year,
    month,
    day,
    monthPrefix,
    monthStart: `${monthPrefix}-01`,
    monthEnd: `${monthPrefix}-${String(daysInMonth).padStart(2, "0")}`,
    daysInMonth,
    daysElapsed: day,
    daysRemaining: Math.max(daysInMonth - day, 0),
  };
}

function getMonthlyRevenueTarget(year, month) {
  const normalizedYear = parseYearValue(year);
  const normalizedMonth = parseMonthValue(month);
  const row = db
    .prepare(
      `
      SELECT month, year, revenue_target, updated_at
      FROM monthly_revenue_targets
      WHERE month = ? AND year = ?
    `
    )
    .get(normalizedMonth, normalizedYear);

  return {
    month: normalizedMonth,
    year: normalizedYear,
    revenueTarget: parseNumber(row?.revenue_target),
    updatedAt: row?.updated_at || null,
  };
}

function upsertMonthlyRevenueTarget({ month, year, revenueTarget }) {
  const normalizedMonth = parseMonthValue(month);
  const normalizedYear = parseYearValue(year);
  const normalizedTarget = Math.max(0, parseNumber(revenueTarget));
  const nowIso = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO monthly_revenue_targets (month, year, revenue_target, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(month, year)
    DO UPDATE SET
      revenue_target = excluded.revenue_target,
      updated_at = excluded.updated_at
  `
  ).run(normalizedMonth, normalizedYear, normalizedTarget, nowIso);

  return getMonthlyRevenueTarget(normalizedYear, normalizedMonth);
}

function getMonthlyRevenueByUser(monthStart, monthToDateEnd) {
  const rows = db
    .prepare(
      `
      SELECT user, SUM(revenue_today) as revenue
      FROM daily_updates
      WHERE date >= ? AND date <= ?
      GROUP BY user
    `
    )
    .all(monthStart, monthToDateEnd);

  const byUser = new Map(
    rows.map((row) => [String(row.user || "").trim(), parseNumber(row.revenue)])
  );

  return salesUsers.map((name) => ({
    name,
    revenue: byUser.get(name) || 0,
  }));
}

function getRevenueByDateRange(startDate, endDate) {
  return db
    .prepare(
      `
      SELECT date, SUM(revenue_today) as daily_revenue
      FROM daily_updates
      WHERE date >= ? AND date <= ?
      GROUP BY date
      ORDER BY date ASC
    `
    )
    .all(startDate, endDate)
    .map((row) => ({
      date: row.date,
      dailyRevenue: parseNumber(row.daily_revenue),
    }));
}

function buildMonthlyRevenueTrend(context, targetValue) {
  const monthToDateEnd = `${context.monthPrefix}-${String(context.day).padStart(2, "0")}`;
  const byDate = new Map(
    getRevenueByDateRange(context.monthStart, monthToDateEnd).map((row) => [row.date, row.dailyRevenue])
  );

  const points = [];
  let cumulativeRevenue = 0;
  for (let day = 1; day <= context.daysElapsed; day += 1) {
    const date = `${context.monthPrefix}-${String(day).padStart(2, "0")}`;
    const dailyRevenue = byDate.get(date) || 0;
    cumulativeRevenue += dailyRevenue;

    points.push({
      date,
      day,
      dailyRevenue: Number(dailyRevenue.toFixed(2)),
      cumulativeRevenue: Number(cumulativeRevenue.toFixed(2)),
      targetPaceRevenue:
        targetValue > 0 ? Number(((targetValue / context.daysInMonth) * day).toFixed(2)) : 0,
    });
  }

  return points;
}

function getCallTotalsForRange(startDate, endDate) {
  const row = db
    .prepare(
      `
      SELECT
        SUM(calls_done_today) as calls_done,
        SUM(interested) as interested,
        SUM(not_interested) as not_interested,
        SUM(will_call_back) as will_call_back,
        SUM(calls_not_received) as calls_not_received
      FROM daily_updates
      WHERE date >= ? AND date <= ?
    `
    )
    .get(startDate, endDate);

  return {
    callsDone: parseIntSafe(row?.calls_done),
    interested: parseIntSafe(row?.interested),
    notInterested: parseIntSafe(row?.not_interested),
    willCallBack: parseIntSafe(row?.will_call_back),
    callsNotReceived: parseIntSafe(row?.calls_not_received),
  };
}

function buildCallMixSummary({
  callsDone = 0,
  interested = 0,
  notInterested = 0,
  willCallBack = 0,
  callsNotReceived = 0,
}) {
  const normalized = {
    callsDone: parseIntSafe(callsDone),
    interested: parseIntSafe(interested),
    notInterested: parseIntSafe(notInterested),
    willCallBack: parseIntSafe(willCallBack),
    callsNotReceived: parseIntSafe(callsNotReceived),
  };

  const callAttempts = normalized.callsDone + normalized.callsNotReceived;
  const callsNotConnected = normalized.callsNotReceived + normalized.willCallBack;
  const callsConnected = Math.max(normalized.callsDone - normalized.willCallBack, 0);

  const rawSlices = [
    { key: "callsDone", label: "Calls Done", value: callAttempts },
    { key: "callsConnected", label: "Calls Connected", value: callsConnected },
    { key: "callsInterested", label: "Calls Interested", value: normalized.interested },
    { key: "callsNotInterested", label: "Calls Not Interested", value: normalized.notInterested },
    { key: "callsNotConnected", label: "Calls Not Connected", value: callsNotConnected },
  ];

  const totalForPie = rawSlices.reduce((sum, item) => sum + item.value, 0);
  return {
    ...normalized,
    callAttempts,
    totalForPie,
    slices: rawSlices.map((item) => ({
      ...item,
      percentage: safePercent(item.value, totalForPie),
    })),
  };
}

function getMonthlyRevenueGoalSummary(dateString) {
  const context = getMonthContext(dateString);
  const target = getMonthlyRevenueTarget(context.year, context.month);
  const monthToDateEnd = `${context.monthPrefix}-${String(context.day).padStart(2, "0")}`;
  const contributionByUserRaw = getMonthlyRevenueByUser(context.monthStart, monthToDateEnd);
  const currentMtdRevenue = contributionByUserRaw.reduce((sum, item) => sum + item.revenue, 0);
  const targetValue = parseNumber(target.revenueTarget);
  const percentageAchieved =
    targetValue > 0 ? Number(((currentMtdRevenue / targetValue) * 100).toFixed(2)) : 0;
  const remainingRevenue = Math.max(targetValue - currentMtdRevenue, 0);
  const averageDailyRevenue =
    context.daysElapsed > 0 ? Number((currentMtdRevenue / context.daysElapsed).toFixed(2)) : 0;
  const projectedMonthEndRevenue = Number(
    (currentMtdRevenue + averageDailyRevenue * context.daysRemaining).toFixed(2)
  );

  return {
    month: context.month,
    year: context.year,
    monthKey: context.monthPrefix,
    target: targetValue,
    targetUpdatedAt: target.updatedAt,
    targetSet: targetValue > 0,
    currentMtdRevenue: Number(currentMtdRevenue.toFixed(2)),
    remainingRevenue: Number(remainingRevenue.toFixed(2)),
    percentageAchieved,
    isTargetAchieved: targetValue > 0 && currentMtdRevenue >= targetValue,
    contributionByUser: contributionByUserRaw.map((item) => ({
      name: item.name,
      revenue: Number(item.revenue.toFixed(2)),
      percentage: safePercent(item.revenue, currentMtdRevenue),
    })),
    projection: {
      daysInMonth: context.daysInMonth,
      daysElapsed: context.daysElapsed,
      daysRemaining: context.daysRemaining,
      averageDailyRevenue,
      projectedMonthEndRevenue,
      isAboveTarget: targetValue > 0 && projectedMonthEndRevenue >= targetValue,
    },
    revenueTrend: buildMonthlyRevenueTrend(context, targetValue),
  };
}

function previousDate(dateString) {
  const cursor = new Date(`${dateString}T00:00:00`);
  cursor.setDate(cursor.getDate() - 1);
  return cursor.toISOString().slice(0, 10);
}

function calculateStreak(user, dateString) {
  const rows = db
    .prepare(
      `
      SELECT date, website_closures_today
      FROM daily_updates
      WHERE user = ? AND date <= ?
      ORDER BY date DESC
    `
    )
    .all(user, dateString);

  const byDate = new Map(rows.map((row) => [row.date, row.website_closures_today]));
  let streak = 0;
  let cursor = dateString;

  while (true) {
    const closures = byDate.get(cursor) || 0;
    if (closures <= 0) {
      break;
    }
    streak += 1;
    cursor = previousDate(cursor);
  }

  return streak;
}

function withTransaction(work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function getLeadById(leadId) {
  return db
    .prepare(
      `
      SELECT
        id, privyr_lead_id, name, phone, email, source, created_at, received_at,
        assigned_to, status, call_outcome, demo_booked, notes, last_contacted_at,
        next_followup_at, last_activity_at, updated_at, closed_by, closure_date,
        closure_type, revenue
      FROM leads
      WHERE id = ?
    `
    )
    .get(leadId);
}

function insertLeadActivity({ leadId, activityType, outcome, notes, nextFollowupAt, createdBy }) {
  const nowIso = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO lead_activities (
      lead_id,
      activity_type,
      outcome,
      notes,
      next_followup_at,
      created_by,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(leadId, activityType, outcome || null, notes || null, nextFollowupAt || null, createdBy, nowIso);
}

function insertLeadFromPrivyr(incomingPayload) {
  return withTransaction(() => {
    const payload = incomingPayload && typeof incomingPayload === "object" ? incomingPayload : {};
    const normalized = payload.lead || payload.data || payload;

    // Webhook payload handling:
    // Privyr payload structures vary, so we normalize the common lead fields here.
    let privyrLeadId = String(normalized.lead_id || normalized.id || "").trim();
    if (!privyrLeadId) {
      privyrLeadId = `generated-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    }

    const existing = db.prepare("SELECT * FROM leads WHERE privyr_lead_id = ?").get(privyrLeadId);
    if (existing) {
      return {
        duplicate: true,
        lead: existing,
      };
    }

    const nextAssigneeState = db.prepare("SELECT value FROM app_state WHERE key = 'next_assignee'").get();
    const nextIndex = parseIntSafe(nextAssigneeState?.value || "0");
    const assignedTo = salesUsers[nextIndex % salesUsers.length];
    const incrementedIndex = (nextIndex + 1) % salesUsers.length;

    const nowIso = new Date().toISOString();
    const createdAt = parseTimestamp(normalized.created_at);

    // Database storage:
    // Every inbound Privyr lead is persisted with assignment and default lifecycle tracking fields.
    const result = db
      .prepare(
        `
        INSERT INTO leads (
          privyr_lead_id,
          name,
          phone,
          email,
          source,
          created_at,
          received_at,
          assigned_to,
          status,
          call_outcome,
          demo_booked,
          notes,
          last_contacted_at,
          next_followup_at,
          last_activity_at,
          updated_at,
          closed_by,
          closure_date,
          closure_type,
          revenue
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'New', NULL, 0, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL, 0)
      `
      )
      .run(
        privyrLeadId,
        normalized.name || "",
        normalized.phone || "",
        normalized.email || "",
        normalized.source || "",
        createdAt,
        nowIso,
        assignedTo,
        nowIso,
        nowIso
      );

    db.prepare("UPDATE app_state SET value = ? WHERE key = 'next_assignee'").run(String(incrementedIndex));
    insertLeadActivity({
      leadId: result.lastInsertRowid,
      activityType: "Lead Created",
      outcome: "New",
      notes: "Lead received from Privyr webhook",
      nextFollowupAt: null,
      createdBy: "SYSTEM",
    });

    const lead = getLeadById(result.lastInsertRowid);
    return {
      duplicate: false,
      lead,
    };
  });
}

function upsertDailyUpdate({
  user,
  date,
  followupsDone,
  closuresToday,
  websiteClosuresToday,
  revenueToday,
  callsDoneToday,
  demoMeetingsBooked,
  notInterested,
  interested,
  willCallBack,
  callsNotReceived,
}) {
  const nowIso = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO daily_updates (
      user,
      date,
      followups_done,
      closures_today,
      website_closures_today,
      revenue_today,
      calls_done_today,
      demo_meetings_booked,
      not_interested,
      interested,
      will_call_back,
      calls_not_received,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user, date)
    DO UPDATE SET
      followups_done = excluded.followups_done,
      closures_today = excluded.closures_today,
      website_closures_today = excluded.website_closures_today,
      revenue_today = excluded.revenue_today,
      calls_done_today = excluded.calls_done_today,
      demo_meetings_booked = excluded.demo_meetings_booked,
      not_interested = excluded.not_interested,
      interested = excluded.interested,
      will_call_back = excluded.will_call_back,
      calls_not_received = excluded.calls_not_received,
      updated_at = excluded.updated_at
  `
  ).run(
    user,
    date,
    parseIntSafe(followupsDone),
    parseIntSafe(closuresToday),
    parseIntSafe(websiteClosuresToday),
    parseNumber(revenueToday),
    parseIntSafe(callsDoneToday),
    parseIntSafe(demoMeetingsBooked),
    parseIntSafe(notInterested),
    parseIntSafe(interested),
    parseIntSafe(willCallBack),
    parseIntSafe(callsNotReceived),
    nowIso
  );

  return getDashboardSummary(date);
}

function getLeadsByUserForDate(dateString) {
  const rows = db
    .prepare(
      `
      SELECT assigned_to, COUNT(*) as lead_count
      FROM leads
      WHERE substr(received_at, 1, 10) = ?
      GROUP BY assigned_to
    `
    )
    .all(dateString);

  const map = new Map(rows.map((row) => [row.assigned_to, row.lead_count]));
  return {
    Vishal: map.get("Vishal") || 0,
    Aryan: map.get("Aryan") || 0,
  };
}

function getUpdatesForDate(dateString) {
  const rows = db
    .prepare(
      `
      SELECT
        user,
        followups_done,
        closures_today,
        website_closures_today,
        revenue_today,
        calls_done_today,
        demo_meetings_booked,
        not_interested,
        interested,
        will_call_back,
        calls_not_received,
        updated_at
      FROM daily_updates
      WHERE date = ?
    `
    )
    .all(dateString);

  const map = new Map(rows.map((row) => [row.user, row]));
  return {
    Vishal: map.get("Vishal") || null,
    Aryan: map.get("Aryan") || null,
  };
}

function getLeadPipelineAnalytics(dateString) {
  const statusBreakdown = db
    .prepare(
      `
      SELECT status, COUNT(*) as count
      FROM leads
      WHERE substr(received_at, 1, 10) = ?
      GROUP BY status
      ORDER BY count DESC
    `
    )
    .all(dateString)
    .map((row) => ({ status: row.status || "Unknown", count: row.count }));

  const sourceBreakdown = db
    .prepare(
      `
      SELECT source, COUNT(*) as count
      FROM leads
      WHERE substr(received_at, 1, 10) = ?
      GROUP BY source
      ORDER BY count DESC
    `
    )
    .all(dateString)
    .map((row) => ({ source: row.source || "Unknown", count: row.count }));

  const openPipeline = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM leads
      WHERE status NOT IN ('Closed', 'Lost', 'Not Interested')
    `
    )
    .get()?.count;

  const overdueFollowups = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM leads
      WHERE next_followup_at IS NOT NULL
        AND next_followup_at < ?
        AND status NOT IN ('Closed', 'Lost', 'Not Interested')
    `
    )
    .get(new Date().toISOString())?.count;

  return {
    statusBreakdown,
    sourceBreakdown,
    openPipeline: openPipeline || 0,
    overdueFollowups: overdueFollowups || 0,
  };
}

function getDashboardSummary(dateString = formatDateInTimezone(new Date())) {
  const leadsByUser = getLeadsByUserForDate(dateString);
  const updates = getUpdatesForDate(dateString);
  const monthContext = getMonthContext(dateString);
  const monthlyRevenueGoal = getMonthlyRevenueGoalSummary(dateString);

  const userStats = salesUsers.map((user) => {
    const update = updates[user] || {};
    const websiteClosures = parseIntSafe(update.website_closures_today);
    const callsDone = parseIntSafe(update.calls_done_today);
    const callsNotReceived = parseIntSafe(update.calls_not_received);
    const interestedCount = parseIntSafe(update.interested);
    const demoBookedCount = parseIntSafe(update.demo_meetings_booked);
    const incentive = calculateIncentive(websiteClosures);
    const progressTo20 = Math.min((websiteClosures / 20) * 100, 100);

    return {
      name: user,
      totalLeadsToday: leadsByUser[user] || 0,
      followupsDone: parseIntSafe(update.followups_done),
      closuresToday: parseIntSafe(update.closures_today),
      websiteClosuresToday: websiteClosures,
      revenueToday: parseNumber(update.revenue_today),
      callsDoneToday: callsDone,
      demoMeetingsBooked: demoBookedCount,
      notInterested: parseIntSafe(update.not_interested),
      interested: interestedCount,
      willCallBack: parseIntSafe(update.will_call_back),
      callsNotReceived,
      incentivesEarned: incentive.amount,
      slabUnlocked: incentive.unlockedBonusSlab,
      progressTo20,
      streak: calculateStreak(user, dateString),
      callConnectRate: safePercent(callsDone, callsDone + callsNotReceived),
      interestRate: safePercent(interestedCount, callsDone),
      demoBookingRate: safePercent(demoBookedCount, interestedCount),
      updatedAt: update.updated_at || null,
    };
  });

  const totals = userStats.reduce(
    (acc, user) => {
      acc.closures += user.closuresToday;
      acc.websiteClosures += user.websiteClosuresToday;
      acc.revenue += user.revenueToday;
      acc.incentives += user.incentivesEarned;
      acc.callsDone += user.callsDoneToday;
      acc.demoMeetingsBooked += user.demoMeetingsBooked;
      acc.notInterested += user.notInterested;
      acc.interested += user.interested;
      acc.willCallBack += user.willCallBack;
      acc.callsNotReceived += user.callsNotReceived;
      return acc;
    },
    {
      closures: 0,
      websiteClosures: 0,
      revenue: 0,
      incentives: 0,
      callsDone: 0,
      demoMeetingsBooked: 0,
      notInterested: 0,
      interested: 0,
      willCallBack: 0,
      callsNotReceived: 0,
    }
  );

  const leadsReceivedToday = db
    .prepare("SELECT COUNT(*) as count FROM leads WHERE substr(received_at, 1, 10) = ?")
    .get(dateString)?.count;

  let leader = null;
  if (userStats[0].websiteClosuresToday !== userStats[1].websiteClosuresToday) {
    leader =
      userStats[0].websiteClosuresToday > userStats[1].websiteClosuresToday
        ? userStats[0].name
        : userStats[1].name;
  }

  const totalCallAttempts = totals.callsDone + totals.callsNotReceived;
  const analytics = {
    teamCallAttempts: totalCallAttempts,
    teamCallConnectRate: safePercent(totals.callsDone, totalCallAttempts),
    teamInterestRate: safePercent(totals.interested, totals.callsDone),
    teamDemoBookingRate: safePercent(totals.demoMeetingsBooked, totals.interested),
    teamClosureFromInterestedRate: safePercent(totals.closures, totals.interested),
  };

  const monthToDateEnd = `${monthContext.monthPrefix}-${String(monthContext.day).padStart(2, "0")}`;
  const monthlyCallTotals = getCallTotalsForRange(monthContext.monthStart, monthToDateEnd);
  const callInsights = {
    daily: buildCallMixSummary({
      callsDone: totals.callsDone,
      interested: totals.interested,
      notInterested: totals.notInterested,
      willCallBack: totals.willCallBack,
      callsNotReceived: totals.callsNotReceived,
    }),
    monthly: buildCallMixSummary(monthlyCallTotals),
  };

  return {
    date: dateString,
    totals: {
      leadsReceivedToday: leadsReceivedToday || 0,
      closures: totals.closures,
      websiteClosures: totals.websiteClosures,
      revenue: totals.revenue,
      incentives: totals.incentives,
      callsDone: totals.callsDone,
      demoMeetingsBooked: totals.demoMeetingsBooked,
      notInterested: totals.notInterested,
      interested: totals.interested,
      willCallBack: totals.willCallBack,
      callsNotReceived: totals.callsNotReceived,
    },
    analytics,
    callInsights,
    leadAnalytics: getLeadPipelineAnalytics(dateString),
    monthlyRevenueGoal,
    users: userStats,
    leader,
    raceTo20: {
      Vishal: userStats[0].progressTo20,
      Aryan: userStats[1].progressTo20,
    },
  };
}

function getCsvForDate(dateString) {
  const summary = getDashboardSummary(dateString);

  const lines = [
    [
      "Date",
      "User",
      "Leads Today",
      "Followups Done",
      "Calls Done Today",
      "Calls Not Received",
      "Interested",
      "Not Interested",
      "Will Call Back",
      "Demo Meetings Booked",
      "Closures Today",
      "Website Closures Today",
      "Revenue Today",
      "Incentives Earned",
      "Connect Rate %",
      "Interest Rate %",
      "Demo Booking Rate %",
      "Streak",
    ].join(","),
  ];

  for (const user of summary.users) {
    lines.push(
      [
        summary.date,
        user.name,
        user.totalLeadsToday,
        user.followupsDone,
        user.callsDoneToday,
        user.callsNotReceived,
        user.interested,
        user.notInterested,
        user.willCallBack,
        user.demoMeetingsBooked,
        user.closuresToday,
        user.websiteClosuresToday,
        user.revenueToday,
        user.incentivesEarned,
        user.callConnectRate,
        user.interestRate,
        user.demoBookingRate,
        user.streak,
      ].join(",")
    );
  }

  lines.push(
    [
      summary.date,
      "TOTAL",
      summary.totals.leadsReceivedToday,
      "",
      summary.totals.callsDone,
      summary.totals.callsNotReceived,
      summary.totals.interested,
      summary.totals.notInterested,
      summary.totals.willCallBack,
      summary.totals.demoMeetingsBooked,
      summary.totals.closures,
      summary.totals.websiteClosures,
      summary.totals.revenue,
      summary.totals.incentives,
      summary.analytics.teamCallConnectRate,
      summary.analytics.teamInterestRate,
      summary.analytics.teamDemoBookingRate,
      "",
    ].join(",")
  );

  return lines.join("\n");
}

function listLeads({
  date,
  status,
  assignedTo,
  search,
  userRole,
  userDisplayName,
  limit = 100,
}) {
  const conditions = [];
  const params = [];

  if (date) {
    conditions.push("substr(received_at, 1, 10) = ?");
    params.push(date);
  }
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (assignedTo) {
    conditions.push("assigned_to = ?");
    params.push(assignedTo);
  }
  if (search) {
    conditions.push("(name LIKE ? OR phone LIKE ? OR email LIKE ? OR privyr_lead_id LIKE ?)");
    const wildcard = `%${search}%`;
    params.push(wildcard, wildcard, wildcard, wildcard);
  }
  if (userRole === "sales") {
    conditions.push("assigned_to = ?");
    params.push(userDisplayName);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const safeLimit = Math.min(Math.max(parseIntSafe(limit), 1), 300);

  const rows = db
    .prepare(
      `
      SELECT
        id, privyr_lead_id, name, phone, email, source, created_at, received_at,
        assigned_to, status, call_outcome, demo_booked, notes, last_contacted_at,
        next_followup_at, last_activity_at, updated_at, closed_by, closure_date,
        closure_type, revenue
      FROM leads
      ${whereClause}
      ORDER BY received_at DESC
      LIMIT ?
    `
    )
    .all(...params, safeLimit);

  return rows.map((row) => ({
    ...row,
    demo_booked: Number(row.demo_booked || 0),
  }));
}

function canAccessLead(lead, actorRole, actorDisplayName) {
  if (!lead) return false;
  if (actorRole === "admin") return true;
  return lead.assigned_to === actorDisplayName;
}

function updateLeadTracking({
  leadId,
  actorRole,
  actorDisplayName,
  status,
  callOutcome,
  notes,
  nextFollowupAt,
  demoBooked,
  revenue,
  closureType,
}) {
  return withTransaction(() => {
    const existing = getLeadById(leadId);
    if (!existing) {
      throw new Error("Lead not found");
    }
    if (!canAccessLead(existing, actorRole, actorDisplayName)) {
      throw new Error("Not allowed to update this lead");
    }

    const nowIso = new Date().toISOString();

    const resolvedOutcome =
      callOutcome !== undefined ? normalizeCallOutcome(callOutcome) : normalizeCallOutcome(existing.call_outcome);
    let resolvedStatus = status !== undefined ? normalizeStatus(status) : normalizeStatus(existing.status);

    if (status === undefined && resolvedOutcome) {
      const outcomeToStatusMap = {
        Interested: "Interested",
        "Not Interested": "Not Interested",
        "Will Call Back": "Will Call Back",
        "Call Not Received": "Call Not Received",
        "Demo Booked": "Follow-up",
      };
      resolvedStatus = outcomeToStatusMap[resolvedOutcome] || resolvedStatus;
    }

    const resolvedNotes = notes !== undefined ? String(notes || "").trim() : existing.notes;
    const resolvedNextFollowup =
      nextFollowupAt !== undefined ? parseNullableTimestamp(nextFollowupAt) : existing.next_followup_at;
    const resolvedDemoBooked =
      demoBooked !== undefined ? parseBooleanToInt(demoBooked) : parseBooleanToInt(existing.demo_booked);
    const resolvedRevenue = revenue !== undefined ? parseNumber(revenue) : parseNumber(existing.revenue);
    const resolvedClosureType =
      closureType !== undefined ? String(closureType || "").trim() : String(existing.closure_type || "");

    let resolvedClosedBy = existing.closed_by;
    let resolvedClosureDate = existing.closure_date;
    if (resolvedStatus === "Closed") {
      resolvedClosedBy = actorDisplayName;
      resolvedClosureDate = existing.closure_date || nowIso;
    }
    if (resolvedStatus !== "Closed" && status !== undefined) {
      resolvedClosedBy = null;
      resolvedClosureDate = null;
    }

    db.prepare(
      `
      UPDATE leads
      SET
        status = ?,
        call_outcome = ?,
        demo_booked = ?,
        notes = ?,
        last_contacted_at = ?,
        next_followup_at = ?,
        last_activity_at = ?,
        updated_at = ?,
        closed_by = ?,
        closure_date = ?,
        closure_type = ?,
        revenue = ?
      WHERE id = ?
    `
    ).run(
      resolvedStatus,
      resolvedOutcome,
      resolvedDemoBooked,
      resolvedNotes,
      nowIso,
      resolvedNextFollowup,
      nowIso,
      nowIso,
      resolvedClosedBy,
      resolvedClosureDate,
      resolvedClosureType || null,
      resolvedRevenue,
      leadId
    );

    insertLeadActivity({
      leadId,
      activityType: "Lead Updated",
      outcome: resolvedOutcome || resolvedStatus,
      notes: resolvedNotes || null,
      nextFollowupAt: resolvedNextFollowup,
      createdBy: actorDisplayName,
    });

    return getLeadById(leadId);
  });
}

function addLeadActivity({
  leadId,
  actorRole,
  actorDisplayName,
  activityType,
  outcome,
  notes,
  nextFollowupAt,
}) {
  return withTransaction(() => {
    const existing = getLeadById(leadId);
    if (!existing) {
      throw new Error("Lead not found");
    }
    if (!canAccessLead(existing, actorRole, actorDisplayName)) {
      throw new Error("Not allowed to access this lead");
    }

    const nowIso = new Date().toISOString();
    const normalizedType = String(activityType || "Manual Note").trim();
    const resolvedNextFollowup = parseNullableTimestamp(nextFollowupAt);

    insertLeadActivity({
      leadId,
      activityType: normalizedType,
      outcome: normalizeCallOutcome(outcome),
      notes: notes ? String(notes).trim() : null,
      nextFollowupAt: resolvedNextFollowup,
      createdBy: actorDisplayName,
    });

    db.prepare(
      `
      UPDATE leads
      SET
        next_followup_at = COALESCE(?, next_followup_at),
        last_activity_at = ?,
        updated_at = ?
      WHERE id = ?
    `
    ).run(resolvedNextFollowup, nowIso, nowIso, leadId);

    return getLeadActivities(leadId, 20);
  });
}

function getLeadActivities(leadId, limit = 50) {
  const safeLimit = Math.min(Math.max(parseIntSafe(limit), 1), 200);
  return db
    .prepare(
      `
      SELECT id, lead_id, activity_type, outcome, notes, next_followup_at, created_by, created_at
      FROM lead_activities
      WHERE lead_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .all(leadId, safeLimit);
}

module.exports = {
  db,
  salesUsers,
  leadStatusValues,
  callOutcomeValues,
  formatDateInTimezone,
  getMonthlyRevenueTarget,
  upsertMonthlyRevenueTarget,
  insertLeadFromPrivyr,
  upsertDailyUpdate,
  getDashboardSummary,
  getCsvForDate,
  listLeads,
  updateLeadTracking,
  getLeadById,
  getLeadActivities,
  addLeadActivity,
};
