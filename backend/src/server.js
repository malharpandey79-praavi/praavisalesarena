const express = require("express");
const cors = require("cors");
const config = require("./config");
const { authenticateUser, signToken, requireAuth } = require("./auth");
const {
  formatDateInTimezone,
  insertLeadFromPrivyr,
  upsertDailyUpdate,
  getDashboardSummary,
  getMonthlyRevenueTarget,
  upsertMonthlyRevenueTarget,
  getCsvForDate,
  listLeads,
  updateLeadTracking,
  getLeadById,
  getLeadActivities,
  addLeadActivity,
  leadStatusValues,
  callOutcomeValues,
} = require("./db");
const { sendDailyReportEmail, startDailyReportJob } = require("./reporting");

const app = express();

app.use(
  cors({
    origin: config.frontendOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "praavi-sales-arena-backend" });
});

app.get("/", (_req, res) => {
  res.status(200).send("Praavi Sales Arena API is running. Use /api/health");
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = authenticateUser(username, password);

  if (!user) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = signToken(user);
  return res.json({ token, user });
});

app.get("/api/auth/me", requireAuth(), (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/webhooks/privyr", (req, res) => {
  try {
    const result = insertLeadFromPrivyr(req.body);
    return res.status(result.duplicate ? 200 : 201).json({
      ok: true,
      duplicate: result.duplicate,
      assignedTo: result.lead.assigned_to,
      leadId: result.lead.id,
    });
  } catch (error) {
    console.error("[Privyr Webhook] Failed to process payload:", error.message);
    return res.status(500).json({ error: "Failed to process Privyr webhook payload" });
  }
});

app.get("/api/dashboard/summary", requireAuth(["admin", "sales"]), (req, res) => {
  const date = req.query.date || formatDateInTimezone(new Date());
  const summary = getDashboardSummary(date);
  res.json(summary);
});

app.get("/api/revenue-target", requireAuth(["admin", "sales"]), (req, res) => {
  try {
    const today = formatDateInTimezone(new Date());
    const fallbackYear = Number(today.slice(0, 4));
    const fallbackMonth = Number(today.slice(5, 7));
    const year = req.query.year ? Number(req.query.year) : fallbackYear;
    const month = req.query.month ? Number(req.query.month) : fallbackMonth;
    const target = getMonthlyRevenueTarget(year, month);
    return res.json(target);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Invalid month/year" });
  }
});

app.post("/api/sales/update", requireAuth(["sales"]), (req, res) => {
  const user = req.user.displayName;
  const date = req.body?.date || formatDateInTimezone(new Date());

  const summary = upsertDailyUpdate({
    user,
    date,
    followupsDone: req.body?.followupsDone,
    closuresToday: req.body?.closuresToday,
    websiteClosuresToday: req.body?.websiteClosuresToday,
    revenueToday: req.body?.revenueToday,
    callsDoneToday: req.body?.callsDoneToday,
    demoMeetingsBooked: req.body?.demoMeetingsBooked,
    notInterested: req.body?.notInterested,
    interested: req.body?.interested,
    willCallBack: req.body?.willCallBack,
    callsNotReceived: req.body?.callsNotReceived,
  });

  res.json({ ok: true, summary });
});

app.get("/api/leads/options", requireAuth(["admin", "sales"]), (_req, res) => {
  res.json({
    statuses: leadStatusValues,
    callOutcomes: callOutcomeValues,
  });
});

app.get("/api/leads", requireAuth(["admin", "sales"]), (req, res) => {
  const date = req.query.date || formatDateInTimezone(new Date());
  const status = req.query.status || "";
  const assignedTo = req.query.assignedTo || "";
  const search = req.query.search || "";
  const limit = req.query.limit || 120;

  const leads = listLeads({
    date,
    status,
    assignedTo,
    search,
    limit,
    userRole: req.user.role,
    userDisplayName: req.user.displayName,
  });

  res.json({ date, count: leads.length, leads });
});

app.patch("/api/leads/:leadId", requireAuth(["admin", "sales"]), (req, res) => {
  const leadId = Number(req.params.leadId);
  if (!Number.isFinite(leadId)) {
    return res.status(400).json({ error: "Invalid lead id" });
  }

  try {
    const lead = updateLeadTracking({
      leadId,
      actorRole: req.user.role,
      actorDisplayName: req.user.displayName,
      status: req.body?.status,
      callOutcome: req.body?.callOutcome,
      notes: req.body?.notes,
      nextFollowupAt: req.body?.nextFollowupAt,
      demoBooked: req.body?.demoBooked,
      revenue: req.body?.revenue,
      closureType: req.body?.closureType,
    });
    return res.json({ ok: true, lead });
  } catch (error) {
    const code = error.message.includes("not found")
      ? 404
      : error.message.includes("Not allowed")
        ? 403
        : 400;
    return res.status(code).json({ error: error.message });
  }
});

app.get("/api/leads/:leadId/activities", requireAuth(["admin", "sales"]), (req, res) => {
  const leadId = Number(req.params.leadId);
  if (!Number.isFinite(leadId)) {
    return res.status(400).json({ error: "Invalid lead id" });
  }

  const lead = getLeadById(leadId);
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }
  if (req.user.role === "sales" && lead.assigned_to !== req.user.displayName) {
    return res.status(403).json({ error: "Not allowed to view this lead" });
  }

  const activities = getLeadActivities(leadId, req.query.limit || 50);
  return res.json({ leadId, activities });
});

app.post("/api/leads/:leadId/activities", requireAuth(["admin", "sales"]), (req, res) => {
  const leadId = Number(req.params.leadId);
  if (!Number.isFinite(leadId)) {
    return res.status(400).json({ error: "Invalid lead id" });
  }

  try {
    const activities = addLeadActivity({
      leadId,
      actorRole: req.user.role,
      actorDisplayName: req.user.displayName,
      activityType: req.body?.activityType,
      outcome: req.body?.outcome,
      notes: req.body?.notes,
      nextFollowupAt: req.body?.nextFollowupAt,
    });
    return res.status(201).json({ ok: true, activities });
  } catch (error) {
    const code = error.message.includes("not found")
      ? 404
      : error.message.includes("Not allowed")
        ? 403
        : 400;
    return res.status(code).json({ error: error.message });
  }
});

app.get("/api/admin/export/csv", requireAuth(["admin"]), (req, res) => {
  const date = req.query.date || formatDateInTimezone(new Date());
  const csv = getCsvForDate(date);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="praavi-sales-${date}.csv"`);
  res.send(csv);
});

app.post("/api/admin/send-daily-report", requireAuth(["admin"]), async (req, res) => {
  const date = req.body?.date || formatDateInTimezone(new Date());

  try {
    const result = await sendDailyReportEmail(date);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[Daily Report] Manual trigger failed:", error.message);
    res.status(500).json({ error: "Failed to send daily report" });
  }
});

app.put("/api/admin/revenue-target", requireAuth(["admin"]), (req, res) => {
  try {
    const target = upsertMonthlyRevenueTarget({
      month: req.body?.month,
      year: req.body?.year,
      revenueTarget: req.body?.revenueTarget,
    });
    return res.json({ ok: true, target });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Failed to update monthly target" });
  }
});

app.use((err, _req, res, _next) => {
  console.error("[API] Unhandled error:", err.message);
  res.status(500).json({ error: "Unexpected server error" });
});

function startServer() {
  let reportTask = null;
  const server = app.listen(config.port, () => {
    console.log(`Praavi backend running at http://localhost:${config.port}`);
    reportTask = startDailyReportJob();
  });
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${config.port} is already in use. Stop the running process or change PORT in backend/.env.`);
      return;
    }
    console.error("Server startup failed:", error.message);
  });
  server.on("close", () => {
    reportTask?.stop?.();
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
};
