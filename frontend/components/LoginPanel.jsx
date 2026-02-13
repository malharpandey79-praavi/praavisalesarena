import { motion } from "framer-motion";

export default function LoginPanel({
  form,
  setForm,
  onSubmit,
  loading,
  error,
  apiBaseUrl,
}) {
  return (
    <div className="arena-bg arena-grid flex min-h-screen items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl border border-arena-red/30 bg-black/65 p-8 shadow-glowRed backdrop-blur"
      >
        <h1 className="font-display text-4xl font-black tracking-[0.2em] text-white text-glow-red">
          PRAAVI SALES ARENA
        </h1>
        <p className="mt-2 text-sm uppercase tracking-[0.3em] text-arena-gold">The War Room</p>

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block text-white/75">Username</span>
            <input
              type="text"
              className="w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 outline-none transition focus:border-arena-gold"
              value={form.username}
              onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
              required
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-white/75">Password</span>
            <input
              type="password"
              className="w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 outline-none transition focus:border-arena-red"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-arena-red to-arena-ember px-3 py-2 font-bold uppercase tracking-widest transition hover:shadow-glowRed disabled:opacity-65"
          >
            {loading ? "Entering..." : "Enter Arena"}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

        <div className="mt-6 rounded-lg border border-white/10 bg-black/35 p-3 text-xs text-white/65">
          <p className="mb-1 uppercase tracking-wider text-arena-gold">Backend URL</p>
          <p className="break-all font-mono">{apiBaseUrl}</p>
          <p className="mt-3">Default users: admin, vishal, aryan.</p>
        </div>
      </motion.div>
    </div>
  );
}
