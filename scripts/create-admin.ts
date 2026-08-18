// Creates (or re-points) the first ADMIN user on a production database.
//
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' \
//     pnpm tsx scripts/create-admin.ts
//
// `prisma db seed` is the wrong tool for this on a live box: it wipes and
// re-creates the whole catalog, and it hardcodes demo passwords (Admin123!,
// mostafa123) that would be sitting on a public login form the moment the
// domain resolves. This script only touches the one User row it is given, and
// takes the password from the environment so it never lands in the repo.
//
// Idempotent: run it again with a new ADMIN_PASSWORD to rotate the password of
// an existing account rather than failing on the unique email.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient, UserRole, UserStatus } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}. Usage:`);
    console.error(
      "  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' pnpm tsx scripts/create-admin.ts",
    );
    process.exit(1);
  }
  return value;
}

async function main() {
  const email = required("ADMIN_EMAIL").toLowerCase();
  const password = required("ADMIN_PASSWORD");
  const firstName = process.env.ADMIN_FIRST_NAME?.trim() || "Admin";
  const lastName = process.env.ADMIN_LAST_NAME?.trim() || "User";

  // Short passwords are the whole risk this script exists to avoid, so it
  // refuses one rather than quietly accepting it.
  if (password.length < 12) {
    console.error("ADMIN_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    // Only ever raises privileges to ADMIN and resets the password — never
    // renames an existing person.
    update: { passwordHash, role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    create: {
      email,
      passwordHash,
      firstName,
      lastName,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  console.log(`Admin ready: ${user.email} (${user.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
