import { env } from "../env";

export async function sendMail({ to, subject, text }: { to: string; subject: string; text: string }) {
  if (!env.RESEND_API_KEY) {
    console.log(`\n┌─ [mail:dev] to ${to}\n│  ${subject}\n│  ${text.replace(/\n/g, "\n│  ")}\n└─\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Email failed (${res.status}): ${await res.text()}`);
}
