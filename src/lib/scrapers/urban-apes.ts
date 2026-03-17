import * as cheerio from "cheerio";
import { BaseScraper } from "./BaseScraper";
import type { Course } from "./types";
import type { WorkoutCourse } from "./cau-sport";

type OpeningHourEntry = {
  label: string;
  days: string;
  startTime: string;
  endTime: string;
  raw: string;
};

type PricingEntry = {
  label: string;
  note?: string;
  adult?: number;
  discounted?: number;
  children?: number;
  flat?: number;
};

const QUICK_OVERVIEW_URL = "https://www.urbanapes.de/kiel/quick-overview/";

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLabel(text: string): string {
  return normalizeText(text)
    .replace(/\s*:\s*$/, "")
    .replace(/\s*&\s*/g, " & ");
}

function parseEuro(text: string): number | undefined {
  const normalized = normalizeText(text).replace(/[^\d.,-]/g, "").replace(",", ".");
  if (!normalized) return undefined;
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function to24Hour(time: string, meridiem: string): string {
  const match = normalizeText(time).match(/(\d{1,2}):(\d{2})/);
  if (!match) return "";

  let hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const normalizedMeridiem = meridiem.toLowerCase();

  if (normalizedMeridiem.includes("p") && hour !== 12) hour += 12;
  if (normalizedMeridiem.includes("a") && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function parseTimeRange(raw: string): { startTime: string; endTime: string } {
  const match = normalizeText(raw).match(
    /(\d{1,2}:\d{2})\s*(a\.m\.|p\.m\.)\s*-\s*(\d{1,2}:\d{2})\s*(a\.m\.|p\.m\.)/i,
  );

  if (!match) return { startTime: "", endTime: "" };

  return {
    startTime: to24Hour(match[1], match[2]),
    endTime: to24Hour(match[3], match[4]),
  };
}

function mapDays(label: string): string {
  const normalized = normalizeLabel(label).toLowerCase();
  if (normalized === "monday - friday") return "Mon-Fri";
  if (normalized === "saturday & sunday") return "Sat-Sun";
  return normalized;
}

export class UrbanApes extends BaseScraper {
  constructor() {
    super("urban-apes");
  }

  links(): string[] {
    return [QUICK_OVERVIEW_URL];
  }

  async parser(_html: string): Promise<Course[]> {
    void _html;
    return [];
  }

  parseWorkouts(html: string, pageUrl: string): WorkoutCourse[] {
    const $ = cheerio.load(html);
    const openingHours = this.parseOpeningHours($);
    const pricing = this.parsePricing($);
    const pricingNotes = this.parsePricingNotes($);
    const location = this.parseLocation($);

    const dayTicket = pricing.find((entry) => entry.label === "Day Ticket");
    const sharedDetails = {
      provider: "urban apes",
      openingHours,
      pricing,
      pricingNotes,
    };

    return openingHours.map((entry, index) => ({
      source: "Urban Apes",
      courseCode: index === 0 ? "urban-apes-kiel-mon-fri" : "urban-apes-kiel-sat-sun",
      category: "Climbing",
      title: "Bouldering",
      titleEn: "urban apes Kiel",
      dayOfWeek: entry.days,
      startTime: entry.startTime,
      endTime: entry.endTime,
      location: [location],
      locationEn: location,
      instructor: "",
      startDate: "",
      endDate: "",
      priceStudent: dayTicket?.discounted ?? null,
      priceStaff: null,
      priceExternal: dayTicket?.adult ?? null,
      priceExternalReduced: dayTicket?.children ?? null,
      bookingStatus: "see_text",
      bookingUrl: pageUrl,
      url: pageUrl,
      semester: "",
      details: sharedDetails,
    }));
  }

  async retrieveWorkouts(categoryName?: string): Promise<WorkoutCourse[]> {
    const normalized = normalizeText(categoryName || "").toLowerCase();
    if (
      normalized &&
      !["bouldering", "urban apes", "urban apes kiel"].includes(normalized)
    ) {
      return [];
    }

    const html = await this.fetchPage(QUICK_OVERVIEW_URL);
    return html ? this.parseWorkouts(html, QUICK_OVERVIEW_URL) : [];
  }

  private parseOpeningHours($: cheerio.CheerioAPI): OpeningHourEntry[] {
    const panel = $(".fusion-panel").filter((_, element) =>
      normalizeText($(element).find(".fusion-toggle-heading").first().text()) === "Opening hours",
    ).first();

    if (panel.length === 0) return [];

    return panel.find(".panel-body p").toArray().map((paragraph) => {
      const node = $(paragraph);
      const label = normalizeLabel(node.find("strong").first().text());
      const raw = normalizeText(node.text().replace(node.find("strong").first().text(), ""));
      const { startTime, endTime } = parseTimeRange(raw);

      return {
        label,
        days: mapDays(label),
        startTime,
        endTime,
        raw,
      };
    }).filter((entry) => entry.label && entry.startTime && entry.endTime);
  }

  private parsePricing($: cheerio.CheerioAPI): PricingEntry[] {
    const panel = $(".fusion-panel").filter((_, element) =>
      normalizeText($(element).find(".fusion-toggle-heading").first().text()) === "Prices",
    ).first();

    if (panel.length === 0) return [];

    return panel.find("tbody tr").toArray().map((row) => {
      const cells = $(row).find("td").toArray();
      if (cells.length < 2) return null;

      const firstCell = $(cells[0]).clone();
      const label = normalizeText(firstCell.find("strong").first().text());
      firstCell.find("strong").remove();
      const note = normalizeText(firstCell.text());

      const valueCells = cells.slice(1).map((cell) => parseEuro($(cell).text()));
      const entry: PricingEntry = { label };
      if (note) entry.note = note;

      const firstValueCell = $(cells[1]);
      if ((firstValueCell.attr("colspan") || "") === "3") {
        entry.flat = valueCells[0];
      } else {
        entry.adult = valueCells[0];
        if (cells[2]) entry.discounted = valueCells[1];
        if (cells[3]) entry.children = valueCells[2];
        if ((firstValueCell.attr("colspan") || "") === "2") {
          entry.flat = valueCells[0];
        }
      }

      return entry;
    }).filter((entry): entry is PricingEntry => Boolean(entry?.label));
  }

  private parsePricingNotes($: cheerio.CheerioAPI): string[] {
    const panel = $(".fusion-panel").filter((_, element) =>
      normalizeText($(element).find(".fusion-toggle-heading").first().text()) === "Prices",
    ).first();

    if (panel.length === 0) return [];

    return panel.find(".panel-body > p").toArray().map((paragraph) =>
      normalizeText($(paragraph).text()),
    ).filter(Boolean);
  }

  private parseLocation($: cheerio.CheerioAPI): string {
    const match = normalizeText($.text()).match(/Grasweg 40.*24118 Kiel/i);
    return match ? "Grasweg 40, 24118 Kiel" : "";
  }
}
