import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AnimatedNumber from "../components/AnimatedNumber";
import LoginPanel from "../components/LoginPanel";
import UserCard from "../components/UserCard";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:4000");

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function toDateTimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

function defaultSalesForm() {
  return {
    followupsDone: 0,
    closuresToday: 0,
    websiteClosuresToday: 0,
    revenueToday: 0,
    callsDoneToday: 0,
    demoMeetingsBooked: 0,
    notInterested: 0,
    interested: 0,
    willCallBack: 0,
    callsNotReceived: 0,
  };
}

function buildLeadEditState(lead) {
  return {
    status: lead.status || "New",
    callOutcome: lead.call_outcome || "",
    notes: lead.notes || "",
    nextFollowupAt: toDateTimeLocalValue(lead.next_followup_at),
    demoBooked: Number(lead.demo_booked || 0) > 0,
    revenue: Number(lead.revenue || 0),
    closureType: lead.closure_type || "",
  };
}

function toMonthInputValue(year, month) {
  const parsedYear = Number.parseInt(year, 10);
  const parsedMonth = Number.parseInt(month, 10);
  if (!Number.isInteger(parsedYear) || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    return "";
  }
  return `${parsedYear}-${String(parsedMonth).padStart(2, "0")}`;
}

function parseMonthInputValue(value) {
  const [yearPart, monthPart] = String(value || "").split("-");
  const year = Number.parseInt(yearPart, 10);
  const month = Number.parseInt(monthPart, 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

function formatMonthYearLabel(month, year) {
  const parsedYear = Number.parseInt(year, 10);
  const parsedMonth = Number.parseInt(month, 10);
  if (!Number.isInteger(parsedYear) || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    return "Monthly Revenue Goal";
  }
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date(parsedYear, parsedMonth - 1, 1));
}

export default function HomePage() {
  const [authReady, setAuthReady] = useState(false);
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [unlockMessage, setUnlockMessage] = useState("");

  const [loginForm, setLoginForm] = useState({
    username: "admin",
    password: "admin123",
  });
  const [salesForm, setSalesForm] = useState(defaultSalesForm());
  const [isSalesFormDirty, setIsSalesFormDirty] = useState(false);

  const [leads, setLeads] = useState([]);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadFilters, setLeadFilters] = useState({
    status: "",
    search: "",
  });
  const [leadOptions, setLeadOptions] = useState({
    statuses: [],
    callOutcomes: [],
  });
  const [leadEditMap, setLeadEditMap] = useState({});
  const [goalConfig, setGoalConfig] = useState({
    monthValue: "",
    revenueTarget: 0,
  });
  const [goalConfigLoading, setGoalConfigLoading] = useState(false);
  const [goalConfigSaving, setGoalConfigSaving] = useState(false);
  const [goalPulse, setGoalPulse] = useState(false);
  const [monthlyTargetAchievedMonth, setMonthlyTargetAchievedMonth] = useState("");

  const previousWebsitesRef = useRef({
    Vishal: 0,
    Aryan: 0,
  });
  const previousMonthlyRevenueRef = useRef(0);
  const goalConfigSeedRef = useRef("");
  const goalPulseTimeoutRef = useRef(null);
  const monthlyGoalCelebratedRef = useRef("");

  const sortedUsers = useMemo(() => {
    if (!summary?.users) return [];
    const order = { Vishal: 0, Aryan: 1 };
    return [...summary.users].sort((a, b) => (order[a.name] || 0) - (order[b.name] || 0));
  }, [summary]);

  const monthlyGoal = summary?.monthlyRevenueGoal || null;
  const monthlyGoalMonthKey = monthlyGoal?.monthKey || "";
  const monthlyGoalLabel = useMemo(
    () => formatMonthYearLabel(monthlyGoal?.month, monthlyGoal?.year),
    [monthlyGoal?.month, monthlyGoal?.year]
  );
  const monthlyGoalPercentage = Number(monthlyGoal?.percentageAchieved || 0);
  const monthlyGoalBarWidth = Math.min(Math.max(monthlyGoalPercentage, 0), 100);
  const monthlyGoalContribution = monthlyGoal?.contributionByUser || [];
  const monthlyGoalProjection = monthlyGoal?.projection || {};
  const monthlyRevenueTrend = monthlyGoal?.revenueTrend || [];
  const vishalDailyCallMix = useMemo(() => {
    const vishal = summary?.users?.find((entry) => entry.name === "Vishal");
    return buildCallMixFromUserMetrics(vishal);
  }, [summary?.users]);
  const aryanDailyCallMix = useMemo(() => {
    const aryan = summary?.users?.find((entry) => entry.name === "Aryan");
    return buildCallMixFromUserMetrics(aryan);
  }, [summary?.users]);
  const monthlyCallMix = summary?.callInsights?.monthly || null;
  const monthlyGoalAchievedForCurrentMonth =
    Boolean(monthlyGoal?.isTargetAchieved) || monthlyTargetAchievedMonth === monthlyGoalMonthKey;

  const monthlyGoalProgressClass =
    monthlyGoalBarWidth >= 100
      ? "bg-gradient-to-r from-arena-gold to-yellow-300"
      : monthlyGoalBarWidth >= 70
        ? "bg-gradient-to-r from-emerald-500 to-green-300"
        : "bg-gradient-to-r from-arena-red to-arena-ember";

  function hydrateSalesFormFromSummary(summaryPayload, currentUser) {
    if (!summaryPayload || currentUser?.role !== "sales") return;
    const me = summaryPayload.users.find((item) => item.name === currentUser.displayName);
    if (!me) return;

    setSalesForm({
      followupsDone: me.followupsDone,
      closuresToday: me.closuresToday,
      websiteClosuresToday: me.websiteClosuresToday,
      revenueToday: me.revenueToday,
      callsDoneToday: me.callsDoneToday,
      demoMeetingsBooked: me.demoMeetingsBooked,
      notInterested: me.notInterested,
      interested: me.interested,
      willCallBack: me.willCallBack,
      callsNotReceived: me.callsNotReceived,
    });
  }

  function updateSalesField(field, value) {
    setSalesForm((prev) => ({ ...prev, [field]: value }));
    setIsSalesFormDirty(true);
  }

  useEffect(() => {
    const storedToken = window.localStorage.getItem("arena_token");
    const storedUser = window.localStorage.getItem("arena_user");
    if (!storedToken || !storedUser) {
      setAuthReady(true);
      return;
    }
    setToken(storedToken);
    try {
      setUser(JSON.parse(storedUser));
    } catch (_error) {
      window.localStorage.removeItem("arena_user");
      window.localStorage.removeItem("arena_token");
    }
    setAuthReady(true);
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    fetchSummary();
    fetchLeadOptions();
    fetchLeads();

    const interval = setInterval(() => {
      fetchSummary();
      fetchLeads();
    }, 20000);
    return () => clearInterval(interval);
  }, [token, leadFilters.status, leadFilters.search]);

  useEffect(() => {
    if (!summary?.users) return;
    const crossedUsers = [];
    for (const salesUser of summary.users) {
      const previous = previousWebsitesRef.current[salesUser.name] ?? 0;
      if (previous <= 20 && salesUser.websiteClosuresToday > 20) {
        crossedUsers.push(salesUser.name);
      }
      previousWebsitesRef.current[salesUser.name] = salesUser.websiteClosuresToday;
    }

    if (crossedUsers.length > 0) {
      fireConfetti();
      setUnlockMessage(`${crossedUsers.join(" & ")} unlocked Rs500 incentive slab!`);
      setTimeout(() => setUnlockMessage(""), 5000);
    }
  }, [summary]);

  useEffect(() => {
    if (!monthlyGoalMonthKey) return;
    if (goalConfigSeedRef.current === monthlyGoalMonthKey) return;
    goalConfigSeedRef.current = monthlyGoalMonthKey;
    setGoalConfig({
      monthValue: monthlyGoalMonthKey,
      revenueTarget: Number(monthlyGoal?.target || 0),
    });
  }, [monthlyGoalMonthKey, monthlyGoal?.target]);

  useEffect(() => {
    if (!monthlyGoalMonthKey) return;

    if (monthlyTargetAchievedMonth && monthlyTargetAchievedMonth !== monthlyGoalMonthKey) {
      setMonthlyTargetAchievedMonth("");
      monthlyGoalCelebratedRef.current = "";
    }

    if (monthlyGoal?.isTargetAchieved && monthlyTargetAchievedMonth !== monthlyGoalMonthKey) {
      setMonthlyTargetAchievedMonth(monthlyGoalMonthKey);
    }
  }, [monthlyGoal?.isTargetAchieved, monthlyGoalMonthKey, monthlyTargetAchievedMonth]);

  useEffect(() => {
    if (!monthlyGoalMonthKey) return;
    if (!monthlyGoalAchievedForCurrentMonth) return;
    if (monthlyGoalCelebratedRef.current === monthlyGoalMonthKey) return;

    monthlyGoalCelebratedRef.current = monthlyGoalMonthKey;
    fireConfetti({
      particleCount: 240,
      spread: 110,
      startVelocity: 58,
      colors: ["#f2c14e", "#ffd166", "#22c55e", "#ffffff"],
    });
  }, [monthlyGoalAchievedForCurrentMonth, monthlyGoalMonthKey]);

  useEffect(() => {
    if (!monthlyGoalMonthKey) return;
    const currentRevenue = Number(monthlyGoal?.currentMtdRevenue || 0);
    const previousRevenue = previousMonthlyRevenueRef.current;

    if (currentRevenue > previousRevenue) {
      setGoalPulse(true);
      if (goalPulseTimeoutRef.current) {
        window.clearTimeout(goalPulseTimeoutRef.current);
      }
      goalPulseTimeoutRef.current = window.setTimeout(() => {
        setGoalPulse(false);
      }, 1000);
    }

    previousMonthlyRevenueRef.current = currentRevenue;
  }, [monthlyGoal?.currentMtdRevenue, monthlyGoalMonthKey]);

  useEffect(
    () => () => {
      if (goalPulseTimeoutRef.current) {
        window.clearTimeout(goalPulseTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (isSalesFormDirty) return;
    hydrateSalesFormFromSummary(summary, user);
  }, [summary, user, isSalesFormDirty]);

  async function fireConfetti(overrides = {}) {
    if (typeof window === "undefined") return;
    const confettiModule = await import("canvas-confetti");
    const confetti = confettiModule.default;
    confetti({
      particleCount: 180,
      spread: 100,
      startVelocity: 55,
      origin: { y: 0.6 },
      colors: ["#f2c14e", "#d62828", "#ffdf7e", "#ffffff"],
      ...overrides,
    });
  }

  async function apiFetch(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Request failed");
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response;
  }

  async function fetchSummary() {
    setLoadingSummary(true);
    try {
      const data = await apiFetch("/api/dashboard/summary");
      setSummary(data);
      setError("");
    } catch (fetchError) {
      setError(fetchError.message);
      if (fetchError.message.toLowerCase().includes("token")) {
        doLogout();
      }
    } finally {
      setLoadingSummary(false);
    }
  }

  async function loadRevenueTargetForMonth(monthValue) {
    const parsed = parseMonthInputValue(monthValue);
    if (!parsed) return;

    setGoalConfigLoading(true);
    try {
      const payload = await apiFetch(`/api/revenue-target?month=${parsed.month}&year=${parsed.year}`);
      setGoalConfig((prev) => ({
        ...prev,
        monthValue: toMonthInputValue(payload.year, payload.month),
        revenueTarget: Number(payload.revenueTarget || 0),
      }));
      setActionMessage(`Loaded target for ${formatMonthYearLabel(payload.month, payload.year)}.`);
    } catch (loadError) {
      setActionMessage(`Failed to load target: ${loadError.message}`);
    } finally {
      setGoalConfigLoading(false);
    }
  }

  async function fetchLeadOptions() {
    try {
      const options = await apiFetch("/api/leads/options");
      setLeadOptions(options);
    } catch (_error) {
      setLeadOptions({ statuses: [], callOutcomes: [] });
    }
  }

  async function fetchLeads() {
    setLeadLoading(true);
    try {
      const params = new URLSearchParams();
      if (summary?.date) params.set("date", summary.date);
      if (leadFilters.status) params.set("status", leadFilters.status);
      if (leadFilters.search) params.set("search", leadFilters.search);
      params.set("limit", "150");

      const payload = await apiFetch(`/api/leads?${params.toString()}`);
      const nextLeads = payload.leads || [];
      setLeads(nextLeads);
      setLeadEditMap((prev) => {
        const updated = { ...prev };
        for (const lead of nextLeads) {
          if (!updated[lead.id]) {
            updated[lead.id] = buildLeadEditState(lead);
          }
        }
        return updated;
      });
      setError("");
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLeadLoading(false);
    }
  }

  async function onLogin(event) {
    event.preventDefault();
    setLoginLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Login failed");
      }

      setToken(payload.token);
      setUser(payload.user);
      setIsSalesFormDirty(false);
      window.localStorage.setItem("arena_token", payload.token);
      window.localStorage.setItem("arena_user", JSON.stringify(payload.user));
      setActionMessage("");
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoginLoading(false);
    }
  }

  function doLogout() {
    setToken("");
    setUser(null);
    setSummary(null);
    setLeads([]);
    setLeadEditMap({});
    setIsSalesFormDirty(false);
    setGoalConfig({ monthValue: "", revenueTarget: 0 });
    setGoalConfigLoading(false);
    setGoalConfigSaving(false);
    setGoalPulse(false);
    setMonthlyTargetAchievedMonth("");
    goalConfigSeedRef.current = "";
    previousMonthlyRevenueRef.current = 0;
    monthlyGoalCelebratedRef.current = "";
    if (goalPulseTimeoutRef.current) {
      window.clearTimeout(goalPulseTimeoutRef.current);
      goalPulseTimeoutRef.current = null;
    }
    window.localStorage.removeItem("arena_token");
    window.localStorage.removeItem("arena_user");
  }

  function onLeadEditChange(leadId, key, value) {
    setLeadEditMap((prev) => ({
      ...prev,
      [leadId]: {
        ...(prev[leadId] || {}),
        [key]: value,
      },
    }));
  }

  async function saveLeadTracking(leadId) {
    const edit = leadEditMap[leadId];
    if (!edit) return;

    setActionMessage(`Saving lead #${leadId}...`);
    try {
      const payload = await apiFetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: edit.status,
          callOutcome: edit.callOutcome,
          notes: edit.notes,
          nextFollowupAt: edit.nextFollowupAt || null,
          demoBooked: edit.demoBooked,
          revenue: edit.revenue,
          closureType: edit.closureType,
        }),
      });

      setLeads((prev) => prev.map((lead) => (lead.id === leadId ? payload.lead : lead)));
      setLeadEditMap((prev) => ({
        ...prev,
        [leadId]: buildLeadEditState(payload.lead),
      }));
      setActionMessage(`Lead #${leadId} updated.`);
      fetchSummary();
    } catch (saveError) {
      setActionMessage(`Lead update failed: ${saveError.message}`);
    }
  }

  async function submitSalesUpdate(event) {
    event.preventDefault();
    setActionMessage("Saving update...");

    try {
      const payload = await apiFetch("/api/sales/update", {
        method: "POST",
        body: JSON.stringify(salesForm),
      });
      setSummary(payload.summary);
      setIsSalesFormDirty(false);
      hydrateSalesFormFromSummary(payload.summary, user);
      setActionMessage("Update saved.");
    } catch (submitError) {
      setActionMessage(`Failed: ${submitError.message}`);
    }
  }

  async function exportCsv() {
    setActionMessage("Preparing CSV export...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/export/csv`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "CSV export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `praavi-sales-${summary?.date || "today"}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
      setActionMessage("CSV downloaded.");
    } catch (exportError) {
      setActionMessage(`CSV export failed: ${exportError.message}`);
    }
  }

  async function sendDailyReportNow() {
    setActionMessage("Sending daily analytical report...");
    try {
      const result = await apiFetch("/api/admin/send-daily-report", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (result.sent) {
        setActionMessage("Daily analytical report email sent.");
      } else {
        setActionMessage("SMTP not configured, report logged in backend console.");
      }
    } catch (reportError) {
      setActionMessage(`Failed to send report: ${reportError.message}`);
    }
  }

  async function saveMonthlyRevenueTarget(event) {
    event.preventDefault();
    const parsedMonth = parseMonthInputValue(goalConfig.monthValue);
    if (!parsedMonth) {
      setActionMessage("Please choose a valid target month.");
      return;
    }

    const normalizedTarget = Math.max(0, Number(goalConfig.revenueTarget) || 0);
    setGoalConfigSaving(true);
    setActionMessage("Updating monthly revenue target...");

    try {
      const payload = await apiFetch("/api/admin/revenue-target", {
        method: "PUT",
        body: JSON.stringify({
          month: parsedMonth.month,
          year: parsedMonth.year,
          revenueTarget: normalizedTarget,
        }),
      });

      const updatedTarget = payload?.target;
      setGoalConfig({
        monthValue: toMonthInputValue(updatedTarget?.year, updatedTarget?.month),
        revenueTarget: Number(updatedTarget?.revenueTarget || 0),
      });
      goalConfigSeedRef.current = toMonthInputValue(updatedTarget?.year, updatedTarget?.month);
      setActionMessage(`Target updated for ${formatMonthYearLabel(updatedTarget?.month, updatedTarget?.year)}.`);
      fetchSummary();
    } catch (saveError) {
      setActionMessage(`Failed to update target: ${saveError.message}`);
    } finally {
      setGoalConfigSaving(false);
    }
  }

  if (!authReady) {
    return (
      <div className="arena-bg flex min-h-screen items-center justify-center text-white">
        Loading Arena...
      </div>
    );
  }

  if (!token || !user) {
    return (
      <LoginPanel
        form={loginForm}
        setForm={setLoginForm}
        onSubmit={onLogin}
        loading={loginLoading}
        error={error}
        apiBaseUrl={API_BASE_URL}
      />
    );
  }

  return (
    <div className="arena-bg arena-grid min-h-screen px-4 py-6 text-white sm:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-black/35 p-5 backdrop-blur sm:flex-row sm:items-end">
          <div>
            <h1 className="font-display text-3xl font-black tracking-[0.24em] text-glow-red sm:text-5xl">
              PRAAVI SALES ARENA
            </h1>
            <p className="mt-2 text-sm uppercase tracking-[0.5em] text-arena-gold">The War Room</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm">
              Logged in as <span className="font-bold text-arena-gold">{user.displayName}</span>
            </div>
            <button
              type="button"
              onClick={doLogout}
              className="rounded-lg border border-arena-red/70 px-3 py-2 text-sm transition hover:bg-arena-red/20"
            >
              Logout
            </button>
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-arena-gold/45 bg-black/55 p-5 shadow-glowGold">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.22em] text-white/65">Company Revenue Objective</p>
              <h2 className="mt-1 font-display text-2xl tracking-[0.12em] text-arena-gold sm:text-4xl">
                {monthlyGoalLabel} Revenue Goal
              </h2>
              <div className="mt-4 flex flex-wrap gap-5 text-xs uppercase tracking-[0.2em] text-white/65">
                <span>
                  Target: <span className="font-semibold text-arena-gold">{inr.format(monthlyGoal?.target || 0)}</span>
                </span>
                <span>
                  Current MTD:{" "}
                  <span className="font-semibold text-white">{inr.format(monthlyGoal?.currentMtdRevenue || 0)}</span>
                </span>
                <span>
                  Percentage Achieved: <span className="font-semibold text-white">{monthlyGoalPercentage.toFixed(2)}%</span>
                </span>
              </div>

              <div className="mt-4 text-2xl font-display font-extrabold text-white sm:text-3xl">
                <AnimatedNumber value={monthlyGoal?.currentMtdRevenue || 0} formatter={(num) => inr.format(num)} /> /{" "}
                <AnimatedNumber value={monthlyGoal?.target || 0} formatter={(num) => inr.format(num)} /> (
                {Math.round(monthlyGoalPercentage)}%)
              </div>
              <p className="mt-1 text-sm uppercase tracking-[0.16em] text-white/70">
                Remaining:{" "}
                <span className="font-semibold text-arena-red">
                  <AnimatedNumber value={monthlyGoal?.remainingRevenue || 0} formatter={(num) => inr.format(num)} />
                </span>
              </p>

              <div className="mt-4 h-5 overflow-hidden rounded-full border border-white/15 bg-black/60">
                <motion.div
                  className={`h-full ${monthlyGoalProgressClass} ${goalPulse ? "revenue-progress-pulse" : ""}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${monthlyGoalBarWidth}%` }}
                  transition={{ duration: 0.75 }}
                />
              </div>

              {!monthlyGoal?.targetSet ? (
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-arena-red">
                  Set this month&apos;s target to activate goal tracking.
                </p>
              ) : null}
            </div>

            <div
              className={`w-full rounded-xl border p-4 lg:max-w-[360px] ${
                !monthlyGoal?.targetSet
                  ? "border-white/20 bg-black/35"
                  : monthlyGoalProjection?.isAboveTarget
                  ? "border-emerald-400/45 bg-emerald-900/20"
                  : "border-arena-red/50 bg-arena-red/10"
              }`}
            >
              <p className="text-xs uppercase tracking-[0.18em] text-white/65">Projected Month End Revenue</p>
              <p
                className={`mt-2 font-display text-3xl font-black ${
                  !monthlyGoal?.targetSet
                    ? "text-white"
                    : monthlyGoalProjection?.isAboveTarget
                      ? "text-emerald-300"
                      : "text-red-300"
                }`}
              >
                <AnimatedNumber
                  value={monthlyGoalProjection?.projectedMonthEndRevenue || 0}
                  formatter={(num) => inr.format(num)}
                />
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.14em] text-white/65">
                Avg Daily {inr.format(monthlyGoalProjection?.averageDailyRevenue || 0)} x{" "}
                {monthlyGoalProjection?.daysRemaining || 0} days remaining
              </p>
              <p
                className={`mt-2 text-sm font-semibold ${
                  !monthlyGoal?.targetSet
                    ? "text-white/80"
                    : monthlyGoalProjection?.isAboveTarget
                      ? "text-emerald-300"
                      : "text-red-300"
                }`}
              >
                {!monthlyGoal?.targetSet
                  ? "Set a target to evaluate target pace."
                  : monthlyGoalProjection?.isAboveTarget
                    ? "Projection is above target pace."
                    : "Projection is below target pace."}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-white/12 bg-black/35 p-4">
            <h3 className="font-display text-xl tracking-[0.12em] text-arena-gold">Revenue Contribution Breakdown</h3>
            <div className="mt-4 space-y-4">
              {monthlyGoalContribution.map((entry) => (
                <div key={`contribution-${entry.name}`}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-white">{entry.name}</span>
                    <span className="text-white/80">
                      {inr.format(entry.revenue)} ({entry.percentage}%)
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className={`h-full ${
                        entry.name === "Vishal"
                          ? "bg-gradient-to-r from-arena-red to-arena-ember"
                          : "bg-gradient-to-r from-arena-gold to-yellow-300"
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(Math.max(entry.percentage || 0, 0), 100)}%` }}
                      transition={{ duration: 0.65 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-white/12 bg-black/35 p-4">
            <h3 className="font-display text-xl tracking-[0.12em] text-arena-gold">Revenue Growth Trend</h3>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/60">
              Cumulative MTD revenue vs target pace
            </p>
            <RevenueGrowthChart points={monthlyRevenueTrend} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <CallMixPieChart
              title="Vishal Daily Call Mix"
              subtitle={`Auto-updated for ${summary?.date || "today"}`}
              mix={vishalDailyCallMix}
            />

            <CallMixPieChart
              title="Aryan Daily Call Mix"
              subtitle={`Auto-updated for ${summary?.date || "today"}`}
              mix={aryanDailyCallMix}
            />

            <CallMixPieChart
              title="Universal Monthly Call Mix"
              subtitle={`${monthlyGoalLabel} to date (resets on month change)`}
              mix={monthlyCallMix}
            />
          </div>

          <AnimatePresence>
            {monthlyGoalAchievedForCurrentMonth ? (
              <motion.div
                key={`monthly-goal-banner-${monthlyGoalMonthKey}`}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="mt-5 rounded-xl border border-arena-gold bg-gradient-to-r from-arena-gold/30 to-yellow-200/20 p-4 text-center font-display tracking-[0.18em] text-arena-gold"
              >
                Monthly Target Achieved 🎯
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>

        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <TopStat label="Leads Today" value={summary?.totals?.leadsReceivedToday || 0} glow="gold" />
          <TopStat label="Calls Done" value={summary?.totals?.callsDone || 0} glow="red" />
          <TopStat label="No Response" value={summary?.totals?.callsNotReceived || 0} glow="red" />
          <TopStat label="Interested" value={summary?.totals?.interested || 0} glow="gold" />
          <TopStat label="Not Interested" value={summary?.totals?.notInterested || 0} glow="red" />
          <TopStat label="Demos" value={summary?.totals?.demoMeetingsBooked || 0} glow="gold" />
          <TopStat label="Closures" value={summary?.totals?.closures || 0} glow="red" />
          <TopStat
            label="Revenue"
            value={summary?.totals?.revenue || 0}
            formatter={(num) => inr.format(num)}
            glow="gold"
          />
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_280px_1fr]">
          <div>{sortedUsers[0] ? <UserCard user={sortedUsers[0]} isLeader={summary?.leader === sortedUsers[0].name} /> : null}</div>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col justify-center rounded-2xl border border-arena-gold/30 bg-black/50 p-5"
          >
            <p className="text-center font-display text-lg tracking-[0.18em] text-arena-gold">RACE TO 20</p>
            <div className="mt-6 space-y-4">
              {sortedUsers.map((salesUser) => (
                <div key={`race-${salesUser.name}`}>
                  <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wider text-white/75">
                    <span>{salesUser.name}</span>
                    <span>{salesUser.websiteClosuresToday}/20</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className={`h-full ${
                        salesUser.name === "Vishal"
                          ? "bg-gradient-to-r from-arena-red to-arena-ember"
                          : "bg-gradient-to-r from-arena-gold to-yellow-300"
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(salesUser.progressTo20, 100)}%` }}
                      transition={{ duration: 0.7 }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-3 text-xs uppercase tracking-wider text-white/70">
              <div className="mb-1 flex justify-between">
                <span>Connect Rate</span>
                <span>{summary?.analytics?.teamCallConnectRate || 0}%</span>
              </div>
              <div className="mb-1 flex justify-between">
                <span>Interest Rate</span>
                <span>{summary?.analytics?.teamInterestRate || 0}%</span>
              </div>
              <div className="flex justify-between">
                <span>Demo Rate</span>
                <span>{summary?.analytics?.teamDemoBookingRate || 0}%</span>
              </div>
            </div>
          </motion.div>
          <div>{sortedUsers[1] ? <UserCard user={sortedUsers[1]} isLeader={summary?.leader === sortedUsers[1].name} /> : null}</div>
        </section>

        <AnimatePresence>
          {unlockMessage ? (
            <motion.div
              key="unlock-message"
              initial={{ opacity: 0, y: -15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="mb-6 rounded-xl border border-arena-gold bg-gradient-to-r from-arena-gold/30 to-yellow-200/20 p-4 text-center font-display tracking-widest text-arena-gold"
            >
              Rs500 Incentive Unlocked: {unlockMessage}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {user.role === "sales" ? (
          <section className="mb-6 rounded-2xl border border-arena-red/40 bg-black/45 p-5">
            <h2 className="mb-4 font-display text-2xl tracking-widest text-arena-red">Sales Update</h2>
            <form className="space-y-4" onSubmit={submitSalesUpdate}>
              <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                <p className="mb-3 text-xs uppercase tracking-[0.2em] text-arena-gold">Call Flow (Chronology)</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <NumberInput label="Calls Done" value={salesForm.callsDoneToday} onChange={(value) => updateSalesField("callsDoneToday", value)} />
                  <NumberInput label="Interested" value={salesForm.interested} onChange={(value) => updateSalesField("interested", value)} />
                  <NumberInput label="Not Interested" value={salesForm.notInterested} onChange={(value) => updateSalesField("notInterested", value)} />
                  <NumberInput label="Will Call Back" value={salesForm.willCallBack} onChange={(value) => updateSalesField("willCallBack", value)} />
                  <NumberInput label="Calls Not Received" value={salesForm.callsNotReceived} onChange={(value) => updateSalesField("callsNotReceived", value)} />
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                <p className="mb-3 text-xs uppercase tracking-[0.2em] text-arena-gold">Follow-up to Closure</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <NumberInput label="Followups Done" value={salesForm.followupsDone} onChange={(value) => updateSalesField("followupsDone", value)} />
                  <NumberInput label="Demo Meetings Booked" value={salesForm.demoMeetingsBooked} onChange={(value) => updateSalesField("demoMeetingsBooked", value)} />
                  <NumberInput label="Closures Today" value={salesForm.closuresToday} onChange={(value) => updateSalesField("closuresToday", value)} />
                  <NumberInput label="Website Closures" value={salesForm.websiteClosuresToday} onChange={(value) => updateSalesField("websiteClosuresToday", value)} />
                </div>
              </div>

              <div className="rounded-xl border border-arena-gold/50 bg-gradient-to-r from-arena-gold/15 to-yellow-200/5 p-4 shadow-glowGold">
                <p className="mb-3 text-xs uppercase tracking-[0.2em] text-arena-gold">Revenue Section</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberInput label="Revenue Today" value={salesForm.revenueToday} onChange={(value) => updateSalesField("revenueToday", value)} />
                </div>
              </div>

              {isSalesFormDirty ? (
                <p className="text-xs uppercase tracking-[0.2em] text-arena-gold">Unsaved updates in progress</p>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-lg bg-gradient-to-r from-arena-red to-arena-ember px-4 py-3 font-bold uppercase tracking-widest transition hover:shadow-glowRed"
              >
                Save Daily Update
              </button>
            </form>
          </section>
        ) : (
          <section className="mb-6 rounded-2xl border border-arena-gold/35 bg-black/45 p-5">
            <h2 className="mb-4 font-display text-2xl tracking-widest text-arena-gold">Admin Command</h2>
            <form
              className="mb-5 rounded-xl border border-white/12 bg-black/35 p-4"
              onSubmit={saveMonthlyRevenueTarget}
            >
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-arena-gold">Monthly Revenue Target</p>
              <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
                <label>
                  <span className="mb-1 block text-xs uppercase tracking-wider text-white/70">Month</span>
                  <input
                    type="month"
                    className="w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm outline-none transition focus:border-arena-gold"
                    value={goalConfig.monthValue}
                    onChange={(event) => {
                      const monthValue = event.target.value;
                      setGoalConfig((prev) => ({ ...prev, monthValue }));
                      loadRevenueTargetForMonth(monthValue);
                    }}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs uppercase tracking-wider text-white/70">Revenue Target</span>
                  <input
                    min="0"
                    type="number"
                    className="w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm outline-none transition focus:border-arena-gold"
                    value={goalConfig.revenueTarget}
                    onChange={(event) =>
                      setGoalConfig((prev) => ({
                        ...prev,
                        revenueTarget: Math.max(0, Number(event.target.value) || 0),
                      }))
                    }
                  />
                </label>
                <button
                  type="submit"
                  disabled={goalConfigSaving}
                  className="rounded-lg border border-arena-gold px-4 py-2 text-sm font-semibold text-arena-gold transition hover:bg-arena-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {goalConfigSaving ? "Saving..." : "Update Target"}
                </button>
              </div>
              <p className="mt-2 text-xs uppercase tracking-[0.14em] text-white/60">
                {goalConfigLoading
                  ? "Loading configured target..."
                  : `Configured target: ${inr.format(goalConfig.revenueTarget || 0)}`}
              </p>
            </form>

            <div className="mb-5 flex flex-wrap gap-3">
              <button type="button" onClick={exportCsv} className="rounded-lg border border-arena-gold px-4 py-2 font-semibold text-arena-gold transition hover:bg-arena-gold/20">
                Export CSV
              </button>
              <button type="button" onClick={sendDailyReportNow} className="rounded-lg border border-arena-red px-4 py-2 font-semibold text-arena-red transition hover:bg-arena-red/20">
                Send Daily Analytical Report
              </button>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-white/15 bg-black/45 p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-display text-2xl tracking-widest text-arena-gold">Lead Tracker</h2>
              <p className="text-xs uppercase tracking-wider text-white/60">Track status, call outcomes, follow-up dates, notes, and revenue per lead</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Search name / phone / email / lead id"
                className="min-w-[240px] rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm outline-none transition focus:border-arena-gold"
                value={leadFilters.search}
                onChange={(event) => setLeadFilters((prev) => ({ ...prev, search: event.target.value }))}
              />
              <select
                className="rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm outline-none transition focus:border-arena-gold"
                value={leadFilters.status}
                onChange={(event) => setLeadFilters((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="">All Statuses</option>
                {leadOptions.statuses.map((status) => (
                  <option key={`status-${status}`} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button type="button" onClick={fetchLeads} className="rounded-lg border border-arena-red px-3 py-2 text-sm font-semibold text-arena-red transition hover:bg-arena-red/20">
                Refresh Leads
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="min-w-[1160px] text-left text-sm">
              <thead className="bg-white/10 text-xs uppercase tracking-wider text-white/75">
                <tr>
                  <th className="px-3 py-2">Lead</th>
                  <th className="px-3 py-2">Assigned</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Outcome</th>
                  <th className="px-3 py-2">Demo</th>
                  <th className="px-3 py-2">Next Follow-up</th>
                  <th className="px-3 py-2">Revenue</th>
                  <th className="px-3 py-2">Closure Type</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const edit = leadEditMap[lead.id] || buildLeadEditState(lead);
                  return (
                    <tr key={`lead-${lead.id}`} className="border-t border-white/10 align-top">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-white">{lead.name || "Unnamed Lead"}</div>
                        <div className="text-xs text-white/60">{lead.phone || "-"}</div>
                        <div className="text-xs text-white/60">{lead.email || "-"}</div>
                        <div className="mt-1 text-[11px] text-arena-gold">#{lead.privyr_lead_id}</div>
                        <div className="text-[11px] text-white/55">Source: {lead.source || "Unknown"}</div>
                      </td>
                      <td className="px-3 py-2">{lead.assigned_to || "-"}</td>
                      <td className="px-3 py-2">
                        <select className="w-full rounded-lg border border-white/15 bg-zinc-900 px-2 py-1" value={edit.status} onChange={(event) => onLeadEditChange(lead.id, "status", event.target.value)}>
                          {(leadOptions.statuses.length > 0 ? leadOptions.statuses : [edit.status]).map((status) => (
                            <option key={`${lead.id}-status-${status}`} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select className="w-full rounded-lg border border-white/15 bg-zinc-900 px-2 py-1" value={edit.callOutcome} onChange={(event) => onLeadEditChange(lead.id, "callOutcome", event.target.value)}>
                          <option value="">-</option>
                          {leadOptions.callOutcomes.map((outcome) => (
                            <option key={`${lead.id}-outcome-${outcome}`} value={outcome}>
                              {outcome}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={Boolean(edit.demoBooked)} onChange={(event) => onLeadEditChange(lead.id, "demoBooked", event.target.checked)} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="datetime-local" className="w-full rounded-lg border border-white/15 bg-zinc-900 px-2 py-1" value={edit.nextFollowupAt} onChange={(event) => onLeadEditChange(lead.id, "nextFollowupAt", event.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" className="w-full rounded-lg border border-white/15 bg-zinc-900 px-2 py-1" value={edit.revenue} onChange={(event) => onLeadEditChange(lead.id, "revenue", Number(event.target.value))} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" className="w-full rounded-lg border border-white/15 bg-zinc-900 px-2 py-1" value={edit.closureType} onChange={(event) => onLeadEditChange(lead.id, "closureType", event.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <textarea rows={2} className="w-full rounded-lg border border-white/15 bg-zinc-900 px-2 py-1" value={edit.notes} onChange={(event) => onLeadEditChange(lead.id, "notes", event.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => saveLeadTracking(lead.id)} className="rounded-lg border border-arena-gold px-2 py-1 text-xs font-semibold text-arena-gold transition hover:bg-arena-gold/20">
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {leadLoading ? <p className="mt-3 text-xs text-white/65">Refreshing leads...</p> : null}
        </section>

        <div className="mt-4 text-sm text-white/70">
          {loadingSummary ? "Refreshing arena data..." : actionMessage || "Arena synced."}
          {error ? <span className="ml-3 text-red-400">{error}</span> : null}
        </div>
      </div>
    </div>
  );
}

function TopStat({ label, value, formatter, glow = "gold" }) {
  const glowClass = glow === "gold" ? "text-glow-gold" : "text-glow-red";
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-black/45 p-4"
    >
      <p className="text-xs uppercase tracking-[0.2em] text-white/65">{label}</p>
      <p className={`mt-2 text-2xl font-display font-black ${glowClass}`}>
        <AnimatedNumber value={value} formatter={formatter || ((num) => Math.round(num).toString())} />
      </p>
    </motion.div>
  );
}

function NumberInput({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wider text-white/75">{label}</span>
      <input
        min="0"
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 outline-none transition focus:border-arena-gold"
      />
    </label>
  );
}

function RevenueGrowthChart({ points }) {
  const chartPoints = Array.isArray(points) ? points : [];
  if (chartPoints.length === 0) {
    return <p className="mt-5 text-sm text-white/65">No month trend data yet.</p>;
  }

  const width = 640;
  const height = 240;
  const paddingLeft = 34;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 34;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxValue = Math.max(
    ...chartPoints.map((point) =>
      Math.max(Number(point.cumulativeRevenue || 0), Number(point.targetPaceRevenue || 0))
    ),
    1
  );
  const targetPaceEnabled = chartPoints.some((point) => Number(point.targetPaceRevenue || 0) > 0);

  const toX = (index) =>
    paddingLeft + (chartPoints.length <= 1 ? chartWidth / 2 : (index / (chartPoints.length - 1)) * chartWidth);
  const toY = (value) => paddingTop + (1 - Number(value || 0) / maxValue) * chartHeight;

  const cumulativeCoords = chartPoints.map((point, index) => ({
    x: toX(index),
    y: toY(point.cumulativeRevenue),
  }));
  const targetCoords = chartPoints.map((point, index) => ({
    x: toX(index),
    y: toY(point.targetPaceRevenue),
  }));

  const cumulativePath = cumulativeCoords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const targetPath = targetCoords
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const firstPoint = chartPoints[0];
  const middlePoint = chartPoints[Math.floor((chartPoints.length - 1) / 2)];
  const lastPoint = chartPoints[chartPoints.length - 1];
  const latestCumulative = Number(lastPoint?.cumulativeRevenue || 0);
  const latestTargetPace = Number(lastPoint?.targetPaceRevenue || 0);

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.14em] text-white/70">
        <span className="flex items-center gap-2">
          <span className="h-2 w-8 rounded-full bg-arena-gold" />
          Cumulative Revenue
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2 w-8 rounded-full bg-arena-red" />
          Target Pace
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = paddingTop + chartHeight * ratio;
          return (
            <line
              key={`grid-${ratio}`}
              x1={paddingLeft}
              y1={y}
              x2={width - paddingRight}
              y2={y}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
          );
        })}

        {targetPaceEnabled ? (
          <path
            d={targetPath}
            fill="none"
            stroke="#d62828"
            strokeWidth="2.3"
            strokeDasharray="6 6"
            strokeLinecap="round"
          />
        ) : null}

        <path
          d={cumulativePath}
          fill="none"
          stroke="#f2c14e"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle
          cx={cumulativeCoords[cumulativeCoords.length - 1]?.x || 0}
          cy={cumulativeCoords[cumulativeCoords.length - 1]?.y || 0}
          r="4.5"
          fill="#f2c14e"
        />

        <text x={paddingLeft} y={height - 10} fill="rgba(255,255,255,0.65)" fontSize="11">
          Day {firstPoint?.day || 1}
        </text>
        <text
          x={(paddingLeft + width - paddingRight) / 2}
          y={height - 10}
          textAnchor="middle"
          fill="rgba(255,255,255,0.65)"
          fontSize="11"
        >
          Day {middlePoint?.day || 1}
        </text>
        <text
          x={width - paddingRight}
          y={height - 10}
          textAnchor="end"
          fill="rgba(255,255,255,0.65)"
          fontSize="11"
        >
          Day {lastPoint?.day || 1}
        </text>
      </svg>

      <div className="mt-2 grid gap-2 text-xs uppercase tracking-[0.12em] text-white/70 sm:grid-cols-2">
        <span>Current Growth: {inr.format(latestCumulative)}</span>
        <span>Target Pace by Today: {inr.format(latestTargetPace)}</span>
      </div>
    </div>
  );
}

function CallMixPieChart({ title, subtitle, mix }) {
  const colorsByKey = {
    callsDone: "#f2c14e",
    callsConnected: "#22c55e",
    callsInterested: "#60a5fa",
    callsNotInterested: "#d62828",
    callsNotConnected: "#ff6b35",
  };

  const slices = (mix?.slices || []).map((item) => ({
    ...item,
    color: colorsByKey[item.key] || "#ffffff",
  }));
  const nonZeroSlices = slices.filter((item) => Number(item.value || 0) > 0);
  const totalForPie = Number(mix?.totalForPie || 0);

  return (
    <div className="rounded-xl border border-white/12 bg-black/35 p-4">
      <h3 className="font-display text-lg tracking-[0.12em] text-arena-gold">{title}</h3>
      <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-white/60">{subtitle}</p>

      {totalForPie <= 0 ? (
        <p className="mt-6 text-sm text-white/65">No call data available yet.</p>
      ) : (
        <>
          <div className="mt-4 flex justify-center">
            <div className="relative h-48 w-48">
              <svg viewBox="0 0 220 220" className="h-full w-full">
                {buildPieSegments(nonZeroSlices, 110, 110, 98, totalForPie).map((segment) =>
                  segment.fullCircle ? (
                    <circle
                      key={`slice-${segment.key}`}
                      cx="110"
                      cy="110"
                      r="98"
                      fill={segment.color}
                    />
                  ) : (
                    <path key={`slice-${segment.key}`} d={segment.path} fill={segment.color} />
                  )
                )}
                <circle cx="110" cy="110" r="60" fill="rgba(10,10,10,0.95)" />
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <p className="text-xs uppercase tracking-[0.14em] text-white/60">Calls Done</p>
                <p className="font-display text-2xl text-white">{mix?.callAttempts || 0}</p>
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-1.5 text-xs">
            {slices.map((slice) => (
              <div
                key={`legend-${title}-${slice.key}`}
                className="flex items-center justify-between rounded-md border border-white/10 bg-black/25 px-2 py-1.5"
              >
                <span className="flex items-center gap-2 text-white/80">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                  {slice.label}
                </span>
                <span className="font-semibold text-white">
                  {slice.value} ({Number(slice.percentage || 0).toFixed(2)}%)
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function buildCallMixFromUserMetrics(userMetrics) {
  const callsDone = Number(userMetrics?.callsDoneToday || 0);
  const interested = Number(userMetrics?.interested || 0);
  const notInterested = Number(userMetrics?.notInterested || 0);
  const willCallBack = Number(userMetrics?.willCallBack || 0);
  const callsNotReceived = Number(userMetrics?.callsNotReceived || 0);

  const callAttempts = callsDone + callsNotReceived;
  const callsConnected = Math.max(callsDone - willCallBack, 0);
  const callsNotConnected = callsNotReceived + willCallBack;

  const slices = [
    { key: "callsDone", label: "Calls Done", value: callAttempts },
    { key: "callsConnected", label: "Calls Connected", value: callsConnected },
    { key: "callsInterested", label: "Calls Interested", value: interested },
    { key: "callsNotInterested", label: "Calls Not Interested", value: notInterested },
    { key: "callsNotConnected", label: "Calls Not Connected", value: callsNotConnected },
  ];

  const totalForPie = slices.reduce((sum, item) => sum + item.value, 0);
  return {
    callAttempts,
    totalForPie,
    slices: slices.map((slice) => ({
      ...slice,
      percentage: safePercentValue(slice.value, totalForPie),
    })),
  };
}

function safePercentValue(numerator, denominator) {
  const n = Number(numerator) || 0;
  const d = Number(denominator) || 0;
  if (d <= 0) return 0;
  return Number(((n / d) * 100).toFixed(2));
}

function buildPieSegments(slices, cx, cy, radius, total) {
  if (!Array.isArray(slices) || slices.length === 0 || total <= 0) {
    return [];
  }

  if (slices.length === 1) {
    return [{ key: slices[0].key, color: slices[0].color, fullCircle: true }];
  }

  let currentAngle = -90;
  return slices.map((slice) => {
    const angle = (Number(slice.value || 0) / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    return {
      key: slice.key,
      color: slice.color,
      fullCircle: false,
      path: describePieArc(cx, cy, radius, startAngle, endAngle),
    };
  });
}

function describePieArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

function polarToCartesian(cx, cy, radius, angleDegrees) {
  const angleRadians = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: Number((cx + radius * Math.cos(angleRadians)).toFixed(3)),
    y: Number((cy + radius * Math.sin(angleRadians)).toFixed(3)),
  };
}
