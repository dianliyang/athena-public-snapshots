import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { BaseScraper } from "./BaseScraper";
import { Course } from "./types";
import { buildCurrentWorkoutSemester } from "./utils/semester";

const BOOKING_STATUS_MAP: Record<string, string> = {
  bs_btn_abgelaufen: "expired",
  bs_btn_ausgebucht: "fully_booked",
  bs_btn_gesperrt: "blocked",
  bs_btn_siehe_text: "see_text",
  bs_btn_buchen: "available",
  bs_btn_warteliste: "waitlist",
  bs_btn_storniert: "cancelled",
};

function parseBookingStatus(bookingTd: cheerio.Cheerio<AnyNode>): {
  status: string;
  label: string;
} {
  let status = "unknown";

  for (const [cls, mappedStatus] of Object.entries(BOOKING_STATUS_MAP)) {
    if (bookingTd.find(`.${cls}`).length > 0 || bookingTd.html()?.includes(cls)) {
      status = mappedStatus;
      break;
    }
  }

  const btnValue = bookingTd
    .find("input[type='submit'], input[type='button']")
    .attr("value")
    ?.replace(/\s+/g, " ")
    .trim() || "";
  const titleValue = bookingTd
    .find("input[type='submit'], input[type='button']")
    .attr("title")
    ?.toLowerCase() || "";
  const textValue = bookingTd.text().replace(/\s+/g, " ").trim();
  const rawLabel = btnValue || textValue;
  const normalized = rawLabel.toLowerCase();

  const isRestricted = normalized.includes("🔒") || normalized.includes("&#128274;") || titleValue.includes("password protected") || titleValue.includes("passwort");

  if (normalized.includes("ausgebucht")) status = "fully_booked";
  else if (normalized.includes("buchen")) status = isRestricted ? "restricted" : "available";
  else if (normalized.includes("warteliste")) status = isRestricted ? "restricted_waitlist" : "waitlist";
  else if (normalized.includes("gesperrt") || normalized.includes("blocked")) status = "blocked";
  else if (normalized.includes("storniert") || normalized.includes("cancel")) status = "cancelled";
  else if (normalized.includes("abgelaufen")) status = "expired";
  else if (normalized.includes("keine buchung") || normalized.includes("no booking")) status = "tbd";
  else if (/^ab\b/.test(normalized)) status = "scheduled";

  return {
    status,
    label: rawLabel,
  };
}

function parseSemesterRelativeDate(dateStr: string, semester: string): string | null {
  const normalizedDate = String(dateStr).trim().replace(/,$/, "");
  const fullGermanMatch = String(dateStr).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (fullGermanMatch) {
    const [, day, month, year] = fullGermanMatch;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const shortGermanMatch = normalizedDate.match(/(\d{1,2})\.(\d{1,2})\.?/);
  if (!shortGermanMatch) return null;

  const day = parseInt(shortGermanMatch[1], 10);
  const month = parseInt(shortGermanMatch[2], 10);
  const semStr = String(semester || "").toLowerCase();

  const winterMatch = semStr.match(/(\d{2})\/(\d{2})/);
  if (winterMatch) {
    const startYear = 2000 + parseInt(winterMatch[1], 10);
    const endYear = 2000 + parseInt(winterMatch[2], 10);
    const year = month >= 8 ? startYear : endYear;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const explicitYearMatch = semStr.match(/\b(20\d{2})\b/);
  if (explicitYearMatch) {
    return `${explicitYearMatch[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const summerMatch = semStr.match(/\b(\d{2})\b/);
  if (summerMatch) {
    let yearNum = parseInt(summerMatch[1] || summerMatch[2] || "0", 10);
    if (yearNum < 100) yearNum += 2000;
    return `${yearNum}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

function parseBookingAvailability(
  label: string,
  semester: string,
  referenceDate?: string,
): {
  bookingOpensOn?: string;
  bookingOpensAt?: string;
} {
  const match = label.match(/^ab\s+(\d{1,2}\.\d{1,2}\.?(?:\d{4})?)(?:,?\s*(\d{1,2}[:.]\d{2}))?/i);
  if (!match) return {};

  let bookingOpensOn: string | null = null;
  const shortGermanMatch = match[1].match(/(\d{1,2})\.(\d{1,2})\.?/);
  if (referenceDate && shortGermanMatch) {
    const [, dayRaw, monthRaw] = shortGermanMatch;
    const reference = new Date(`${referenceDate}T12:00:00Z`);
    if (!Number.isNaN(reference.getTime())) {
      let year = reference.getUTCFullYear();
      const month = Number(monthRaw);
      if (month > reference.getUTCMonth() + 1 && reference.getUTCMonth() + 1 <= 6) {
        year -= 1;
      }
      bookingOpensOn = `${year}-${String(month).padStart(2, "0")}-${String(dayRaw).padStart(2, "0")}`;
    }
  }
  if (!bookingOpensOn) {
    bookingOpensOn = parseSemesterRelativeDate(match[1], semester);
  }
  const normalizedTime = match[2] ? match[2].replace(".", ":") : null;

  return {
    ...(bookingOpensOn ? { bookingOpensOn } : {}),
    ...(bookingOpensOn && normalizedTime ? { bookingOpensAt: `${bookingOpensOn}T${normalizedTime}:00` } : {}),
  };
}

export interface WorkoutCourse {
  source: string;
  courseCode: string;
  category: string;
  title: string;
  description?: {
    general?: string;
    price?: string;
  } | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location: string[];
  instructor: string;
  startDate: string;
  endDate: string;
  price: {
    student: number | null;
    staff: number | null;
    external: number | null;
    externalReduced: number | null;
  };
  bookingStatus: string;
  bookingUrl: string;
  url: string;
  semester: string;
  duration?: string;
  
  // Flattened details
  schedule?: Array<{
    day: string;
    time: string;
    location: string;
  }>;
  isEntgeltfrei?: boolean;
  bookingLabel?: string;
  bookingOpensOn?: string;
  bookingOpensAt?: string;
  plannedDates?: string[];
  segments?: Array<{ start: string; end: string; day: string }>;
  durationUrl?: string | null;
}

export type CauPageCache = {
  etag?: string;
  lastModified?: string;
  cacheControl?: string;
  checkedAt?: string;
};

export type CauIndexCache = CauPageCache & {
  url?: string;
  categoryUrls?: string[];
  semester?: string;
};

export type CauCacheState = {
  index?: CauIndexCache;
  pages?: Record<string, CauPageCache>;
};

type CauIndexProbeResult = {
  changed: boolean;
  url: string;
  html: string;
  semester: string;
  links: string[];
  cache: CauIndexCache;
};

type CachedPageEntry = {
  html: string;
  etag?: string;
  lastModified?: string;
  expiresAt: number;
  cacheControl?: string;
};

function getMaxAgeMs(cacheControl: string | null): number {
  const match = cacheControl?.match(/max-age=(\d+)/i);
  return match ? Number(match[1]) * 1000 : 0;
}

export class CAUSport extends BaseScraper {
  private static pageCache = new Map<string, CachedPageEntry>();
  private prefetchedIndexHtml: string | null = null;

  static clearPageCacheForTests() {
    CAUSport.pageCache.clear();
  }

  constructor() {
    super("cau-sport");
  }

  getSemesterParam(): string {
    if (!this.semester) return "aktueller_zeitraum";

    const input = this.semester.toLowerCase();
    const yearMatch = input.match(/\d{2}/);
    const currentYearShort = new Date().getFullYear() % 100;
    const yearNum = yearMatch ? parseInt(yearMatch[0]) : currentYearShort;

    const isWinter = input.includes("wi") || input.includes("winter") || input.includes("fa") || input.includes("fall");
    const isSummer = input.includes("su") || input.includes("summer");
    const isSpring = input.includes("sp") || input.includes("spring");

    if (input === buildCurrentWorkoutSemester()) return "aktueller_zeitraum";

    // Named archive paths
    if (isWinter) return `wintersemester_${yearNum}_${yearNum + 1}`;
    if (isSummer) return `sommersemester_${yearNum}`;
    if (isSpring) return `sommersemester_${yearNum}`;

    return "aktueller_zeitraum";
  }

  private buildHeaders(cache?: CauPageCache): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
    if (cache?.etag) headers["If-None-Match"] = cache.etag;
    if (cache?.lastModified) headers["If-Modified-Since"] = cache.lastModified;
    return headers;
  }

  async fetchPage(url: string, retries = 3): Promise<string> {
    const cached = CAUSport.pageCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[${this.name}] Cache hit for ${url}`);
      return cached.html;
    }

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
    if (cached?.etag) headers["If-None-Match"] = cached.etag;
    if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[${this.name}] Fetching ${url} (attempt ${attempt})...`);
        const response = await fetch(url, { headers });

        if (response.status === 404) {
          console.log(`[${this.name}] Page not found (404): ${url}`);
          return "";
        }

        if (response.status === 304 && cached) {
          const maxAgeMs = getMaxAgeMs(response.headers.get("cache-control"));
          CAUSport.pageCache.set(url, {
            ...cached,
            expiresAt: Date.now() + maxAgeMs,
            cacheControl: response.headers.get("cache-control") || cached.cacheControl,
            etag: response.headers.get("etag") || cached.etag,
            lastModified: response.headers.get("last-modified") || cached.lastModified,
          });
          console.log(`[${this.name}] Not modified ${url}; reusing cached HTML`);
          return cached.html;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        const html = new TextDecoder("iso-8859-1").decode(buffer);
        const maxAgeMs = getMaxAgeMs(response.headers.get("cache-control"));
        CAUSport.pageCache.set(url, {
          html,
          etag: response.headers.get("etag") || undefined,
          lastModified: response.headers.get("last-modified") || undefined,
          expiresAt: Date.now() + maxAgeMs,
          cacheControl: response.headers.get("cache-control") || undefined,
        });
        return html;
      } catch {
        if (attempt === retries) {
          console.error(`[${this.name}] Failed to fetch ${url} after ${retries} attempts.`);
        } else {
          const delay = Math.pow(2, attempt - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return "";
  }

  async links(): Promise<string[]> {
    const sem = this.getSemesterParam();
    const url = this.getIndexUrl();
    const html = this.prefetchedIndexHtml ?? await this.fetchPage(url);
    this.prefetchedIndexHtml = null;

    if (!html) {
      console.log(`[${this.name}] Semester ${sem} not found or not yet published. Skipping.`);
      return [];
    }

    return this.extractLinksFromHtml(html, url);
  }

  private getIndexUrl(): string {
    return `https://server.sportzentrum.uni-kiel.de/angebote/${this.getSemesterParam()}/index.html`;
  }

  private extractLinksFromHtml(html: string, url: string): string[] {
    const $ = cheerio.load(html);
    const categoryLinks: string[] = [];
    const currentSemPath = url.substring(0, url.lastIndexOf("/"));

    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto") || href.includes("?")) return;

      if (href.endsWith(".html") && href !== "index.html" && !href.startsWith("bs_")) {
        const fullUrl = href.startsWith("/")
          ? `https://server.sportzentrum.uni-kiel.de${href}`
          : `${currentSemPath}/${href}`;
        categoryLinks.push(fullUrl);
      }
    });

    return [...new Set(categoryLinks)];
  }

  parser(): Course[] {
    return [];
  }

  parseSemester(html: string): string {
    const $ = cheerio.load(html);
    const headerText = $("#bs_top").first().text().replace(/\s+/g, " ").trim();
    const headerMatch = headerText.match(/(Sommersemester|Wintersemester)\s+(\d{4})(?:\/(\d{2,4}))?/i);

    if (headerMatch) {
      const season = headerMatch[1].toLowerCase().includes("winter") ? "Winter" : "Summer";
      const year = headerMatch[2];
      const trailing = headerMatch[3];

      if (season === "Winter") {
        const normalizedTrailing = trailing
          ? (trailing.length === 2 ? `20${trailing}` : trailing)
          : String(Number(year) + 1);
        return `Winter ${year}/${normalizedTrailing}`;
      }

      return `Summer ${year}`;
    }

    const classMatch =
      html.match(/bs_((?:winter|sommer)semester_\d{2,4}_\d{2,4})/i) ||
      html.match(/bs_((?:winter|sommer)semester_\d{2,4})/i);

    if (classMatch) {
      const raw = classMatch[1].toLowerCase();
      if (raw.includes("winter")) {
        const parts = raw.match(/wintersemester_(\d{2,4})_(\d{2,4})/);
        if (!parts) return "Winter";
        const startYear = parts[1].length === 2 ? `20${parts[1]}` : parts[1];
        const endYear = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        return `Winter ${startYear}/${endYear}`;
      } else {
        const parts = raw.match(/sommersemester_(\d{2,4})/);
        if (!parts) return "Summer";
        const year = parts[1].length === 2 ? `20${parts[1]}` : parts[1];
        return `Summer ${year}`;
      }
    }

    return "Current Period";
  }

  async probeIndexPage(cache?: CauIndexCache): Promise<CauIndexProbeResult> {
    const url = this.getIndexUrl();
    const headers = this.buildHeaders(cache);

    const response = await fetch(url, { headers });

    if (response.status === 304) {
      return {
        changed: false,
        url,
        html: "",
        semester: cache?.semester || "",
        links: cache?.categoryUrls || [],
        cache: {
          ...cache,
          etag: response.headers.get("etag") || cache?.etag,
          lastModified: response.headers.get("last-modified") || cache?.lastModified,
          cacheControl: response.headers.get("cache-control") || undefined,
          checkedAt: response.headers.get("date") || new Date().toUTCString(),
        },
      };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const html = new TextDecoder("iso-8859-1").decode(buffer);
    this.prefetchedIndexHtml = html;

    return {
      changed: true,
      url,
      html,
      semester: this.parseSemester(html),
      links: this.extractLinksFromHtml(html, url),
      cache: {
        etag: response.headers.get("etag") || undefined,
        lastModified: response.headers.get("last-modified") || undefined,
        cacheControl: response.headers.get("cache-control") || undefined,
        checkedAt: response.headers.get("date") || new Date().toUTCString(),
      },
    };
  }

  async fetchConditionalPage(url: string, cache?: CauPageCache): Promise<{
    notModified: boolean;
    html: string;
    cache: CauPageCache;
  }> {
    const inMemory = CAUSport.pageCache.get(url);
    if (inMemory && inMemory.expiresAt > Date.now()) {
      return {
        notModified: false,
        html: inMemory.html,
        cache: {
          etag: inMemory.etag,
          lastModified: inMemory.lastModified,
          cacheControl: inMemory.cacheControl,
          checkedAt: new Date().toUTCString(),
        },
      };
    }

    const response = await fetch(url, { headers: this.buildHeaders(cache) });
    if (response.status === 304) {
      return {
        notModified: true,
        html: "",
        cache: {
          etag: response.headers.get("etag") || cache?.etag,
          lastModified: response.headers.get("last-modified") || cache?.lastModified,
          cacheControl: response.headers.get("cache-control") || cache?.cacheControl,
          checkedAt: response.headers.get("date") || new Date().toUTCString(),
        },
      };
    }
    if (response.status === 404) {
      return {
        notModified: false,
        html: "",
        cache: {
          checkedAt: response.headers.get("date") || new Date().toUTCString(),
        },
      };
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const html = new TextDecoder("iso-8859-1").decode(buffer);
    const cacheControl = response.headers.get("cache-control") || undefined;
    CAUSport.pageCache.set(url, {
      html,
      etag: response.headers.get("etag") || undefined,
      lastModified: response.headers.get("last-modified") || undefined,
      expiresAt: Date.now() + getMaxAgeMs(cacheControl || null),
      cacheControl,
    });

    return {
      notModified: false,
      html,
      cache: {
        etag: response.headers.get("etag") || undefined,
        lastModified: response.headers.get("last-modified") || undefined,
        cacheControl,
        checkedAt: response.headers.get("date") || new Date().toUTCString(),
      },
    };
  }

  /**
   * Merges a list of individual dates into continuous weekly segments.
   * E.g. [Apr 6, Apr 13, Apr 27] (all Mondays) →
   * [ {start: Apr 6, end: Apr 13, day: 'Mon'}, {start: Apr 27, end: Apr 27, day: 'Mon'} ]
   */
  private mergeDatesIntoSegments(dates: string[]): Array<{ start: string; end: string; day: string }> {
    if (!dates.length) return [];

    const toIso = (d: Date) => d.toISOString().split("T")[0];
    const getDayName = (d: Date) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];

    const sorted = dates
      .map(d => {
        const parts = d.split(".");
        if (parts.length !== 3) return null;
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00Z`);
      })
      .filter((d): d is Date => d !== null && !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (!sorted.length) return [];

    const segments: Array<{ start: string; end: string; day: string }> = [];
    let currentSegment: { start: Date; last: Date; day: string } | null = null;

    for (const d of sorted) {
      const dayName = getDayName(d);

      if (!currentSegment) {
        currentSegment = { start: d, last: d, day: dayName };
        continue;
      }

      const diffDays = Math.round((d.getTime() - currentSegment.last.getTime()) / 86_400_000);

      if (diffDays === 7 && dayName === currentSegment.day) {
        currentSegment.last = d;
      } else {
        segments.push({ start: toIso(currentSegment.start), end: toIso(currentSegment.last), day: currentSegment.day });
        currentSegment = { start: d, last: d, day: dayName };
      }
    }

    if (currentSegment) {
      segments.push({ start: toIso(currentSegment.start), end: toIso(currentSegment.last), day: currentSegment.day });
    }

    return segments;
  }

  async parseDurationPageMetadata(url: string): Promise<{ dates: string[]; locations: string[] }> {
    if (!url) return { dates: [], locations: [] };
    const html = await this.fetchPage(url);
    if (!html) return { dates: [], locations: [] };

    const $ = cheerio.load(html);
    const datesSet = new Set<string>();
    const locationsSet = new Set<string>();
    const bodyText = $("body").text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

    // Strategy 1: dedicated "geplante Termine" rows used on CGI detail pages
    // e.g. <div class="bs_geplan_termine_row"><span class="bs_geplan_termine_datum">20.10.2025</span>...</div>
    $(".bs_geplan_termine_datum").each((_, el) => {
      const text = $(el).text().trim();
      const m = text.match(/(\d{2}\.\d{2}\.\d{4})/);
      if (m) datesSet.add(m[1]);
    });

    // Strategy 2: table rows that contain both a date AND a time range
    // e.g. "Mo 20.10.2025 21.00-21.45 ..."
    if (datesSet.size === 0) {
      $("tr").each((_, tr) => {
        const rowText = $(tr).text().trim();
        const dateMatch = rowText.match(/(\d{2}\.\d{2}\.\d{4})/);
        const timeMatch = rowText.match(/\d{1,2}[.:]\d{2}\s*-\s*\d{1,2}[.:]\d{2}/);
        if (dateMatch && timeMatch) datesSet.add(dateMatch[1]);
      });
    }

    $("tr").each((_, tr) => {
      const row = $(tr);
      const dayText = row.find(".bs_stag").text().trim();
      const timeText = row.find(".bs_szeit").text().trim();
      const locationText = row.find(".bs_sort").text().replace(/\s+/g, " ").trim();
      if (!dayText || !timeText || !locationText) return;
      locationsSet.add(locationText);
    });

    // Strategy 3: scan "geplante termine" tables for single-date rows
    if (datesSet.size === 0) {
      $("table").each((_, table) => {
        const prevText = $(table).prev().text().toLowerCase();
        const tableText = $(table).text().toLowerCase();
        if (!prevText.includes("geplante termine") && !prevText.includes("planned dates") && !tableText.includes("geplante termine")) return;

        $(table).find("tr").each((_, tr) => {
          const rowText = $(tr).text().trim();
          const matches = rowText.match(/(\d{2}\.\d{2}\.\d{4})/g);
          if (matches?.length === 1) datesSet.add(matches[0]);
        });
      });
    }

    // Strategy 4: explicit "Zeitraum" / "duration" range text on detail pages
    if (datesSet.size === 0) {
      const rangeMatch = bodyText.match(
        /(?:zeitraum|duration)\s*:?\s*(\d{2}\.\d{2}\.\d{4})\s*[-–]\s*(\d{2}\.\d{2}\.\d{4})/i,
      );
      if (rangeMatch) {
        datesSet.add(rangeMatch[1]);
        datesSet.add(rangeMatch[2]);
      }
    }

    // Last resort: all dates in body (may include non-session dates — avoid if possible)
    if (datesSet.size === 0) {
      const allDates = $("body").text().match(/\b\d{2}\.\d{2}\.\d{4}\b/g) || [];
      allDates.forEach(d => datesSet.add(d));
    }

    let sawExplicitLocationLabel = false;

    $("b, strong, dt, .bs_label").each((_, el) => {
      const labelText = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
      if (!labelText.startsWith("veranstaltungsort")) return;
      sawExplicitLocationLabel = true;

      $(el)
        .nextUntil("b, strong, dt, .bs_label")
        .filter(".bs_text")
        .each((_, node) => {
          const sectionText = $(node).text().replace(/\s+/g, " ").trim();
          if (sectionText) locationsSet.add(sectionText);
        });
    });

    if (locationsSet.size === 0 && !sawExplicitLocationLabel) {
      const locationMatch = bodyText.match(
        /(?:veranstaltungsorte|veranstaltungsort|locations?|venue)\s*:?\s*(.+?)(?=(?:\b(?:zeitraum|anmeldeschluss|anmeldung|leitung|dozent|kosten|preis|uhrzeit|termine)\b\s*:)|$)/i,
      );
      if (locationMatch?.[1]) {
        locationsSet.add(locationMatch[1].trim());
      }
    }

    return { dates: Array.from(datesSet), locations: Array.from(locationsSet) };
  }

  async parsePlannedDates(url: string): Promise<string[]> {
    return (await this.parseDurationPageMetadata(url)).dates;
  }

  async parseWorkouts(html: string, pageUrl: string): Promise<WorkoutCourse[]> {
    const $ = cheerio.load(html);
    const results: WorkoutCourse[] = [];
    const semester = this.parseSemester(html);

    const pLimit = (await import("p-limit")).default;
    const detailLimit = pLimit(3);
    const rowPromises: Promise<void>[] = [];

    $("table tbody tr").each((_, tr) => {
      const row = $(tr);

      const courseCode = row.find("td.bs_sknr span").text().trim();
      if (!courseCode || !/^\d{4}-\d{2}$/.test(courseCode)) return;

      const outerSpan = row.find("td.bs_sdet > span").first();
      const categoryPrefix = outerSpan.find(".dispmobile").text().trim();
      const cloned = outerSpan.clone();
      cloned.find(".dispmobile").remove();
      const specificName = cloned.text().trim();
      const fullTitle = specificName || categoryPrefix;

      let category = categoryPrefix;

      // Group all "Semestergebühr" variants under one category
      if (fullTitle.toLowerCase().includes("semestergebühr") || fullTitle.toLowerCase().includes("semester fee")) {
        category = "Semestergebühr";
      }
      const scheduleEntries: Array<{ day: string; time: string; location: string }> = [];
      const tzoTable = row.find("table.bs_tzotable");

      if (tzoTable.length > 0) {
        tzoTable.find("tr").each((_, tzotr) => {
          const tzoRow = $(tzotr);
          const day = tzoRow.find(".bs_stag").text().trim();
          const time = tzoRow.find(".bs_szeit").text().trim();
          const location = tzoRow.find(".bs_sort").text().replace(/\s+/g, " ").trim();
          if (day || time || location) {
            scheduleEntries.push({
              day,
              time,
              location,
            });
          }
        });
      } else {
        const parseCellLines = (cell: ReturnType<typeof row.find>) => {
          const html = cell.html();
          if (html && html.trim()) {
            return html
              .split(/<br\s*\/?>/i)
              .map((part) => cheerio.load(part).text().replace(/\s+/g, " ").trim())
              .filter(Boolean);
          }

          const text = cell.text().replace(/\s+/g, " ").trim();
          return text ? [text] : [];
        };

        const days = parseCellLines(row.find("td.bs_stag"));
        const times = parseCellLines(row.find("td.bs_szeit"));
        const locations = parseCellLines(row.find("td.bs_sort"));

        days.forEach((day, i) => {
          scheduleEntries.push({
            day,
            time: times[i] || times[0] || "",
            location: locations[i] || locations[0] || "",
          });
        });
      }

      // Apply fallbacks for missing times/locations in multi-row schedules
      if (scheduleEntries.length > 1) {
        const firstTime = scheduleEntries[0].time;
        const firstLocation = scheduleEntries[0].location;
        for (let i = 1; i < scheduleEntries.length; i++) {
          if (!scheduleEntries[i].time) scheduleEntries[i].time = firstTime;
          if (!scheduleEntries[i].location) scheduleEntries[i].location = firstLocation;
        }
      }

      const dateCell = row.find("td.bs_szr");
      const dateCellText = dateCell.text().replace(/\s+/g, " ").trim();
      const dateMatch = dateCellText.replace(/\s+/g, "").match(/([\d.]+)-\s*([\d.]+)/);
      const startDate = dateMatch?.[1] || "";
      const endDate = dateMatch?.[2] || "";
      const durationUrlRaw = dateCell.find("a").attr("href");
      const durationUrl = durationUrlRaw
        ? (durationUrlRaw.startsWith("http") ? durationUrlRaw : `https://server.sportzentrum.uni-kiel.de${durationUrlRaw}`)
        : null;

      const instructor = row.find("td.bs_skl").text().replace(/\s+/g, " ").trim();

      // Parse prices
      const priceValues: (number | null)[] = [];
      let isEntgeltfrei = false;

      const priceDivs = row.find("td.bs_spreis .bs_tt1");
      if (priceDivs.length > 0) {
        priceDivs.each((_, div) => {
          const rawText = $(div).text().toLowerCase();
          if (rawText.includes("entgeltfrei")) {
            isEntgeltfrei = true;
            priceValues.push(0);
          } else {
            const num = parseFloat(rawText.replace(/\s/g, "").replace("€", "").replace(",", ".").replace("--", ""));
            priceValues.push(isNaN(num) ? null : num);
          }
        });
      } else {
        const summaryText = row.find("td.bs_spreis > span").first().text().toLowerCase();
        if (summaryText.includes("entgeltfrei")) {
          isEntgeltfrei = true;
          priceValues.push(0, 0, 0, 0);
        } else {
          summaryText.split("/").forEach(p => {
            const n = parseFloat(p.replace(/[^\d.,]/g, "").replace(",", "."));
            priceValues.push(isNaN(n) ? null : n);
          });
        }
      }

      const bookingTd = row.find("td.bs_sbuch");
      const { status: bookingStatus, label: bookingLabel } = parseBookingStatus(bookingTd);

      const bookingUrl = bookingTd.find("a[href]").attr("href") || "";

      rowPromises.push(detailLimit(async () => {
        const durationPageMetadata = durationUrl
          ? await this.parseDurationPageMetadata(durationUrl)
          : { dates: [], locations: [] };
        const plannedDates = durationPageMetadata.dates;
        const segments = this.mergeDatesIntoSegments(plannedDates);
        const finalStartDate = segments.length > 0 ? segments[0].start : startDate;
        const finalEndDate   = segments.length > 0 ? segments[segments.length - 1].end : endDate;
        const bookingAvailability = bookingLabel
          ? parseBookingAvailability(bookingLabel, semester, finalStartDate || undefined)
          : {};

        const resolvedLocation = durationPageMetadata.locations.length > 0
          ? durationPageMetadata.locations
          : [...new Set(scheduleEntries.map(s => s.location).filter(Boolean))];

        results.push({
          source: "CAU Kiel Sportzentrum",
          courseCode,
          category,
          title: fullTitle,
          dayOfWeek: scheduleEntries.map(s => s.day).join(", "),
          startTime: scheduleEntries[0]?.time.split("-")[0] || "",
          endTime:   scheduleEntries[0]?.time.split("-")[1] || "",
          location: resolvedLocation,
          instructor,
          startDate: finalStartDate,
          endDate:   finalEndDate,
          price: {
            student: priceValues[0] ?? null,
            staff: priceValues[1] ?? null,
            external: priceValues[2] ?? null,
            externalReduced: priceValues[3] ?? null,
          },
          bookingStatus,
          bookingUrl: bookingUrl ? `https://server.sportzentrum.uni-kiel.de${bookingUrl}` : "",
          url: pageUrl,
          semester,
          schedule: scheduleEntries,
          isEntgeltfrei: isEntgeltfrei || false,
          bookingLabel,
          ...bookingAvailability,
          plannedDates,
          segments,
          durationUrl,
        });
      }));
    });

    await Promise.all(rowPromises);
    return results;
  }

  async retrieveWorkouts(categoryName?: string): Promise<WorkoutCourse[]> {
    return (await this.retrieveWorkoutBatch({ categoryName })).batches.flatMap((batch) => batch.workouts);
  }

  async retrieveWorkoutBatch({
    categoryName,
    cacheState,
  }: {
    categoryName?: string;
    cacheState?: CauCacheState;
  }): Promise<{
    batches: Array<{ pageUrl: string; workouts: WorkoutCourse[] }>;
    skipped: boolean;
    meta?: Record<string, unknown>;
  }> {
    let targetLinks = cacheState?.index?.categoryUrls || [];
    const nextPages: Record<string, CauPageCache> = { ...(cacheState?.pages || {}) };
    let nextIndex: CauIndexCache | undefined = cacheState?.index
      ? { ...cacheState.index }
      : undefined;
    const batches: Array<{ pageUrl: string; workouts: WorkoutCourse[] }> = [];

    if (!categoryName) {
      const probe = await this.probeIndexPage(cacheState?.index);
      nextIndex = {
        ...probe.cache,
        url: probe.url,
        semester: probe.semester || cacheState?.index?.semester,
        categoryUrls: probe.links,
      };
      targetLinks = probe.links;

      const removedLinks = (cacheState?.index?.categoryUrls || []).filter(
        (url) => !targetLinks.includes(url),
      );
      removedLinks.forEach((pageUrl) => {
        delete nextPages[pageUrl];
        batches.push({ pageUrl, workouts: [] });
      });
    }

    if (categoryName) {
      if (targetLinks.length === 0) {
        targetLinks = await this.links();
      }
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const target = normalize(categoryName);

      targetLinks = targetLinks.filter(link => {
        const fileName = link.split("/").pop() || "";
        const germanName = fileName.replace(/^_/, "").replace(/\.html$/, "").replace(/_/g, " ");
        return normalize(germanName) === target || normalize(translateDE(germanName)) === target;
      });

      if (targetLinks.length === 0) {
        console.log(`[${this.name}] No specific link found for category "${categoryName}".`);
        return {
          batches: [],
          skipped: true,
          meta: nextIndex || nextPages
            ? { cau_cache: { index: nextIndex, pages: nextPages } }
            : undefined,
        };
      }
      console.log(`[${this.name}] Refreshing specific category: ${categoryName} (found ${targetLinks.length} link(s))`);
    }

    console.log(`[${this.name}] Processing ${targetLinks.length} category pages for semester ${this.semester}...`);

    const pLimit = (await import("p-limit")).default;
    const limit = pLimit(5);
    await Promise.all(
      targetLinks.map(link =>
        limit(async () => {
          const result = await this.fetchConditionalPage(link, nextPages[link]);
          nextPages[link] = result.cache;
          if (result.notModified) return;

          const html = result.html;
          if (html) {
            const workouts = await this.parseWorkouts(html, link);
            batches.push({ pageUrl: link, workouts });
          }
        })
      )
    );

    const totalWorkouts = batches.reduce((sum, batch) => sum + batch.workouts.length, 0);
    console.log(`[${this.name}] Found ${totalWorkouts} total workout instances across ${batches.length} changed page(s)`);
    return {
      batches,
      skipped: batches.length === 0,
      meta: {
        cau_cache: {
          ...(nextIndex ? { index: nextIndex } : {}),
          pages: nextPages,
        },
      },
    };
  }

  async retrieve(): Promise<Course[]> {
    return (await this.retrieveWorkouts()) as unknown as Course[];
  }
}
