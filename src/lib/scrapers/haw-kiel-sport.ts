import * as cheerio from "cheerio";
import { BaseScraper } from "./BaseScraper";
import type { WorkoutCourse } from "./workout-types";
import { normalizeTextWithPunctuation, joinNotesWithPunctuation, joinNotesWithDoubleNewline } from "./utils/text";

const HAW_KIEL_LIST_URL = "https://haw-kiel.venuzle.com/search/events?v=table";
const PROVIDER = "HAW Kiel Hochschulsport";

type ListingRow = {
  eventId: string;
  title: string;
  timeframe: string;
  priceText: string;
  ageRange: string;
  placesRaw: string;
  statusLabel: string;
  detailUrl: string;
};

type DetailData = {
  category?: string;
  description?: { general?: string; price?: string } | null;
  instructor?: string;
  location: string[];
  schedule: NonNullable<WorkoutCourse["schedule"]>;
  sessionCount?: number;
  details: Record<string, unknown>;
};

type LivewireListingState = {
  snapshot: string;
  csrf: string;
  updateUri: string;
  cookieHeader: string;
};

function normalizeText(value: string, addPunctuation = false): string {
  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (addPunctuation) {
    return normalizeTextWithPunctuation(normalized);
  }
  return normalized;
}

function slugify(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .replace(/-{2,}/g, "-");
}

function parseGermanDateToIso(input: string): string {
  const match = normalizeText(input).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function parseDateRange(input: string): { startDate: string; endDate: string } {
  const matches = [...normalizeText(input).matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)];
  if (matches.length === 0) return { startDate: "", endDate: "" };

  const first = matches[0];
  const last = matches[matches.length - 1];

  return {
    startDate: `${first[3]}-${first[2]}-${first[1]}`,
    endDate: `${last[3]}-${last[2]}-${last[1]}`,
  };
}

function parsePriceValue(input: string): number | null {
  const match = normalizeText(input).match(/-?\d+(?:[.,]\d+)?/);
  const normalized = match?.[0]?.replace(",", ".") || "";
  if (!normalized) return null;
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

function parsePrice(priceText: string) {
  if (/kostenlos/i.test(priceText)) {
    return {
      student: 0,
      staff: null,
      external: 0,
      externalReduced: null,
    };
  }

  const normalized = normalizeText(priceText);
  const studentMatch = normalized.match(/(?:student(?:en)?|studierende?)[^\d]*(-?\d+(?:[.,]\d+)?)/i);
  const externalMatch = normalized.match(/(?:external|extern(?:e|al)?|gaeste|gaste|gäste)[^\d]*(-?\d+(?:[.,]\d+)?)/i);

  if (studentMatch || externalMatch) {
    return {
      student: parsePriceValue(studentMatch?.[1] || ""),
      staff: null,
      external: parsePriceValue(externalMatch?.[1] || ""),
      externalReduced: null,
    };
  }

  const values = normalized
    .split(/\s+(?:oder|\/)\s+/i)
    .map((part) => parsePriceValue(part))
    .filter((value): value is number => value !== null);

  return {
    student: values[0] ?? null,
    staff: null,
    external: values[1] ?? values[0] ?? null,
    externalReduced: null,
  };
}

function parsePlaces(placesRaw: string) {
  const match = normalizeText(placesRaw).match(/(\d+)\s*\/\s*(\d+|∞)/);
  if (!match) {
    return { booked: null, capacity: null, raw: normalizeText(placesRaw) };
  }

  return {
    booked: Number.parseInt(match[1], 10),
    capacity: match[2] === "∞" ? null : Number.parseInt(match[2], 10),
    raw: `${match[1]} / ${match[2]}`,
  };
}

function mapBookingStatus(label: string): string {
  const normalized = normalizeText(label).toLowerCase();
  if (!normalized) return "unknown";
  if (normalized.includes("buchbar") || normalized.includes("bookable")) return "available";
  if (normalized.includes("warteliste")) return "waitlist";
  if (normalized.includes("ausgebucht")) return "fully_booked";
  if (normalized.includes("gesperrt")) return "blocked";
  if (normalized.includes("storniert")) return "cancelled";
  if (normalized.includes("abgelaufen")) return "expired";
  return "unknown";
}

function extractTextLines(node: cheerio.Cheerio<any>): string[] {
  return node
    .text()
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function extractNormalizedTextWithLineBreaks(node: cheerio.Cheerio<any>): string {
  const root = node.clone();
  root.find("br").replaceWith("\n");

  return root
    .text()
    .split("\n")
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .join("\n\n");
}

function normalizeLocationParts(parts: string[]): string {
  const cleanedParts = parts
    .map((part) => normalizeText(part).replace(/^,\s*/, ""))
    .filter(Boolean);

  return normalizeText(cleanedParts.join(", "))
    .replace(/^, /, "");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export class HAWKielSport extends BaseScraper {
  constructor() {
    super("haw-kiel-sport");
  }

  async retrieveWorkouts(categoryName?: string): Promise<WorkoutCourse[]> {
    const listingPages = await this.fetchListingPages();
    if (listingPages.length === 0) return [];

    const workouts = (await Promise.all(
      listingPages.map((html) => this.parseWorkouts(html, HAW_KIEL_LIST_URL)),
    )).flat();
    const normalizedCategory = normalizeText(categoryName || "").toLowerCase();

    if (!normalizedCategory) return workouts;

    return workouts.filter((workout) => {
      const haystack = [
        workout.category,
        workout.title,
        workout.details && typeof workout.details === "object" ? String((workout.details as Record<string, unknown>).rawCategory || "") : "",
      ]
        .map((value) => normalizeText(String(value || "")).toLowerCase())
        .join(" ");

      return haystack.includes(normalizedCategory);
    });
  }

  async fetchListingPages(): Promise<string[]> {
    const response = await fetch(HAW_KIEL_LIST_URL, {
      headers: this.defaultHeaders(),
    });
    if (!response.ok) return [];

    const firstPageHtml = await response.text();
    const state = this.parseLivewireListingState(firstPageHtml, response);
    const totalPages = this.parseTotalPages(firstPageHtml);
    const pages = [firstPageHtml];

    if (!state || totalPages <= 1) return pages;

    let currentState = state;
    for (let page = 2; page <= totalPages; page += 1) {
      const nextPage = await this.fetchLivewireListingPage(currentState, page);
      if (!nextPage) break;
      pages.push(nextPage.html);
      currentState = {
        ...currentState,
        snapshot: nextPage.snapshot,
      };
    }

    return pages;
  }

  async parseWorkouts(html: string, _pageUrl: string): Promise<WorkoutCourse[]> {
    const rows = this.parseListingRows(html);
    const workouts = await Promise.all(rows.map(async (row) => {
      const detailHtml = await this.fetchPage(row.detailUrl);
      const detail = detailHtml ? this.parseDetailPage(detailHtml) : {
        location: [],
        schedule: [],
        details: {},
      } satisfies DetailData;
      const { startDate, endDate } = parseDateRange(row.timeframe);
      const price = parsePrice(row.priceText);
      const schedule = detail.schedule;
      const primaryLocation = detail.location.length > 0
        ? detail.location
        : unique(schedule.map((entry) => entry.location));
      const normalizedSchedule = schedule.map((entry) => ({
        ...entry,
        location: entry.location || primaryLocation[0] || "",
      }));

      return {
        source: PROVIDER,
        provider: PROVIDER,
        courseCode: `haw-kiel-${row.eventId}`,
        category: detail.category || row.title,
        title: row.title,
        description: {
          ...(detail.description || {}),
          ...(row.priceText && !detail.description?.price ? { price: row.priceText } : {}),
        },
        dayOfWeek: normalizedSchedule.map((entry) => entry.day).join(", "),
        startTime: normalizedSchedule[0]?.time.split("-")[0] || "",
        endTime: normalizedSchedule[0]?.time.split("-")[1] || "",
        location: primaryLocation,
        instructor: detail.instructor || "",
        startDate,
        endDate,
        sessionCount: detail.sessionCount,
        price,
        bookingStatus: mapBookingStatus(row.statusLabel),
        bookingUrl: row.detailUrl,
        url: row.detailUrl,
        semester: "",
        schedule: normalizedSchedule,
        details: {
          ageRange: row.ageRange,
          places: parsePlaces(row.placesRaw),
          listingStatusLabel: row.statusLabel,
          rawPrice: row.priceText,
          rawTimeframe: row.timeframe,
          ...(detail.details || {}),
        },
      } satisfies WorkoutCourse & { provider: string };
    }));

    return workouts;
  }

  parseListingRows(html: string): ListingRow[] {
    const $ = cheerio.load(html);
    const rows: ListingRow[] = [];

    $("tbody tr").each((_, element) => {
      const cells = $(element).find("td");
      if (cells.length < 7) return;

      const detailPath = $(cells[1]).find("a[href]").attr("href") || "";
      const eventIdMatch = detailPath.match(/\/events\/(\d+)/);
      if (!eventIdMatch) return;

      const eventId = eventIdMatch[1];
      const title = normalizeText($(cells[1]).text());
      if (!title) return;

      rows.push({
        eventId,
        title,
        timeframe: normalizeText($(cells[2]).text()),
        priceText: normalizeText($(cells[3]).text()),
        ageRange: normalizeText($(cells[4]).text()),
        placesRaw: normalizeText($(cells[5]).text()).replace(/[()]/g, ""),
        statusLabel: normalizeText($(cells[6]).text()),
        detailUrl: `https://haw-kiel.venuzle.com/events/${eventId}`,
      });
    });

    return rows;
  }

  parseTotalPages(html: string): number {
    const matches = [...html.matchAll(/gotoPage\((\d+),\s*'page'\)/g)].map((match) => Number.parseInt(match[1], 10));
    if (matches.length > 0) return Math.max(...matches);

    const summaryMatch = html.match(/<span class="font-bold">(\d+)<\/span>\s*<span>bis<\/span>\s*<span class="font-bold">(\d+)<\/span>\s*<span>von<\/span>\s*<span class="font-bold">(\d+)<\/span>/);
    if (!summaryMatch) return 1;

    const pageEnd = Number.parseInt(summaryMatch[2], 10);
    const total = Number.parseInt(summaryMatch[3], 10);
    if (!pageEnd || !total) return 1;
    return Math.max(1, Math.ceil(total / pageEnd));
  }

  parseDetailPage(html: string): DetailData {
    const $ = cheerio.load(html);
    const sectionByLabels = (...labels: string[]) =>
      this.findDetailSectionByLabels($, labels);

    const descriptionSection = sectionByLabels("Beschreibung", "Description");
    const descriptionText = descriptionSection.length > 0
      ? this.extractSectionText($, descriptionSection, true, "Beschreibung", "Description")
      : "";

    const priceSection = sectionByLabels("Preise", "Prices");
    const priceText = priceSection.length > 0
      ? this.extractSectionText($, priceSection, true, "Preise", "Prices")
      : "";

    const instructorSection = sectionByLabels("Instructor", "Leitung");
    const instructor = instructorSection.length > 0
      ? this.extractSectionText($, instructorSection, false, "Instructor", "Leitung")
      : "";

    const categorySection = sectionByLabels("Kategorien", "Categories");
    const category = categorySection.length > 0
      ? normalizeText(categorySection.find("li").map((_, item) => $(item).text()).get().join(", ") || categorySection.text())
      : "";

    const appointmentsSection = sectionByLabels("Termine", "Appointments");
    const { schedule, sessionCount } = this.parseAppointmentsTable(appointmentsSection);
    const locationSection = sectionByLabels("Ort", "Location");
    const explicitLocations = locationSection.length > 0
      ? [this.extractSectionText($, locationSection, false, "Ort", "Location")]
      : [];
    const locations = unique([
      ...explicitLocations,
      ...schedule.map((entry) => entry.location),
      ...this.extractLocationsFromDescription(descriptionText),
    ]);

    const detailLines = unique(extractTextLines(descriptionSection.find(".bg-base-100")));

    return {
      ...(category ? { category } : {}),
      description: descriptionText || priceText
        ? {
            ...(descriptionText ? { general: descriptionText } : {}),
            ...(priceText ? { price: priceText } : {}),
          }
        : null,
      instructor: /nicht bekannt/i.test(instructor) ? "" : instructor,
      location: locations,
      schedule,
      sessionCount,
      details: {
        rawCategory: category,
        descriptionLines: detailLines,
      },
    };
  }

  private parseAppointmentsTable(section: cheerio.Cheerio<any>): {
    schedule: NonNullable<WorkoutCourse["schedule"]>;
    sessionCount: number;
  } {
    if (section.length === 0) return { schedule: [], sessionCount: 0 };

    const sectionText = normalizeText(section.text());
    const summaryMatch = sectionText.match(
      /(?:\b\d+\b)\s+(?:to|bis)\s+(?:\d+)\s+(?:of|von)\s+(\d+)\s+(?:results|ergebnisse)/i,
    );
    const summaryCount = summaryMatch ? Number.parseInt(summaryMatch[1], 10) : 0;

    const groupedSchedule = new Map<string, {
      days: string[];
      time: string;
      location: string;
    }>();
    let rowCount = 0;
    const table$ = cheerio.load(section.html() || "");

    table$("tbody tr").each((_, row) => {
      const cells = table$(row).find("td");
      const values = cells.toArray().map((cell) => normalizeText(table$(cell).text()));
      if (values.length < 4) return;

      let dateLabel = "";
      let startTime = "";
      let endTime = "";
      let venue = "";
      let address = "";

      if (values.length >= 6) {
        dateLabel = values[1];
        startTime = values[2];
        endTime = values[3];
        venue = values[4];
        address = values[5];
      } else {
        dateLabel = values[0];
        startTime = values[1];
        endTime = values[2];

        const locationLines = extractNormalizedTextWithLineBreaks(table$(cells[3]))
          .split("\n")
          .map((value) => normalizeText(value))
          .filter(Boolean);
        venue = locationLines[0] || "";
        address = locationLines.slice(1).join(", ");
      }

      const day = normalizeText(dateLabel.split(",")[0] || "");
      const location = normalizeLocationParts([venue, address]) || venue;
      const time = startTime && endTime ? `${startTime}-${endTime}` : normalizeText([startTime, endTime].filter(Boolean).join("-"));

      if (!day && !time && !location) return;
      rowCount += 1;

      const normalizedLocation = normalizeText(location);
      const groupKey = [startTime, endTime, venue, address]
        .map((value) => normalizeText(value))
        .join("|");
      const existing = groupedSchedule.get(groupKey);
      if (existing) {
        if (day && !existing.days.includes(day)) existing.days.push(day);
        return;
      }

      groupedSchedule.set(groupKey, {
        days: day ? [day] : [],
        time,
        location: normalizedLocation,
      });
    });

    const schedule = Array.from(groupedSchedule.values()).map((entry) => ({
      day: entry.days.join(", "),
      time: entry.time,
      location: entry.location,
    }));
    let sessionCount = summaryCount || rowCount;

    if (schedule.length > 0) return { schedule, sessionCount };

    const text = sectionText.replace(/^(?:Termine|Appointments)\s+/i, "");
    const textMatch = text.match(/^([^,]+),\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (textMatch) {
      schedule.push({
        day: normalizeText(textMatch[1]),
        time: `${textMatch[2]}-${textMatch[3]}`,
        location: "",
      });
      sessionCount = Math.max(sessionCount, summaryCount || rowCount || 1);
    }

    return { schedule, sessionCount };
  }

  private extractLocationsFromDescription(description: string): string[] {
    const lines = description
      .split(/(?=Ort:)/i)
      .map((line) => normalizeText(line))
      .filter(Boolean);

    return lines.flatMap((line) => {
      const locationMatch = line.match(/Ort:\s*([^.\n]+)/i);
      if (!locationMatch) return [];
      return [normalizeText(locationMatch[1])];
    });
  }

  private findDetailSection($: cheerio.CheerioAPI, label: string): cheerio.Cheerio<any> {
    const directSection = $(`section[aria-label="${label}"]`).first();
    if (directSection.length > 0) return directSection;

    const heading = $("h1, h2, h3, h4, p, span").filter((_, element) => normalizeText($(element).text()) === label).first();
    if (heading.length === 0) return cheerio.load("")("section");

    const parent = heading.parent();
    if (parent.length > 0) return parent;

    return heading;
  }

  private findDetailSectionByLabels(
    $: cheerio.CheerioAPI,
    labels: string[],
  ): cheerio.Cheerio<any> {
    for (const label of labels) {
      const directSection = $(`section[aria-label="${label}"]`).first();
      if (directSection.length > 0) return directSection;
    }

    for (const label of labels) {
      const section = this.findDetailSection($, label);
      if (section.length > 0) return section;
    }

    return cheerio.load("")("section");
  }

  private extractSectionText(
    $: cheerio.CheerioAPI,
    section: cheerio.Cheerio<any>,
    addPunctuation: boolean,
    ...labels: string[]
  ): string {
    const container = section.find(".bg-base-100").first();
    const root = container.length > 0 ? container.clone() : section.clone();
    root.find("h1, h2, h3, h4").remove();
    root.find("p, span").filter((_, element) => labels.includes(normalizeText($(element).text()))).remove();
    let text = extractNormalizedTextWithLineBreaks(root).trim();
    for (const label of labels) {
      text = text.replace(new RegExp(`^${label}\\s*`, "i"), "").trim();
    }
    if (addPunctuation) {
      return joinNotesWithDoubleNewline(text.split(/\n+/));
    }
    return normalizeText(text, false);
  }

  private defaultHeaders(): Record<string, string> {
    return {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };
  }

  private parseLivewireListingState(html: string, response: Response): LivewireListingState | null {
    const componentLine = html.split("\n").find((line) => line.includes('wire:name="search.events.search-events"'));
    const configMatch = html.match(/window\.livewireScriptConfig = \{"csrf":"([^"]+)","uri":"([^"]+)"/);
    if (!componentLine || !configMatch) return null;

    const snapshot = componentLine.match(/wire:snapshot="([^"]+)"/)?.[1];
    if (!snapshot) return null;

    return {
      snapshot: snapshot.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&"),
      csrf: configMatch[1],
      updateUri: configMatch[2].replaceAll("\\/", "/"),
      cookieHeader: this.extractCookieHeader(response),
    };
  }

  private extractCookieHeader(response: Response): string {
    const headerEntries = "getSetCookie" in response.headers && typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") || ""];

    return headerEntries
      .flatMap((entry) => entry.split(/,(?=[^;]+=[^;]+)/g))
      .map((entry) => entry.split(";")[0]?.trim() || "")
      .filter(Boolean)
      .join("; ");
  }

  private async fetchLivewireListingPage(
    state: LivewireListingState,
    page: number,
  ): Promise<{ html: string; snapshot: string } | null> {
    const response = await fetch(state.updateUri, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Livewire": "true",
        "X-CSRF-TOKEN": state.csrf,
        ...(state.cookieHeader ? { Cookie: state.cookieHeader } : {}),
      },
      body: JSON.stringify({
        _token: state.csrf,
        components: [
          {
            snapshot: state.snapshot,
            updates: {},
            calls: [{ path: "", method: "gotoPage", params: [page, "page"] }],
          },
        ],
      }),
    });
    if (!response.ok) return null;

    const payload = await response.json() as {
      components?: Array<{
        snapshot?: string;
        effects?: { html?: string };
      }>;
    };
    const component = payload.components?.[0];
    if (!component?.effects?.html || !component.snapshot) return null;

    return {
      html: component.effects.html,
      snapshot: component.snapshot,
    };
  }
}
