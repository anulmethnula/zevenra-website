import { spawn } from "node:child_process";

const child = spawn("vercel", ["dev", "--local-config", "vercel.local.json"], {
  stdio: "inherit",
  env: process.env,
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
