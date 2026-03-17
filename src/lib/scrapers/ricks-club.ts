import * as cheerio from "cheerio";
import { BaseScraper } from "./BaseScraper";
import type { WorkoutCourse } from "./cau-sport";
import type { Course } from "./types";

const RICKS_CLUB_URL = "https://www.ricksclub.de/";
const PROVIDER = "Ricks Club";

type RicksClubWorkout = WorkoutCourse & {
  provider: string;
};

type ScheduleEntry = NonNullable<WorkoutCourse["schedule"]>[number];
type ActivityName = "Billard" | "Steeldart" | "Bowling";
type PriceDetailsByActivity = Record<ActivityName, string | undefined>;

const WEEKDAYS = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function extractNodeText($: cheerio.CheerioAPI, node: cheerio.Element | cheerio.Cheerio<any>): string {
  const instance = "cheerio" in node ? node : $(node);
  const clone = instance.clone();
  clone.find("br").replaceWith(" ");
  return normalizeText(clone.text());
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .replace(/-{2,}/g, "-");
}

function parseFirstEuro(text: string): number | null {
  const match = normalizeText(text).match(/(\d+[.,]\d{2})\s*€/);
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function isOpeningHoursToken(value: string): boolean {
  return /^(Closed|Geschlossen)$/i.test(value) || /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(value);
}

function stripLeadingMarker(value: string): string {
  return value.replace(/^[*]\s*/, "").replace(/[;:]$/, "").trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isWeekday(value: string): value is (typeof WEEKDAYS)[number] {
  return WEEKDAYS.includes(value as (typeof WEEKDAYS)[number]);
}

function parseLeftPositions(html: string): Map<string, number> {
  const positions = new Map<string, number>();
  const pattern = /\[id="([^"]+)"\][^{]*\{[^}]*left:([^;]+);/g;

  for (const match of html.matchAll(pattern)) {
    const id = match[1];
    const value = Number.parseFloat((match[2] || "").replace("px", "").trim());
    if (id && Number.isFinite(value) && !positions.has(id)) {
      positions.set(id, value);
    }
  }

  return positions;
}

export class RicksClub extends BaseScraper {
  constructor() {
    super("ricks-club");
  }

  links(): string[] {
    return [RICKS_CLUB_URL];
  }

  async parser(_html: string): Promise<Course[]> {
    void _html;
    return [];
  }

  parseWorkouts(html: string, pageUrl: string): RicksClubWorkout[] {
    const $ = cheerio.load(html);
    const location = this.extractLocation($);
    const leftPositions = parseLeftPositions(html);
    const richTexts = $("[data-testid='richTextElement']")
      .toArray()
      .map((element) => extractNodeText($, element))
      .filter(Boolean);
    const schedulesByActivity = this.extractSchedules($, richTexts, leftPositions, location);
    const priceDetails = this.extractPriceDetails($, richTexts, leftPositions);

    const bowlingDescription = richTexts.find((text) =>
      /Bowling spielen ist im Ricks Club/i.test(text),
    );
    const billardDescription = richTexts.find((text) =>
      /12 Billardtischen/i.test(text),
    );
    const steeldartDescription = richTexts.find((text) =>
      /Darts-Spieler/i.test(text) && /Steeldartscheiben/i.test(text),
    );
    return [
      this.buildWorkout(
        "Bowling",
        bowlingDescription,
        priceDetails.Bowling,
        schedulesByActivity.Bowling,
        location,
        pageUrl,
      ),
      this.buildWorkout(
        "Billard",
        billardDescription,
        priceDetails.Billard,
        schedulesByActivity.Billard,
        location,
        pageUrl,
      ),
      this.buildWorkout(
        "Steeldart",
        steeldartDescription,
        priceDetails.Steeldart,
        schedulesByActivity.Steeldart,
        location,
        pageUrl,
      ),
    ].filter((entry): entry is RicksClubWorkout => Boolean(entry));
  }

  async retrieveWorkouts(categoryName?: string): Promise<RicksClubWorkout[]> {
    const normalized = normalizeText(categoryName || "").toLowerCase();
    if (
      normalized &&
      !["ricks club", "bowling", "billard", "steeldart", "darts", "dart"].includes(normalized)
    ) {
      return [];
    }

    const html = await this.fetchPage(RICKS_CLUB_URL);
    return html ? this.parseWorkouts(html, RICKS_CLUB_URL) : [];
  }

  private extractLocation($: cheerio.CheerioAPI): string {
    const titleText = normalizeText($("title").text());
    const titleMatch = titleText.match(/Holtenauer Straße 279,\s*Kiel,\s*Germany/i);
    if (titleMatch) return titleMatch[0];

    const metaDescription = normalizeText($("meta[name='description']").attr("content") || "");
    if (/Ricks Club/.test(metaDescription)) {
      return "Holtenauer Straße 279, Kiel, Germany";
    }

    return "";
  }

  private extractSchedules(
    $: cheerio.CheerioAPI,
    richTexts: string[],
    leftPositions: Map<string, number>,
    location: string,
  ): Record<ActivityName, ScheduleEntry[]> {
    const weekdays = this.extractWeekdays(richTexts);
    const empty = {
      Billard: [] as ScheduleEntry[],
      Steeldart: [] as ScheduleEntry[],
      Bowling: [] as ScheduleEntry[],
    };

    if (weekdays.length !== WEEKDAYS.length) {
      return empty;
    }

    const openingHours = this.extractOpeningHours(richTexts);
    if (openingHours.length === WEEKDAYS.length) {
      return {
        Billard: this.buildScheduleFromOpeningHours(openingHours, weekdays, location),
        Steeldart: this.buildScheduleFromOpeningHours(openingHours, weekdays, location),
        Bowling: this.buildScheduleFromOpeningHours(openingHours, weekdays, location),
      };
    }

    return {
      Billard: this.buildScheduleForActivity(
        this.extractActivityTokens($, richTexts, leftPositions, "Billard"),
        weekdays,
        location,
      ),
      Steeldart: this.buildScheduleForActivity(
        this.extractActivityTokens($, richTexts, leftPositions, "Steeldart"),
        weekdays,
        location,
      ),
      Bowling: this.buildScheduleForActivity(
        this.extractActivityTokens($, richTexts, leftPositions, "Bowling"),
        weekdays,
        location,
      ),
    };
  }

  private extractPriceDetails(
    $: cheerio.CheerioAPI,
    richTexts: string[],
    leftPositions: Map<string, number>,
  ): PriceDetailsByActivity {
    const billardTokens = this.extractActivityTokens($, richTexts, leftPositions, "Billard");
    const steeldartTokens = this.extractActivityTokens($, richTexts, leftPositions, "Steeldart");
    const bowlingTokens = this.extractActivityTokens($, richTexts, leftPositions, "Bowling");
    const bowlingNotes = this.extractBowlingNotes(richTexts);

    return {
      Billard: this.summarizePricedActivity(billardTokens),
      Steeldart: this.summarizeSteeldartPrice(steeldartTokens),
      Bowling: this.joinPriceLines(this.summarizePricedActivity(bowlingTokens), bowlingNotes),
    };
  }

  private extractWeekdays(richTexts: string[]): (typeof WEEKDAYS)[number][] {
    const firstWeekdayIndex = richTexts.findIndex((text) => isWeekday(text));
    if (firstWeekdayIndex < 0) return [];

    const days = richTexts.slice(firstWeekdayIndex, firstWeekdayIndex + WEEKDAYS.length);
    return days.length === WEEKDAYS.length && days.every((day) => isWeekday(day))
      ? (days as (typeof WEEKDAYS)[number][])
      : [];
  }

  private extractOpeningHours(richTexts: string[]): string[] {
    for (let index = 0; index <= richTexts.length - WEEKDAYS.length; index += 1) {
      const slice = richTexts.slice(index, index + WEEKDAYS.length);
      if (slice.length === WEEKDAYS.length && slice.every((entry) => isOpeningHoursToken(entry))) {
        return slice.map((entry) => (/^Geschlossen$/i.test(entry) ? "Closed" : entry));
      }
    }

    return [];
  }

  private extractActivityTokens(
    $: cheerio.CheerioAPI,
    richTexts: string[],
    leftPositions: Map<string, number>,
    activity: ActivityName,
  ): string[] {
    const candidates = $("div, section")
      .toArray()
      .map((element) => {
        const node = $(element);
        const texts = this.collectRichTexts($, node, leftPositions);
        return { texts, size: texts.length };
      })
      .filter(({ texts }) =>
        texts[0] === activity &&
        texts.length > 1 &&
        texts.some((text) =>
          /^Geschlossen$/i.test(text) ||
          /je 30 Min\./i.test(text) ||
          /Getränke frei/i.test(text),
        ),
      )
      .sort((left, right) => left.size - right.size);

    if (candidates[0]) {
      return candidates[0].texts.slice(1);
    }

    const rowTokens = this.extractActivityTokensFromSharedGrid($, leftPositions, activity);
    if (rowTokens.length > 0) {
      return rowTokens;
    }

    return this.extractActivityTokensFromFlatTexts(richTexts, activity);
  }

  private collectRichTexts(
    $: cheerio.CheerioAPI,
    node: cheerio.Cheerio<any>,
    leftPositions: Map<string, number>,
  ): string[] {
    const gridContainer = node.children("[data-testid='inline-content']").children("[data-testid='mesh-container-content']").first();
    const directChildren = gridContainer.children("[id]").toArray();

    const texts = directChildren.length > 0
      ? directChildren
          .map((child, index) => {
            const childNode = $(child);
            const childId = childNode.attr("id") || "";
            const childTexts = childNode.attr("data-testid") === "richTextElement"
              ? [extractNodeText($, childNode)].filter(Boolean)
              : childNode
                  .find("[data-testid='richTextElement']")
                  .toArray()
                  .map((element) => extractNodeText($, element))
                  .filter(Boolean);
            return {
              index,
              left: leftPositions.get(childId) ?? index,
              texts: childTexts,
            };
          })
          .sort((left, right) => left.left - right.left || left.index - right.index)
          .flatMap((entry) => entry.texts)
      : node
          .find("[data-testid='richTextElement']")
          .toArray()
          .map((element) => extractNodeText($, element))
          .filter(Boolean);

    const ownText = node.attr("data-testid") === "richTextElement" ? extractNodeText($, node) : "";
    if (ownText && texts[0] !== ownText) {
      texts.unshift(ownText);
    }

    return texts;
  }

  private extractActivityTokensFromFlatTexts(richTexts: string[], activity: ActivityName): string[] {
    const startIndex = richTexts.findIndex((text) => text === activity);
    if (startIndex < 0) return [];

    const remaining = richTexts.slice(startIndex + 1);
    const nextActivityIndex = remaining.findIndex((text) =>
      ["Billard", "Steeldart", "Bowling"].includes(text),
    );

    return nextActivityIndex < 0 ? remaining : remaining.slice(0, nextActivityIndex);
  }

  private extractActivityTokensFromSharedGrid(
    $: cheerio.CheerioAPI,
    leftPositions: Map<string, number>,
    activity: ActivityName,
  ): string[] {
    for (const grid of $("[data-testid='mesh-container-content']").toArray()) {
      const children = $(grid).children("[id]").toArray().map((child, index) => {
        const childNode = $(child);
        const id = childNode.attr("id") || "";
        const texts = this.collectRichTexts($, childNode, leftPositions);
        return {
          child,
          id,
          index,
          left: leftPositions.get(id) ?? 0,
          texts,
        };
      }).filter((entry) => entry.texts.length > 0);

      const startIndex = children.findIndex((entry) => entry.texts[0] === activity);
      if (startIndex < 0) continue;

      const startLeft = children[startIndex]?.left ?? 0;
      const rowEntries = children.slice(startIndex + 1).filter((entry) => entry.left > startLeft);
      if (rowEntries.length === 0) continue;

      return rowEntries
        .sort((left, right) => left.left - right.left || left.index - right.index)
        .flatMap((entry) => entry.texts);
    }

    return [];
  }

  private extractBowlingNotes(richTexts: string[]): string[] {
    return unique(
      richTexts.flatMap((text) => {
        const matches = text.match(
          /Leihschuhe:[^;]+;?|Die Mindestbuchungsdauer beträgt[^;]+;?|[*]Feiertags gesonderte Preise wie Wochenende/g,
        );

        return (matches || []).map((entry) => stripLeadingMarker(entry));
      }),
    );
  }

  private summarizePricedActivity(tokens: string[]): string | undefined {
    const pairs: Array<{ label: string; price: string; value: number }> = [];

    for (let index = 0; index < tokens.length - 1; index += 1) {
      const label = tokens[index] || "";
      const price = tokens[index + 1] || "";
      const value = parseFirstEuro(price);

      if (!/je\s+\d+\s*Min\./i.test(label) || value === null) continue;

      pairs.push({ label, price, value });
    }

    if (pairs.length === 0) return undefined;

    const uniquePrices = unique(pairs.map((pair) => pair.price));
    const sortedValues = [...pairs].sort((left, right) => left.value - right.value);
    const minPrice = sortedValues[0]?.price;
    const maxPrice = sortedValues[sortedValues.length - 1]?.price;
    const label = pairs[0]?.label.replace(/^je\s+/i, "") || "";

    if (!minPrice || !maxPrice || !label) return undefined;
    if (uniquePrices.length === 1) return `${minPrice} pro ${label}`;

    return `${minPrice} - ${maxPrice} pro ${label}`;
  }

  private summarizeSteeldartPrice(tokens: string[]): string | undefined {
    if (tokens.some((token) => /Getränke frei/i.test(token))) {
      return "gegen Getränke frei";
    }

    return undefined;
  }

  private joinPriceLines(...lines: Array<string | undefined | string[]>): string | undefined {
    const normalized = lines.flatMap((line) => Array.isArray(line) ? line : line ? [line] : []);
    const joined = normalized.filter(Boolean).join("\n");
    return joined || undefined;
  }

  private buildScheduleFromOpeningHours(
    openingHours: string[],
    weekdays: (typeof WEEKDAYS)[number][],
    location: string,
  ): ScheduleEntry[] {
    return weekdays.map((day, index) => ({
      day,
      time: openingHours[index] || "",
      location,
    }));
  }

  private buildScheduleForActivity(
    tokens: string[],
    weekdays: (typeof WEEKDAYS)[number][],
    location: string,
  ): ScheduleEntry[] {
    const entries: ScheduleEntry[] = [];
    let index = 0;

    for (const day of weekdays) {
      const current = tokens[index];
      if (!current) break;

      if (/^Geschlossen$/i.test(current)) {
        entries.push({ day, time: "Geschlossen", location });
        index += 1;
        continue;
      }

      if (/Getränke frei/i.test(current)) {
        entries.push({ day, time: current.replace(/\s+/g, " "), location });
        index += 1;
        continue;
      }

      const next = tokens[index + 1] || "";
      if (next && (/^gegen$/i.test(current) || /\d+[.,]\d{2}\s*€/i.test(next))) {
        const time = /^gegen$/i.test(current) ? `${current} ${next}` : `${current}: ${next}`;
        entries.push({ day, time, location });
        index += 2;
      }
    }

    return entries;
  }

  private buildWorkout(
    title: string,
    description: string | undefined,
    priceText: string | undefined,
    schedule: ScheduleEntry[],
    location: string,
    pageUrl: string,
  ): RicksClubWorkout | null {
    if (!description) return null;

    const adults = parseFirstEuro(priceText || schedule.map((entry) => entry.time).join("\n"));

    return {
      source: PROVIDER,
      provider: PROVIDER,
      courseCode: `ricks-club-${slugify(title)}`,
      category: title,
      title,
      description: {
        general: description,
        ...(priceText ? { price: priceText } : {}),
      },
      dayOfWeek: "",
      startTime: "",
      endTime: "",
      location: location ? [location] : [],
      instructor: "",
      startDate: "",
      endDate: "",
      price: adults === null
        ? {
            student: null,
            staff: null,
            external: null,
            externalReduced: null,
          }
        : {
            student: null,
            staff: null,
            external: null,
            externalReduced: null,
            adults,
          },
      bookingStatus: "",
      bookingUrl: "",
      url: pageUrl,
      semester: "",
      schedule,
    };
  }
}
