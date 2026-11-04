export const fmt = (n: number) => n.toLocaleString("en-US");

export function formatFound(iso: string, now = new Date()) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startToday) return `Today, ${time}`;
  if (d.getTime() >= startToday - 86_400_000) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

export function relative(iso: string | null, now = Date.now()) {
  if (!iso) return "Never";
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  const days = Math.round(s / 86_400);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const initials = (name: string) =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

export function describeDevice(ua: string | null | undefined): { name: string; kind: "laptop" | "phone" | "tablet" | "desktop" } {
  const u = ua ?? "";
  const browser = /Edg\//.test(u) ? "Edge" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "Browser";
  const os = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Mac OS X/.test(u) ? "macOS" : /Windows/.test(u) ? "Windows" : /Linux/.test(u) ? "Linux" : "Unknown OS";
  const kind = os === "iPhone" || (os === "Android" && /Mobile/.test(u)) ? "phone" : os === "iPad" || os === "Android" ? "tablet" : os === "macOS" ? "laptop" : "desktop";
  return { name: `${browser} on ${os}`, kind };
}
