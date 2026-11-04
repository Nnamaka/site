"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

// Same origin: /api/auth/* is rewritten to the gateway → backend/fynd.
export const authClient = createAuthClient({ plugins: [emailOTPClient()] });
export const { useSession, signOut } = authClient;
