import { BaseScraper } from "./BaseScraper";
import { Course } from "./types";
import { parseSemesterCode } from "./utils/semester";

export class UCB extends BaseScraper {
  private static readonly CATALOG_BASE = "https://graduate.catalog.berkeley.edu/courses";
  private static readonly CATALOG_DEPARTMENTS = ["COMPSCI", "EECS", "ELENG"];
  private static readonly COURSE_DOG_API_BASE = "https://app.coursedog.com/api/v1";

  constructor() {
    super("ucb");
  }

  getSemesterParam(): string {
    if (!this.semester) return "8576"; // Default to Spring 2026

    const input = this.semester.toLowerCase();
    
    // UC Berkeley specific term IDs for 2026
    if (input.includes('sp26')) return "8576"; // Spring 2026
    if (input.includes('su26')) return "8580"; // Summer 2026
    if (input.includes('fa25')) return "8240"; // Fall 2025 (Approximation based on increments)
    
    // Fallback to calculation if not in map
    const { term, year } = parseSemesterCode(this.semester);
    const yearCode = year.toString().substring(2);
    let termSuffix = "2";
    if (term === "Spring") termSuffix = "2";
    else if (term === "Summer") termSuffix = "5";
    else if (term === "Fall") termSuffix = "8";
    else if (term === "Winter") termSuffix = "1";

    return `2${yearCode}${termSuffix}`;
  }

  // Satisfy abstract member, though retrieve is overridden for sequential fetching
  links(): string[] {
    return [];
  }

  // Override retrieve to implement early exit if a term is not published
  async retrieve(): Promise<Course[]> {
    const csvCourses = await this.retrieveFromCatalogCsv();
    const deduped = this.dedupeCoursesByTitleAndPattern(csvCourses);
    console.log(`[${this.name}] Retrieved ${deduped.length} unique courses via catalog CSV export.`);
    return deduped;
  }

  private async retrieveFromCatalogCsv(): Promise<Course[]> {
    const all: Course[] = [];
    for (const dept of UCB.CATALOG_DEPARTMENTS) {
      const pageUrl = `${UCB.CATALOG_BASE}?cq=&sortBy=code&departments=${encodeURIComponent(dept)}&page=1`;
      const html = await this.fetchPage(pageUrl);
      if (!html) continue;

      let csvText = "";

      // 1) Legacy case: direct CSV URL discoverable in markup.
      const csvUrl = this.extractCsvUrl(html, pageUrl);
      if (csvUrl) {
        csvText = await this.fetchCsv(csvUrl);
      } else {
        // 2) Current Coursedog case: "Export all results as CSV" is a JS button
        // that POSTs filters to a CSV export API endpoint.
        csvText = await this.fetchCatalogButtonCsv(html, dept);
      }

      if (!csvText) {
        console.log(`[${this.name}] CSV export unavailable for department ${dept}.`);
        continue;
      }

      const courses = this.parseCatalogCsv(csvText);
      all.push(...courses);
    }

    return all;
  }

  private extractCsvUrl(html: string, pageUrl: string): string | null {
    // 1) Direct anchor/button href containing csv.
    const directHref = html.match(/data-test="export-all-results-as-csv"[^>]*href="([^"]+)"/i);
    if (directHref?.[1]) {
      return new URL(directHref[1], pageUrl).toString();
    }

    // 2) Any explicit CSV URL in markup/scripts (absolute or relative).
    const csvLike = html.match(/https?:\\u002F\\u002F[^"'\\s<>]*csv[^"'\\s<>]*/i)
      || html.match(/https?:\/\/[^"'\s<>]*csv[^"'\s<>]*/i)
      || html.match(/\/[^"'\s<>]*csv[^"'\s<>]*/i);
    if (csvLike?.[0]) {
      const normalized = csvLike[0].replaceAll("\\u002F", "/");
      return normalized.startsWith("http")
        ? normalized
        : new URL(normalized, pageUrl).toString();
    }

    // 3) Some catalog pages expose the API route in JSON blobs as ".../export...csv...".
    const exportLike = html.match(/https?:\\u002F\\u002F[^"'\\s<>]*export[^"'\\s<>]*csv[^"'\\s<>]*/i)
      || html.match(/https?:\/\/[^"'\s<>]*export[^"'\s<>]*csv[^"'\s<>]*/i)
      || html.match(/\/[^"'\s<>]*export[^"'\s<>]*csv[^"'\s<>]*/i);
    if (exportLike?.[0]) {
      const normalized = exportLike[0].replaceAll("\\u002F", "/");
      return normalized.startsWith("http")
        ? normalized
        : new URL(normalized, pageUrl).toString();
    }

    return null;
  }

  private async fetchCsv(url: string): Promise<string> {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/csv,application/csv,text/plain;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        console.log(`[${this.name}] CSV fetch failed ${response.status} for ${url}`);
        return "";
      }
      return await response.text();
    } catch (error) {
      console.error(`[${this.name}] CSV fetch error for ${url}:`, error);
      return "";
    }
  }

  private extractCatalogRuntimeConfig(html: string): { school: string; activeCatalog: string } | null {
    const schoolMatch = html.match(/school:"([^"]+)"/);
    const catalogMatch = html.match(/activeCatalog:"([^"]+)"/);
    if (!schoolMatch?.[1] || !catalogMatch?.[1]) return null;
    return { school: schoolMatch[1], activeCatalog: catalogMatch[1] };
  }

  private async fetchCatalogButtonCsv(html: string, department: string): Promise<string> {
    const runtime = this.extractCatalogRuntimeConfig(html);
    if (!runtime) {
      console.log(`[${this.name}] Could not extract Coursedog runtime config for CSV button export.`);
      return "";
    }

    const endpoint = `${UCB.COURSE_DOG_API_BASE}/ca/${encodeURIComponent(runtime.school)}/catalogs/${encodeURIComponent(runtime.activeCatalog)}/courses/csv/$filters?orderBy=code&ignoreEffectiveDating=false`;
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Content-Type": "application/json",
      Origin: "https://graduate.catalog.berkeley.edu",
      Referer: "https://graduate.catalog.berkeley.edu/",
      "X-Requested-With": "catalog",
    };

    // Match the browser's filter payload used by the "Export all results as CSV" button.
    const payload = {
      condition: "AND",
      filters: [
        {
          id: "sNyIzT2q",
          condition: "and",
          filters: [
            {
              id: "status-course",
              condition: "field",
              name: "status",
              inputType: "select",
              group: "course",
              type: "is",
              value: "Active",
            },
            {
              id: "departments-course",
              condition: "field",
              name: "departments",
              inputType: "select",
              group: "course",
              type: "doesNotContain",
              value: ["GGAGECH"],
            },
            {
              id: "departments-course",
              condition: "field",
              name: "departments",
              inputType: "select",
              group: "course",
              type: "doesNotContain",
              value: ["NONUCB"],
            },
            {
              id: "catalogPrint-course",
              condition: "field",
              name: "catalogPrint",
              inputType: "boolean",
              group: "course",
              type: "is",
              value: true,
              customField: false,
            },
            {
              id: "courseApproved-course",
              condition: "field",
              name: "courseApproved",
              inputType: "select",
              group: "course",
              type: "is",
              value: "Approved",
              customField: false,
            },
          ],
        },
        {
          condition: "AND",
          filters: [
            {
              group: "course",
              id: "departments-course",
              inputType: "select",
              name: "departments",
              type: "is",
              value: department,
            },
          ],
        },
      ],
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.log(`[${this.name}] CSV button export failed ${response.status} for ${department}`);
        return "";
      }

      const text = await response.text();
      if (text.includes(",") && /code|course/i.test(text.split("\n")[0] || "")) {
        return text;
      }

      // Some tenants can respond as JSON wrapper (e.g. with a file URL).
      try {
        const parsed = JSON.parse(text) as { url?: string; fileUrl?: string; downloadUrl?: string };
        const fileUrl = parsed.downloadUrl || parsed.fileUrl || parsed.url;
        if (fileUrl) {
          return await this.fetchCsv(fileUrl);
        }
      } catch {
        // Ignore JSON parse failures and return empty.
      }
    } catch (error) {
      console.error(`[${this.name}] CSV button export request failed:`, error);
    }

    return "";
  }

  private parseCatalogCsv(csvText: string): Course[] {
    const rows = this.parseCsvRows(csvText);
    if (rows.length === 0) return [];

    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const idx = (names: string[]) => {
      for (const name of names) {
        const i = headers.indexOf(name);
        if (i >= 0) return i;
      }
      return -1;
    };

    const subjectIdx = idx(["subject"]);
    const courseNumberIdx = idx(["course number"]);
    const codeIdx = idx(["code", "course code", "course_number", "catalogdisplayname"]);
    const titleIdx = idx(["course title", "title", "name"]);
    const deptIdx = idx(["department", "department(s)", "departments"]);
    const minUnitsIdx = idx([
      "credits - units - minimum units",
      "minimum units",
      "credits",
      "credit",
      "units",
    ]);
    const maxUnitsIdx = idx([
      "credits - units - maximum units",
      "maximum units",
    ]);
    const descIdx = idx(["course description", "description"]);

    if ((codeIdx < 0 && (subjectIdx < 0 || courseNumberIdx < 0)) || titleIdx < 0) {
      console.log(`[${this.name}] CSV parsed but required columns not found.`);
      return [];
    }

    const input = this.semester?.toLowerCase() || "";
    const { term: termName, year: fullYear } = parseSemesterCode(input);

    const courses: Course[] = [];
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const subject = subjectIdx >= 0 ? (row[subjectIdx] || "").trim() : "";
      const courseNumber = courseNumberIdx >= 0 ? (row[courseNumberIdx] || "").trim() : "";
      const legacyCode = codeIdx >= 0 ? (row[codeIdx] || "").trim() : "";
      const courseCode = legacyCode || [subject, courseNumber].filter(Boolean).join(" ").trim();
      const title = (row[titleIdx] || "").trim();
      if (!courseCode || !title) continue;

      const department = deptIdx >= 0 ? (row[deptIdx] || "").trim() : "";
      const minUnits = minUnitsIdx >= 0 ? (row[minUnitsIdx] || "").trim() : "";
      const maxUnits = maxUnitsIdx >= 0 ? (row[maxUnitsIdx] || "").trim() : "";
      const units = minUnits && maxUnits && minUnits !== maxUnits
        ? `${minUnits}-${maxUnits}`
        : (minUnits || maxUnits);
      const description = descIdx >= 0 ? (row[descIdx] || "").trim() : "";

      let level = "undergraduate";
      const codeNumMatch = courseCode.match(/\d+/);
      if (codeNumMatch) {
        const num = parseInt(codeNumMatch[0]);
        if (num >= 200) level = "graduate";
      }

      courses.push({
        university: this.name,
        courseCode,
        title,
        units,
        description,
        url: `https://graduate.catalog.berkeley.edu/courses?cq=${encodeURIComponent(courseCode)}&sortBy=code`,
        department,
        level,
        semesters: [{ term: termName, year: fullYear }],
      });
    }

    return courses;
  }

  private parseCsvRows(input: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      const next = input[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === "," && !inQuotes) {
        row.push(cell);
        cell = "";
        continue;
      }

      if ((ch === "\n" || ch === "\r") && !inQuotes) {
        if (ch === "\r" && next === "\n") i += 1;
        row.push(cell);
        cell = "";
        if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) {
          rows.push(row);
        }
        row = [];
        continue;
      }

      cell += ch;
    }

    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }

    return rows;
  }

  async parser(_html: string, _existingCodes?: Set<string>): Promise<Course[]> {
    // UCB now uses CSV export only; no HTML parsing path remains.
    void _html;
    void _existingCodes;
    return [];
  }

  private parseCourseCode(code: string): {
    subject: string;
    number: number;
    suffix2: string;
    numericLength: number;
    numberPrefixNormalized: string;
    numberSuffix: string;
  } | null {
    const trimmed = code.trim().toUpperCase();
    const match = trimmed.match(/^([A-Z&]+)\s+([A-Z]*)(\d+)([A-Z]*)$/);
    if (!match) return null;
    const subject = match[1];
    const rawPrefix = (match[2] || "").toUpperCase();
    const numericPart = parseInt(match[3], 10);
    if (!Number.isFinite(numericPart)) return null;
    const rawSuffix = (match[4] || "").toUpperCase();

    // Berkeley prefix modifiers C/S/W generally indicate delivery/cross-list variants.
    const numberPrefixNormalized = rawPrefix.replace(/[CSW]/g, "");
    // Keep substantive suffixes (e.g., AC/H/N) distinct; only normalize web suffix "W".
    const numberSuffix = rawSuffix.endsWith("W")
      ? rawSuffix.slice(0, -1)
      : rawSuffix;

    return {
      subject,
      number: numericPart,
      suffix2: String(numericPart % 100).padStart(2, "0"),
      numericLength: match[3].length,
      numberPrefixNormalized,
      numberSuffix,
    };
  }

  private getLevelRank(code: string): number {
    const parsed = this.parseCourseCode(code);
    if (!parsed) return 0;
    return Math.floor(parsed.number / 100);
  }

  private dedupeCoursesByTitleAndPattern(courses: Course[]): Course[] {
    const grouped = new Map<string, Course[]>();

    for (const course of courses) {
      const parsed = this.parseCourseCode(course.courseCode);
      const titleKey = (course.title || "").trim().toLowerCase();
      if (!parsed) {
        const fallbackKey = `__raw__:${course.courseCode}:${titleKey}`;
        const list = grouped.get(fallbackKey) || [];
        list.push(course);
        grouped.set(fallbackKey, list);
        continue;
      }

      const key = `${parsed.subject}-${parsed.suffix2}-${parsed.numericLength}-${parsed.numberPrefixNormalized}-${parsed.numberSuffix}::${titleKey}`;
      const list = grouped.get(key) || [];
      list.push(course);
      grouped.set(key, list);
    }

    const deduped: Course[] = [];
    for (const entries of grouped.values()) {
      if (entries.length === 1) {
        deduped.push(entries[0]);
        continue;
      }

      const sorted = [...entries].sort((a, b) => {
        const rankDiff = this.getLevelRank(b.courseCode) - this.getLevelRank(a.courseCode);
        if (rankDiff !== 0) return rankDiff;
        return b.courseCode.localeCompare(a.courseCode);
      });
      const winner = sorted[0];

      const ucbCodeLinks = sorted
        .map((c) => ({ id: c.courseCode, link: c.url || "" }))
        .filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx);

      winner.details = {
        ...(winner.details as Record<string, unknown>),
        variant_code_links: ucbCodeLinks,
      };
      winner.level = this.getLevelRank(winner.courseCode) >= 2 ? "graduate" : "undergraduate";

      deduped.push(winner);
    }

    return deduped;
  }
}
