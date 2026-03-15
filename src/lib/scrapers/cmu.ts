import * as cheerio from "cheerio";
import { BaseScraper } from "./BaseScraper";
import { Course } from "./types";
import { fetch, Agent } from "undici";
import { parseCMUSemester, compareSemesters } from "./utils/semester";

export class CMU extends BaseScraper {
  private agent: Agent;

  constructor() {
    super("cmu");
    this.agent = new Agent({
      connect: {
        rejectUnauthorized: false
      }
    });
  }

  getSemesterParam(): string {
    // Default to F25 if no semester is provided
    if (!this.semester) return "F25";

    const input = this.semester.toLowerCase();
    const yearMatch = input.match(/\d{2,4}/);
    const year = yearMatch ? yearMatch[0] : "25";
    
    // Term detection
    let cmuTerm = 'F';
    if (input.includes('fa') || input.includes('fall')) cmuTerm = 'F';
    else if (input.includes('sp') || input.includes('spring')) cmuTerm = 'S';
    else if (input.includes('wi') || input.includes('winter')) cmuTerm = 'S'; // Winter maps to Spring at CMU
    else if (input.includes('su') || input.includes('summer')) cmuTerm = 'M';
    
    // Use last 2 digits of year
    const shortYear = year.length === 4 ? year.slice(2) : year;
    
    return `${cmuTerm}${shortYear}`;
  }

  async fetchPage(url: string, retries = 3): Promise<string> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[${this.name}] Fetching ${url} (attempt ${attempt})...`);
        const response = await fetch(url, { dispatcher: this.agent });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        return await response.text();
      } catch (error) {
        console.error(`[${this.name}] Attempt ${attempt} failed for ${url}:`, error);
        if (attempt < retries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    return "";
  }

  async links(): Promise<string[]> {
    return ["https://enr-apps.as.cmu.edu/open/SOC/SOCServlet/search"];
  }

  async retrieve(): Promise<Course[]> {
    const url = "https://enr-apps.as.cmu.edu/open/SOC/SOCServlet/search";
    const cmuSemester = this.getSemesterParam();
    const { term, year } = parseCMUSemester(cmuSemester);

    console.log(`[${this.name}] Using semester code: ${cmuSemester}`);

    const availableSemesters = await this.fetchAvailableSemesterCodes(url);
    if (availableSemesters.length > 0 && !availableSemesters.includes(cmuSemester)) {
      throw new Error(
        `CMU source does not expose semester ${cmuSemester}. Available semesters: ${availableSemesters.join(", ")}`
      );
    }

    const upToDateCodes = new Set<string>();
    if (this.db) {
      const existingMap = await this.db.getExistingCourseCodes("CMU");
      for (const [code, latest] of existingMap.entries()) {
        if (latest && compareSemesters(latest, { term, year }) >= 0 && latest.hasDescription) {
          upToDateCodes.add(code);
        }
      }
    }
    
    if (upToDateCodes.size > 0) {
      console.log(`[${this.name}] Found ${upToDateCodes.size} up-to-date courses in DB. These will skip detail fetching.`);
    }

    const params = new URLSearchParams();
    params.append("SEMESTER", cmuSemester);
    params.append("MINI", "NO");
    params.append("GRAD_UNDER", "All");
    params.append("PRG_LOCATION", "All");
    params.append("DEPT", "CS");
    params.append("DEPT", "ECE");
    params.append("DEPT", "MSC");
    params.append("BEG_TIME", "All");
    params.append("KEYWORD", "");
    params.append("TITLE_ONLY", "NO");
    params.append("SUBMIT", "Retrieve Schedule");

    const html = await this.fetchWithBody(url, params);
    if (html) {
      return await this.parser(html, upToDateCodes);
    }
    return [];
  }

  private async fetchAvailableSemesterCodes(url: string): Promise<string[]> {
    const html = await this.fetchPage(url);
    if (!html) return [];
    const found = Array.from(html.matchAll(/<option[^>]*value=\"([A-Z][0-9]{2})\"/g))
      .map((m) => m[1])
      .filter((v): v is string => Boolean(v));
    return Array.from(new Set(found));
  }

  private async fetchWithBody(url: string, body?: URLSearchParams): Promise<string> {
    console.log(`[${this.name}] Fetching ${url}...`);

    try {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: body ? {
          "Content-Type": "application/x-www-form-urlencoded",
        } : {},
        body: body,
        dispatcher: this.agent,
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${url}: ${response.status} ${response.statusText}`
        );
      }
      return await response.text();
    } catch (error) {
      console.error(`[${this.name}] Error fetching ${url}:`, error);
      return "";
    }
  }

  async fetchDetail(courseCode: string, semester: string): Promise<{
    description: string;
    prerequisites: string;
    corequisites: string;
    resources: string[];
    crossListedCourses: string;
  }> {
    const cleanCode = courseCode.replace(/-/g, "");
    const url = `https://enr-apps.as.cmu.edu/open/SOC/SOCServlet/courseDetails?COURSE=${cleanCode}&SEMESTER=${semester}`;

    // Small delay to be polite
    await new Promise(resolve => setTimeout(resolve, 200));

    try {
      const html = await this.fetchPage(url);
      if (!html) return {
        description: "",
        prerequisites: "",
        corequisites: "",
        resources: [],
        crossListedCourses: ""
      };

      const $ = cheerio.load(html);

      // Extract description
      const description = $("#course-detail-description p").text().trim();

      // Extract prerequisites
      const prerequisites = $("dt:contains('Prerequisites')").next("dd").text().trim();

      // Extract corequisites
      const corequisites = $("dt:contains('Corequisites')").next("dd").text().trim();

      // Extract related URLs (excluding generic department homepages)
      const resources: string[] = [];
      const ignoredUrls = [
        "http://www.csd.cmu.edu",
        "https://www.csd.cmu.edu",
        "http://www.ece.cmu.edu/",
        "https://www.ece.cmu.edu/"
      ];
      $("#course-detail-related-urls a").each((_, el) => {
        const href = $(el).attr("href");
        if (href && !ignoredUrls.includes(href)) {
          resources.push(href);
        }
      });

      // Extract cross-listed courses
      const crossListedCourses = $("dt:contains('Cross-Listed Courses')").next("dd").text().trim();

      return {
        description,
        prerequisites: prerequisites === "None" ? "" : prerequisites,
        corequisites: corequisites === "None" ? "" : corequisites,
        resources,
        crossListedCourses: crossListedCourses === "None" ? "" : crossListedCourses
      };
    } catch (error) {
      console.error(`[${this.name}] Error fetching details for ${courseCode}:`, error);
      return {
        description: "",
        prerequisites: "",
        corequisites: "",
        resources: [],
        crossListedCourses: ""
      };
    }
  }

  async parser(html: string, existingCodes: Set<string> = new Set()): Promise<Course[]> {
    const $ = cheerio.load(html);
    const rawCourses: Course[] = [];

    // Parse semester code (e.g., "F25" -> "Fall", 2025)
    const semesterCode = this.getSemesterParam();
    const { term, year } = parseCMUSemester(semesterCode);

    const ALLOWED_DEPTS = [
      "ELECTRICAL & COMPUTER ENGINEERING",
      "COMPUTER SCIENCE",
      "MATHEMATICAL SCIENCES",
    ];

    const tables = $("table#search-results-table");
    let currentCourse: Course | null = null;
    
    for (const tableElement of tables.toArray()) {
      const table = $(tableElement);
      const prevH4 = table.prevAll("h4.department-title").first();
      if (prevH4.length === 0) continue;

      const deptName = prevH4.text().trim();
      if (!ALLOWED_DEPTS.includes(deptName)) continue;

      const tbody = table.find("tbody");
      if (tbody.length === 0) continue;

      const rows = tbody.find("tr").toArray();

      for (const trElement of rows) {
        const cols = $(trElement).find("td");
        if (cols.length < 10) continue;

        const getText = (idx: number) => $(cols[idx]).text().trim().replace(/\u00a0/g, " ");
        const rawId = getText(0);
        const normalizedCode = this.normalizeCourseCode(rawId);

        // CMU course IDs usually look like "15-112" or "15112"
        if (normalizedCode && (/\d{2}-\d{3}/.test(normalizedCode) || /^\d{5}$/.test(normalizedCode))) {
          if (currentCourse) {
            rawCourses.push(currentCourse);
          }

          // Check if we should skip detail fetching
          const shouldSkip = existingCodes.has(normalizedCode) || existingCodes.has(rawId);
          
          // Extract URL from onclick attribute if present
          const onclick = $(cols[0]).find('a').attr('onclick') || '';
          const urlMatch = onclick.match(/openModal\('[^']+',\s*'[^']+',\s*'([^']+)'/);
          let courseUrl = "";
          if (urlMatch) {
            courseUrl = `https://enr-apps.as.cmu.edu${urlMatch[1]}`.replace(/&amp;/g, "&");
          }

          // Determine Level: CMU levels are like 15-112.
          // 100-500 are Undergraduate, 600+ are Graduate.
          let level = "undergraduate";
          const parts = this.getCodeParts(normalizedCode);
          if (parts) {
            const num = parts.number;
            if (num >= 600) level = "graduate";
          }

          let department = "Computer Science";
          if (normalizedCode.startsWith("18")) {
            department = "Electrical & Computer Engineering";
          } else if (normalizedCode.startsWith("21")) {
            department = "Mathematical Sciences";
          }

          currentCourse = {
            university: this.name,
            courseCode: normalizedCode,
            title: getText(1),
            units: getText(2),
            description: "", // Populated later
            url: courseUrl,
            department: department,
            corequisites: "", // Populated later
            level: level,
            semesters: [{ term: term, year: year }],
            details: {
              sections: [],
              prerequisites: "",
              resources: [],
              crossListedCourses: "",
              is_partially_scraped: shouldSkip // Flag to indicate details were skipped
            },
          };
        }

        if (currentCourse) {
          const secId = getText(3);
          const meeting = {
            days: getText(5),
            begin: getText(6),
            end: getText(7),
            location: getText(8),
          };

          const details = currentCourse.details as any; // eslint-disable-line @typescript-eslint/no-explicit-any
          if (rawId || secId) {
            const section = {
              id: secId,
              meetings: [meeting],
            };
            details.sections.push(section);
          } else {
            const sections = details.sections;
            if (sections.length > 0) {
              sections[sections.length - 1].meetings.push(meeting);
            }
          }
        }
      }
      
      if (currentCourse) {
        rawCourses.push(currentCourse);
        currentCourse = null;
      }
    }

    const dedupedCourses = this.dedupeCoursesByTitleAndPattern(rawCourses);

    // Now fetch details for rawCourses concurrently
    const pLimit = (await import("p-limit")).default;
    const limit = pLimit(10); // 10 concurrent detail fetches

    const toFetch = dedupedCourses.filter(c => !c.details?.is_partially_scraped);
    console.log(`[${this.name}] Starting concurrent detail retrieval for ${toFetch.length} courses...`);

    await Promise.all(toFetch.map(course => limit(async () => {
       try {
         const details = await this.fetchDetail(course.courseCode, semesterCode);
         course.description = details.description;
         course.corequisites = details.corequisites;
         if (course.details) {
           const d = course.details as any; // eslint-disable-line @typescript-eslint/no-explicit-any
           d.prerequisites = details.prerequisites;
           d.resources = details.resources;
           d.crossListedCourses = details.crossListedCourses;
         }
       } catch (error) {
         console.error(`[${this.name}] Failed to fetch details for ${course.courseCode}:`, error);
       }
    })));

    return dedupedCourses;
  }

  private normalizeCourseCode(code: string): string {
    const trimmed = code.trim();
    if (/^\d{2}-\d{3}$/.test(trimmed)) return trimmed;
    if (/^\d{5}$/.test(trimmed)) {
      return `${trimmed.slice(0, 2)}-${trimmed.slice(2)}`;
    }
    return trimmed;
  }

  private getCodeParts(code: string): { prefix: string; number: number; suffix: string } | null {
    const normalized = this.normalizeCourseCode(code);
    const match = normalized.match(/^(\d{2})-(\d{3})$/);
    if (!match) return null;
    const prefix = match[1];
    const number = Number(match[2]);
    if (!Number.isFinite(number)) return null;
    return { prefix, number, suffix: String(number % 100).padStart(2, "0") };
  }

  private getLevelRank(code: string): number {
    const parts = this.getCodeParts(code);
    if (!parts) return 0;
    const n = parts.number;
    if (n >= 700) return 7;
    if (n >= 600) return 6;
    if (n >= 500) return 5;
    if (n >= 400) return 4;
    if (n >= 300) return 3;
    if (n >= 200) return 2;
    if (n >= 100) return 1;
    return 0;
  }

  private dedupeCoursesByTitleAndPattern(courses: Course[]): Course[] {
    const grouped = new Map<string, Course[]>();

    for (const course of courses) {
      const parts = this.getCodeParts(course.courseCode);
      if (!parts) {
        const fallbackKey = `__raw__:${course.courseCode}:${(course.title || "").trim().toLowerCase()}`;
        const list = grouped.get(fallbackKey) || [];
        list.push(course);
        grouped.set(fallbackKey, list);
        continue;
      }
      const titleKey = (course.title || "").trim().toLowerCase();
      const key = `${parts.prefix}-${parts.suffix}::${titleKey}`;
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
        const aNum = this.getCodeParts(a.courseCode)?.number || 0;
        const bNum = this.getCodeParts(b.courseCode)?.number || 0;
        return bNum - aNum;
      });
      const winner = sorted[0];

      // Store all duplicate code->detail links on the winning record.
      const cmuCodeLinks = sorted
        .map((c) => ({ id: c.courseCode, link: c.url || "" }))
        .filter((item) => item.id)
        .filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx);

      const mergedSections = sorted.flatMap((c) => {
        const sections = (c.details as Record<string, unknown> | undefined)?.sections;
        return Array.isArray(sections) ? sections : [];
      });

      const winnerDetails = ((winner.details as Record<string, unknown>) || {});
      winner.details = {
        ...winnerDetails,
        sections: mergedSections,
        variant_code_links: cmuCodeLinks,
      };

      deduped.push(winner);
    }

    return deduped;
  }
}
