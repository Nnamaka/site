"use client";

import { Radar, ShieldCheck, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Field } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waking, setWaking] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Render's free tier sleeps; ping early so the server is warm by the time the code is requested.
  useEffect(() => {
    const slow = setTimeout(() => setWaking(true), 2500);
    fetch("/api/health").finally(() => {
      clearTimeout(slow);
      setWaking(false);
    });
    return () => clearTimeout(slow);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
    setBusy(false);
    if (error) return setError(error.message ?? "Couldn't send the code.");
    setStep("otp");
    setCooldown(45);
  }

  async function verify(code = otp) {
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code });
    setBusy(false);
    if (error) return setError(error.message ?? "That code didn't work.");
    router.replace(next);
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-neutral-100 p-6">
      <div className="grid w-full max-w-[880px] overflow-hidden rounded-xl border bg-card shadow-xs md:grid-cols-2">
        <div className="flex flex-col justify-center gap-5 p-8">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Radar className="size-4" />
            Fynd
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-bold">Sign in to Fynd</h1>
            <p className="text-[13px] text-muted-foreground">
              {step === "email" ? "We'll email you a one-time code. No password needed." : `Enter the code sent to ${email}.`}
            </p>
          </div>

          {step === "email" ? (
            <form onSubmit={sendCode} className="flex flex-col gap-3">
              <Field label="Email" htmlFor="email" hint="Use the address your Fynd account was created with.">
                <Input id="email" type="email" required autoFocus autoComplete="email" placeholder="m@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Button type="submit" disabled={busy || !email}>
                {busy ? "Sending…" : "Send code"}
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <Field label="6-digit code" hint="Expires in 10 minutes.">
                <InputOTP
                  maxLength={6}
                  value={otp}
                  autoFocus
                  onChange={setOtp}
                  onComplete={(v: string) => verify(v)}
                  containerClassName="justify-start"
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }, (_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </Field>
              <Button onClick={() => verify()} disabled={busy || otp.length < 6}>
                {busy ? "Verifying…" : "Verify and sign in"}
              </Button>
              <div className="flex items-center justify-between text-xs">
                <Button variant="link" className="text-xs" onClick={() => (setStep("email"), setOtp(""), setError(null))}>
                  Use a different email
                </Button>
                {cooldown > 0 ? (
                  <span className="text-muted-foreground">Resend in 0:{String(cooldown).padStart(2, "0")}</span>
                ) : (
                  <Button variant="link" className="text-xs" onClick={() => sendCode()}>
                    Resend code
                  </Button>
                )}
              </div>
            </div>
          )}

          {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
          {waking ? <p className="text-xs text-muted-foreground">Waking the server. The first request after a quiet spell can take up to a minute.</p> : null}

          <div className="flex flex-col gap-1.5 border-t pt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3" />
              You stay signed in on this device until you log out.
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-3" />
              Invite-only · registration closes at 7 accounts
            </span>
          </div>
        </div>
        <div className="hidden flex-col justify-end gap-1.5 bg-muted p-8 md:flex">
          <div className="text-sm font-semibold">Fynd keeps searching until you stop it.</div>
          <div className="max-w-xs text-xs text-muted-foreground text-pretty">
            Exact matches for up to 3 roles, tailored CVs and cover letters, and a Telegram alert for every application ready to send.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
