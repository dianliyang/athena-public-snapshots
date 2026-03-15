import * as cheerio from "cheerio";
import { BaseScraper } from "./BaseScraper";
import { Course } from "./types";
import { parseSemesterCode, compareSemesters } from "./utils/semester";

export class Stanford extends BaseScraper {
  constructor() {
    super("stanford");
  }

  getSemesterParam(): string {
    if (!this.semester) return "";

    const input = this.semester.toLowerCase();
    if (input.includes("fa") || input.includes("fall")) return "Autumn";
    if (input.includes("wi") || input.includes("winter")) return "Winter";
    if (input.includes("sp") || input.includes("spring")) return "Spring";
    if (input.includes("su") || input.includes("summer")) return "Summer";

    return "";
  }

  getAcademicYear(term: string, year: number): string {
    // Stanford academic year starts in Autumn.
    // e.g. Autumn 2025 is AY 2025-2026 (20252026)
    // e.g. Spring 2026 is AY 2025-2026 (20252026)
    if (term === "Autumn") {
      return `${year}${year + 1}`;
    }
    return `${year - 1}${year}`;
  }

  links(): string[] {
    return []; // Not used as retrieve() is overridden
  }

  async retrieve(): Promise<Course[]> {
    const DEPTS = ["CS", "MATH"];
    const allCourses: Course[] = [];

    let termsToScrape: { term: string; year: number }[] = [];

    if (this.semester) {
      const { term, year } = parseSemesterCode(this.semester);
      const stanfordTerm = term === "Fall" ? "Autumn" : term;
      termsToScrape.push({ term: stanfordTerm, year });
    } else {
      // Default to current AY 2025-2026
      termsToScrape = [
        { term: "Autumn", year: 2025 },
        { term: "Winter", year: 2026 },
        { term: "Spring", year: 2026 },
        { term: "Summer", year: 2026 },
      ];
    }

    console.log(
      `[${this.name}] Processing ${termsToScrape.length} terms for depts: ${DEPTS.join(", ")}`
    );

    for (const { term, year } of termsToScrape) {
      // Get existing courses for this specific term/year
      const dbTerm = term === "Autumn" ? "Fall" : term;
      const upToDateCodes = new Set<string>();
      if (this.db) {
        const existingMap = await this.db.getExistingCourseCodes("Stanford");
        for (const [code, latest] of existingMap.entries()) {
          if (latest && compareSemesters(latest, { term: dbTerm, year }) >= 0 && latest.hasDescription) {
            upToDateCodes.add(code);
          }
        }
      }

      for (const dept of DEPTS) {
        const academicYear = this.getAcademicYear(term, year);
        const baseUrl = "https://explorecourses.stanford.edu/print";
        const params = new URLSearchParams();
        params.append("filter-coursestatus-Active", "on");
        params.append("descriptions", "on");
        params.append("q", dept);
        params.append("academicYear", academicYear);
        params.append(`filter-term-${term}`, "on");

        const url = `${baseUrl}?${params.toString()}`;
        const html = await this.fetchPage(url);
        if (html) {
          const courses = await this.parser(html, upToDateCodes, { term: dbTerm, year });

          // Filter to ensure we only get courses from the target department
          // (Stanford search can be fuzzy)
          const filtered = courses.filter((c) => c.courseCode.startsWith(dept));
          allCourses.push(...filtered);
        }
      }
    }

    return this.dedupeCoursesByTitleAndPattern(allCourses);
  }

  async fetchPage(url: string): Promise<string> {
    console.log(`[${this.name}] Fetching ${url} with cookies...`);
    try {
      const response = await fetch(url, {
        headers: {
          Cookie: "jsenabled=1",
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
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

  async parser(
    html: string,
    existingCodes: Set<string> = new Set(),
    semesterInfo?: { term: string; year: number }
  ): Promise<Course[]> {
    const $ = cheerio.load(html);
    const courses: Course[] = [];

    $(".searchResult").each((_, element) => {
      const result = $(element);
      const course: Course = {
        university: this.name,
        courseCode: "",
        title: "",
        description: "",
        url: "",
        semesters: semesterInfo ? [semesterInfo] : [],
        details: {
          terms: [],
          instructors: [],
        },
      };

      const courseInfo = result.find(".courseInfo");
      if (courseInfo.length > 0) {
        const numberSpan = courseInfo.find(".courseNumber");
        if (numberSpan.length > 0) {
          const rawCode = numberSpan.text().trim().replace(/:$/, "");
          course.courseCode = rawCode;
          course.url = `https://explorecourses.stanford.edu/search?q=${encodeURIComponent(rawCode)}&view=catalog`;

          // OPTIMIZATION: If course already exists for this semester, skip parsing details
          if (existingCodes.has(rawCode)) {
            const titleSpan = courseInfo.find(".courseTitle");
            course.title = titleSpan.text().trim();
            const descDiv = courseInfo.find(".courseDescription");
            if (descDiv.length > 0) {
              course.description = descDiv.text().trim();
            }
            course.semesters = semesterInfo ? [semesterInfo] : [];
            course.details = { is_partially_scraped: true };
            courses.push(course);
            return;
          }

          // Determine level from course number
          const match = rawCode.match(/\d+/);
          if (match) {
            const num = parseInt(match[0]);
            if (num >= 200) {
              course.level = "graduate";
            } else if (num >= 100) {
              course.level = "undergraduate";
            } else {
              // Numbers like CS 7 are also undergrad
              course.level = "undergraduate";
            }
          }

          // Map department
          if (rawCode.startsWith("CS")) {
            course.department = "Computer Science";
          } else if (rawCode.startsWith("EE")) {
            course.department = "Electrical Engineering";
          } else if (rawCode.startsWith("MATH")) {
            course.department = "Mathematics";
          }
        }

        const titleSpan = courseInfo.find(".courseTitle");
        if (titleSpan.length > 0) {
          course.title = titleSpan.text().trim();
        }

        const descDiv = courseInfo.find(".courseDescription");
        if (descDiv.length > 0) {
          const description = descDiv.text().trim();
          course.description = description;

          // Extract Prereq and Coreq from description if present
          const prereqMatch = description.match(
            /(?:Prerequisites?|Prereq):\s*(.*?)(?=\.\s|[A-Z][a-z]+:|\n|$)/i
          );
          if (prereqMatch) {
            const prereqText = prereqMatch[1].trim();
            course.corequisites = prereqText;
          }

          // Also look for explicit Corequisite field
          const coreqMatch = description.match(
            /(?:Corequisites?|Coreq):\s*(.*?)(?=\.\s|[A-Z][a-z]+:|\n|$)/i
          );
          if (coreqMatch) {
            course.corequisites = coreqMatch[1].trim();
          }
        }
      }

      result.find(".courseAttributes").each((_, attrDiv) => {
        const text = $(attrDiv).text().replace(/\s+/g, " ").trim();

        if (text.includes("Terms:")) {
          const parts = text.split("|");
          for (const part of parts) {
            const p = part.trim();
            if (p.startsWith("Terms:")) {
              const termsStr = p.replace("Terms:", "").trim();
              const details = course.details as {
                terms: string[];
                instructors: string[];
              };
              details.terms = termsStr
                .split(",")
                .map((t) => t.trim())
                .filter((t) => t);
            } else if (p.startsWith("Units:")) {
              course.units = p.replace("Units:", "").trim();
            }
          }
        }

        if (text.includes("Instructors:")) {
          let instructorsText = text.replace("Instructors:", "").trim();
          if (instructorsText.startsWith(";")) {
            instructorsText = instructorsText.substring(1).trim();
          }

          if (instructorsText) {
            const links = $(attrDiv).find("a");
            const details = course.details as {
              terms: string[];
              instructors: string[];
            };
            if (links.length > 0) {
              details.instructors = links
                .map((_, a) => $(a).text().trim())
                .get();
            } else {
              details.instructors = [instructorsText];
            }
          }
        }
      });

      courses.push(course);
    });

    return courses;
  }

  private parseCourseCode(code: string): { subject: string; number: number; suffix2: string } | null {
    const trimmed = code.trim().toUpperCase();
    const match = trimmed.match(/^([A-Z&]+)\s+(\d+)([A-Z]*)$/);
    if (!match) return null;
    const subject = match[1];
    const number = parseInt(match[2], 10);
    if (!Number.isFinite(number)) return null;
    return {
      subject,
      number,
      suffix2: String(number % 100).padStart(2, "0"),
    };
  }

  private getLevelRank(code: string): number {
    const parsed = this.parseCourseCode(code);
    if (!parsed) return 0;
    if (parsed.number >= 300) return 4;
    if (parsed.number >= 200) return 3;
    if (parsed.number >= 100) return 2;
    return 1;
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

      const key = `${parsed.subject}-${parsed.suffix2}::${titleKey}`;
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

      const mergedTerms = Array.from(
        new Set(
          sorted.flatMap((c) => {
            const terms = (c.details as Record<string, unknown> | undefined)?.terms;
            return Array.isArray(terms) ? terms.map((t) => String(t)) : [];
          })
        )
      );
      const mergedInstructors = Array.from(
        new Set(
          sorted.flatMap((c) => {
            const instructors = (c.details as Record<string, unknown> | undefined)?.instructors;
            return Array.isArray(instructors) ? instructors.map((t) => String(t)) : [];
          })
        )
      );
      const stanfordCodeLinks = sorted
        .map((c) => ({ id: c.courseCode, link: c.url || "" }))
        .filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx);

      winner.details = {
        ...(winner.details as Record<string, unknown>),
        terms: mergedTerms,
        instructors: mergedInstructors,
        variant_code_links: stanfordCodeLinks,
      };
      winner.level = this.getLevelRank(winner.courseCode) >= 3 ? "graduate" : "undergraduate";

      deduped.push(winner);
    }

    return deduped;
  }
}
