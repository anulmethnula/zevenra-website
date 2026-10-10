import { spawn } from "node:child_process";

const child = spawn("vercel", ["dev", "--local-config", "vercel.local.json"], {
  stdio: "inherit",
  // Vercel CLI 62's background update worker can emit EPIPE under Node 24 on
  // Windows. Noninteractive mode skips that worker; it does not alter the
  // local project link or production configuration.
  env: { ...process.env, CI: process.env.CI || "1" },
  shell: process.platform === "win32",
});

child.on("error", (error) => {
  console.error("Could not start Vercel dev:", error.message);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 0;
});
