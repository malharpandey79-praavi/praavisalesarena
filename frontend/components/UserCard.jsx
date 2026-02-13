import { motion } from "framer-motion";
import AnimatedNumber from "./AnimatedNumber";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function UserCard({ user, isLeader }) {
  const borderClass = user.name === "Vishal" ? "border-arena-red/50" : "border-arena-gold/50";
  const glowClass = user.name === "Vishal" ? "text-glow-red" : "text-glow-gold";
  const progressColor = user.name === "Vishal" ? "from-arena-red to-arena-ember" : "from-arena-gold to-yellow-300";

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className={`relative overflow-hidden rounded-2xl border ${borderClass} bg-arena-panel/85 p-6 shadow-lg`}
    >
      <div className="absolute inset-0 opacity-35">
        <div
          className={`h-full w-full bg-gradient-to-br ${
            user.name === "Vishal"
              ? "from-arena-red/30 via-transparent to-black"
              : "from-arena-gold/30 via-transparent to-black"
          }`}
        />
      </div>
      <div className="relative z-10">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-3xl tracking-wide">{user.name}</h3>
          {isLeader ? (
            <motion.div
              className="flex items-center gap-2 rounded-full border border-arena-gold/70 bg-arena-gold/20 px-3 py-1 text-xs font-bold text-arena-gold"
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              <span className="inline-block animate-pulseCrown text-xs">CROWN</span>
              LEADER
            </motion.div>
          ) : (
            <span className="rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-wider text-white/60">
              Challenger
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <Stat label="Total Leads Today" value={user.totalLeadsToday} />
          <Stat label="Followups Done" value={user.followupsDone} />
          <Stat label="Closures Today" value={user.closuresToday} />
          <Stat label="Streak" value={user.streak} suffix=" days" />
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-4">
          <p className="text-xs uppercase tracking-widest text-white/60">Websites Closed</p>
          <AnimatedNumber
            value={user.websiteClosuresToday}
            className={`block text-5xl font-display font-extrabold ${glowClass}`}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs uppercase tracking-widest text-white/60">Revenue</p>
            <AnimatedNumber
              value={user.revenueToday}
              formatter={(num) => inr.format(num)}
              className={`text-2xl font-bold ${glowClass}`}
            />
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs uppercase tracking-widest text-white/60">Incentives</p>
            <AnimatedNumber
              value={user.incentivesEarned}
              formatter={(num) => inr.format(num)}
              className={`text-2xl font-bold ${glowClass}`}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-3">
          <MiniStat label="Calls Done" value={user.callsDoneToday} />
          <MiniStat label="Demos Booked" value={user.demoMeetingsBooked} />
          <MiniStat label="Interested" value={user.interested} />
          <MiniStat label="Not Interested" value={user.notInterested} />
          <MiniStat label="Will Call Back" value={user.willCallBack} />
          <MiniStat label="No Response" value={user.callsNotReceived} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <MiniStat label="Connect Rate" value={`${user.callConnectRate || 0}%`} />
          <MiniStat label="Interest Rate" value={`${user.interestRate || 0}%`} />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-white/70">
            <span>Race to 20</span>
            <span>{Math.min(user.websiteClosuresToday, 20)}/20</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className={`h-full bg-gradient-to-r ${progressColor}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(user.progressTo20, 100)}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
        </div>

        {user.slabUnlocked ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-xl border border-arena-gold bg-gradient-to-r from-arena-gold/25 to-yellow-200/15 p-3 text-center text-sm font-bold text-arena-gold"
          >
            Rs500 Incentive Unlocked
          </motion.div>
        ) : null}
      </div>
    </motion.section>
  );
}

function Stat({ label, value, suffix = "" }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <p className="text-xs uppercase tracking-wider text-white/60">{label}</p>
      <p className="text-xl font-semibold">
        <AnimatedNumber value={value} />
        {suffix}
      </p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-2">
      <p className="uppercase tracking-wide text-white/60">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
