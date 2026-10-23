// "Good morning, Danielle" for the home hero, on the Manila clock (the server may run in UTC).
const manilaHour = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: "Asia/Manila",
});

export function greeting(fullName?: string | null, now: Date = new Date()): string {
  const hour = Number(manilaHour.format(now));
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const name = firstName(fullName);
  return name ? `${part}, ${name}` : part;
}

// SLU class lists write "Last, First Middle"; profiles may also hold "First Last".
export function firstName(fullName?: string | null): string | null {
  const name = fullName?.trim();
  if (!name) return null;
  const given = name.includes(",") ? name.split(",")[1].trim() : name;
  return given.split(/\s+/)[0] || null;
}
