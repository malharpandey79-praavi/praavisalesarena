const nodemailer = require("nodemailer");
const config = require("./config");
const { formatDateInTimezone, getDashboardSummary } = require("./db");

function buildDailyReportText(summary) {
  const topSources = summary.leadAnalytics.sourceBreakdown
    .slice(0, 5)
    .map((item) => `${item.source}: ${item.count}`)
    .join(", ");

  const statusFunnel = summary.leadAnalytics.statusBreakdown
    .map((item) => `${item.status}: ${item.count}`)
    .join(", ");

  const userBreakdown = summary.users
    .map(
      (user) =>
        [
          `${user.name}:`,
          `Leads ${user.totalLeadsToday}`,
          `Calls ${user.callsDoneToday}`,
          `No Response ${user.callsNotReceived}`,
          `Interested ${user.interested}`,
          `Not Interested ${user.notInterested}`,
          `Will Call Back ${user.willCallBack}`,
          `Demos ${user.demoMeetingsBooked}`,
          `Closures ${user.closuresToday}`,
          `Websites ${user.websiteClosuresToday}`,
          `Revenue Rs ${user.revenueToday}`,
          `Incentive Rs ${user.incentivesEarned}`,
          `Connect Rate ${user.callConnectRate}%`,
          `Interest Rate ${user.interestRate}%`,
        ].join(" ")
    )
    .join("\n");

  return `
Praavi Sales Arena - Daily Analytical Report (${summary.date})

Total Leads Received: ${summary.totals.leadsReceivedToday}
Total Closures: ${summary.totals.closures}
Website Closures: ${summary.totals.websiteClosures}
Revenue Earned: Rs ${summary.totals.revenue}
Incentives Due: Rs ${summary.totals.incentives}
Calls Done: ${summary.totals.callsDone}
Calls Not Received: ${summary.totals.callsNotReceived}
Interested: ${summary.totals.interested}
Not Interested: ${summary.totals.notInterested}
Will Call Back: ${summary.totals.willCallBack}
Demo Meetings Booked: ${summary.totals.demoMeetingsBooked}

Team Conversion Metrics:
Call Connect Rate: ${summary.analytics.teamCallConnectRate}%
Interest Rate: ${summary.analytics.teamInterestRate}%
Demo Booking Rate: ${summary.analytics.teamDemoBookingRate}%
Closure from Interested Rate: ${summary.analytics.teamClosureFromInterestedRate}%

Lead Funnel (today): ${statusFunnel || "No lead funnel data"}
Top Sources (today): ${topSources || "No source data"}
Open Pipeline: ${summary.leadAnalytics.openPipeline}
Overdue Follow-ups: ${summary.leadAnalytics.overdueFollowups}

User Breakdown:
${userBreakdown}
`.trim();
}

function canSendEmails() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass && config.adminEmail);
}

function getTimePartsInTimezone(date = new Date(), timezone = config.timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour: map.hour,
    minute: map.minute,
  };
}

async function sendDailyReportEmail(dateString = formatDateInTimezone(new Date())) {
  const summary = getDashboardSummary(dateString);
  const text = buildDailyReportText(summary);

  if (!canSendEmails()) {
    console.log(
      "[Daily Report] SMTP credentials missing. Skipping email send. Report content follows:\n",
      text
    );
    return { sent: false, reason: "smtp_not_configured", summary };
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });

  await transporter.sendMail({
    from: config.smtp.from,
    to: config.adminEmail,
    subject: `Praavi Sales Arena Daily Analytical Report - ${summary.date}`,
    text,
  });

  console.log(`[Daily Report] Email sent to ${config.adminEmail} for ${summary.date}`);
  return { sent: true, summary };
}

function startDailyReportJob() {
  let lastRunDate = null;
  const timer = setInterval(async () => {
    const now = getTimePartsInTimezone(new Date(), config.timezone);
    const shouldRun = now.hour === "20" && now.minute === "30" && lastRunDate !== now.date;
    if (!shouldRun) {
      return;
    }

    lastRunDate = now.date;
    try {
      await sendDailyReportEmail(now.date);
    } catch (error) {
      console.error("[Daily Report] Failed to send:", error.message);
    }
  }, 30000);

  console.log(`[Daily Report] Scheduled at 8:30 PM (${config.timezone})`);
  return {
    stop() {
      clearInterval(timer);
    },
  };
}

module.exports = {
  sendDailyReportEmail,
  startDailyReportJob,
};
