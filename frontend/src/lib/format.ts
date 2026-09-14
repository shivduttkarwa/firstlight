const rupee = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const rupeePaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

export function money(value: string | number, paise = false) {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return paise || n % 1 !== 0 ? rupeePaise.format(n) : rupee.format(n);
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function longDate(iso: string) {
  return parseISO(iso).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

export function shortDate(iso: string) {
  return parseISO(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "Today", "Tomorrow", else "Thu 4 Sep". */
export function relativeDay(iso: string) {
  const target = parseISO(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return target.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

/** Reads naturally after the word "next": "today", "tomorrow", "on Thu 4 Sep". */
export function nextDayPhrase(iso: string) {
  const word = relativeDay(iso);
  return word === "Today" || word === "Tomorrow" ? word.toLowerCase() : `on ${word}`;
}

export function frequencyLabel(frequency: string, weekdays: number[] = []) {
  if (frequency === "daily") return "Every day";
  if (frequency === "alternate") return "Every other day";
  if (frequency === "monthly") return "Once a month";
  if (!weekdays.length) return "Chosen days";
  if (weekdays.length === 7) return "Every day";
  return weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAYS[d])
    .join(", ");
}

/** "Good morning" / "Good afternoon" / "Good evening", by the clock. */
export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export const slotLabel = (slot: string) => (slot === "morning" ? "Morning" : "Evening");
export const slotTime = (slot: string) => (slot === "morning" ? "5.30 – 8.00 am" : "5.00 – 7.30 pm");

/** Strip Wagtail rich text down to paragraphs we can render safely. */
export function richTextToParagraphs(html: string): string[] {
  if (!html) return [];
  return html
    .split(/<\/p>/i)
    .map((chunk) => chunk.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .map((text) => {
      const el = document.createElement("textarea");
      el.innerHTML = text;
      return el.value;
    });
}

const parseHtml = (html: string) => new DOMParser().parseFromString(html ?? "", "text/html").body;

/** Plain sentences out of stored text that may carry a little HTML. */
export function stripTags(value: string) {
  return (parseHtml(value).textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Rich text as paragraphs split by a blank line, for editing in a plain textarea. */
export function htmlToParagraphs(html: string) {
  const blocks = [...parseHtml(html).querySelectorAll("p")].map((p) => (p.textContent ?? "").trim()).filter(Boolean);
  return blocks.length ? blocks.join("\n\n") : stripTags(html);
}

export function paragraphsToHtml(text: string) {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim().replace(/\s*\n\s*/g, " "))
    .filter(Boolean)
    .map((p) => `<p>${escape(p)}</p>`)
    .join("");
}

/** "paneer" → "Paneer", "desi-butter" → "Desi butter". */
export function kindLabel(kind: string) {
  return kind.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}
