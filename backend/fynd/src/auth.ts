import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { db } from "./db";
import { csv, env } from "./env";
import { sendMail } from "./lib/mail";
import { bootstrapUser } from "./services/bootstrap";

/** Invite-only: existing users always pass; new emails need an invite (if a list is set) and a free seat. */
export async function assertCanRegister(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return;
  const invites = csv(env.INVITE_EMAILS).map((e) => e.toLowerCase());
  if (invites.length && !invites.includes(email)) {
    throw new APIError("FORBIDDEN", { message: "Fynd is invite-only. Ask for an invite to sign in." });
  }
  if ((await db.user.count()) >= env.MAX_ACCOUNTS) {
    throw new APIError("FORBIDDEN", { message: `Registration is closed: all ${env.MAX_ACCOUNTS} accounts are in use.` });
  }
}

export const auth = betterAuth({
  appName: "Fynd",
  baseURL: env.APP_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  trustedOrigins: [env.APP_URL, ...csv(env.TRUSTED_ORIGINS)],
  // "Stay signed in until you log out": a year, refreshed daily while in use.
  // No cookie cache, so revoking a session takes effect on the next request.
  session: { expiresIn: 60 * 60 * 24 * 365, updateAge: 60 * 60 * 24 },
  advanced: { cookiePrefix: "fynd" },
  rateLimit: { enabled: true, window: 60, max: 30 },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      async sendVerificationOTP({ email, otp }) {
        await assertCanRegister(email);
        await sendMail({
          to: email,
          subject: `${otp} is your Fynd code`,
          text: `Your Fynd sign-in code is ${otp}.\n\nIt expires in 10 minutes. If you didn't request it, ignore this email.`,
        });
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          await assertCanRegister(user.email);
          return { data: { ...user, name: user.name || user.email.split("@")[0] } };
        },
        after: async (user) => {
          await bootstrapUser(user.id);
        },
      },
    },
  },
});

export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;
