import path from "node:path";
import dotenv from "dotenv";
import { execSync } from "node:child_process";

// Deliberately does NOT load the default .env first — this must always
// target db_test (.env.test), never the dev database on port 5434.
// `override: true` so a stray DATABASE_URL already in the shell env can't
// silently redirect this at the dev database either.
dotenv.config({ path: path.resolve(__dirname, "../.env.test"), override: true });

function run(command: string) {
  execSync(command, { stdio: "inherit", env: process.env });
}

run("pnpm exec prisma migrate deploy");
run("pnpm exec prisma db seed");
