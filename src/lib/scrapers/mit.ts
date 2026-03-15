import * as cheerio from 'cheerio';
import { BaseScraper } from './BaseScraper';
import { Course } from './types';
import { AnyNode, Element, Text } from 'domhandler';
import { parseSemesterCode } from './utils/semester';

export class MIT extends BaseScraper {
  constructor() {
    super("mit");
  }

  getSemesterParam(): string {
    if (!this.semester) return "";
    
    const input = this.semester.toLowerCase();
    if (input.includes('sp') || input.includes('spring')) return "Spring";
    if (input.includes('fa') || input.includes('fall')) return "Fall";
    if (input.includes('su') || input.includes('summer')) return "Summer";
    if (input.includes('wi') || input.includes('winter')) return "Winter";
    
    return "";
  }

  async links(): Promise<string[]> {
    const term = this.getSemesterParam().toLowerCase();
    let termPath = "";

    if (term) {
      try {
        const indexUrl = "https://student.mit.edu/catalog/index.cgi";
        const html = await this.fetchPage(indexUrl);
        if (html) {
          const $ = cheerio.load(html);
          const yearNum = this.semester?.replace(/\D/g, "") || "25";
          const fullYear = yearNum.length === 2 ? `20${yearNum}` : yearNum;
          const searchTitle = `${term.charAt(0).toUpperCase()}${term.slice(1)} ${fullYear}`;
          
          console.log(`[${this.name}] Checking for: "${searchTitle}"`);

          // 1. Check if it's the current semester (Main Header)
          const mainHeader = $('h1:contains("MIT Subject Listing")');
          let foundCurrent = false;

          if (mainHeader.length > 0) {
            const headerText = mainHeader.text();
            // Handle cases like "IAP/Spring 2026" or "Fall 2025"
            if (headerText.toLowerCase().includes(searchTitle.toLowerCase()) || 
               (term === 'spring' && headerText.toLowerCase().includes('iap/spring ' + fullYear))) {
               
               console.log(`[${this.name}] Found current semester: ${searchTitle}. Using root catalog.`);
               termPath = ""; 
               foundCurrent = true;
            }
          }

          if (!foundCurrent) {
               console.log(`[${this.name}] Not current semester. Searching archive for: "${searchTitle}"`);
               let archiveLink = $(`a:contains("${searchTitle}")`);
               
               if (archiveLink.length === 0 && term === 'spring') {
                  archiveLink = $(`a:contains("IAP/${searchTitle}")`);
               }

               if (archiveLink.length > 0) {
                 const href = archiveLink.attr('href');
                 if (href) {
                   termPath = href.replace(/^\.?\//, "").replace(/\/index\.cgi$/, "");
                   if (termPath) termPath = "/" + termPath;
                   console.log(`[${this.name}] Found dynamic archive path: ${termPath}`);
                 }
               } else {
                 console.log(`[${this.name}] Semester "${searchTitle}" not found in current listing or archives.`);
                 return []; // Terminate early and return 0 links
               }
          }
        }
      } catch (error) {
        console.error(`[${this.name}] Failed to discover dynamic links:`, error);
        return [];
      }
    }

    const eecsPaths = ['a', 'b', 'c', 'd', 'e'].map(
      (i) => `https://student.mit.edu/catalog${termPath}/m6${i}.html`
    );
    const mathPaths = ['a', 'b'].map(
      (i) => `https://student.mit.edu/catalog${termPath}/m18${i}.html`
    );
    return [...eecsPaths, ...mathPaths];
  }

  async parser(html: string, existingCodes: Set<string> = new Set()): Promise<Course[]> {
    const $ = cheerio.load(html);
    const courses: Course[] = [];
    const h3Tags = $('h3');

    // Parse requested semester
    const input = this.semester?.toLowerCase() || "";
    const { term: termName, year: fullYear } = parseSemesterCode(input);

    h3Tags.each((_, h3Element) => {
      const h3 = $(h3Element);
      const headerText = h3.text().replace(/\s+/g, ' ').trim();
      const match = headerText.match(/^([\w\.]+J?)\s+(.+)/);

      if (!match) return;

      const courseId = match[1];
      const courseTitle = match[2];

      // OPTIMIZATION: If course already exists for this semester, skip parsing details
      if (existingCodes.has(courseId)) {
        courses.push({
          university: this.name,
          courseCode: courseId,
          title: courseTitle,
          semesters: [{ term: termName, year: fullYear }],
          details: { is_partially_scraped: true }
        });
        return;
      }

      const details: Record<string, string | string[] | undefined> = {};
      const descriptionParts: string[] = [];
      const instructors: string[] = [];
      let descriptionStarted = false;
      const consumedNodes = new Set<AnyNode>();

      let curr: AnyNode | null = h3Element.next;
      let level = "";

      while (curr) {
        if (curr.type === 'tag' && curr.name === 'h3') break;
        if (curr.type === 'tag' && curr.name === 'a') {
          const nameAttr = $(curr).attr('name');
          if (nameAttr && /^\d+\./.test(nameAttr)) break;
        }

        if (consumedNodes.has(curr)) {
          curr = curr.next;
          continue;
        }

        if (curr.type === 'text') {
          const textNode = curr as Text;
          const text = textNode.data.trim();
          
          if (text) {
            if (text.startsWith('Prereq:')) {
              const parts = [text.replace('Prereq:', '').trim()];
              let temp = curr.next;
              while (temp && (temp.type !== 'tag' || (temp.name !== 'br' && temp.name !== 'h3' && temp.name !== 'img'))) {
                parts.push($(temp).text().trim());
                consumedNodes.add(temp);
                temp = temp.next;
              }
              details['prerequisites'] = parts.join(" ").trim();
            } else if (text.startsWith('Units:')) {
              const parts = [text.replace('Units:', '').trim()];
              let temp = curr.next;
              while (temp && (temp.type !== 'tag' || (temp.name !== 'br' && temp.name !== 'h3'))) {
                parts.push($(temp).text().trim());
                consumedNodes.add(temp);
                temp = temp.next;
              }
              details['units'] = parts.join(" ").trim();
            } else if (descriptionStarted) {
              const terms = ['Fall:', 'Spring:', 'Summer:', 'IAP:'];
              if (terms.some(t => text.startsWith(t))) {
                let instText = text;
                const temp = curr.next;
                if (temp && temp.type === 'tag' && temp.name === 'i') {
                  instText += " " + $(temp).text().trim();
                  consumedNodes.add(temp);
                }
                instructors.push(instText);
              } else if (!text.startsWith('Textbooks') && text !== 'end') {
                descriptionParts.push(text);
              }
            }
          }
        } else if (curr.type === 'tag') {
          const element = curr as Element;
          if (element.name === 'img') {
            const alt = $(element).attr('alt') || '';
            const title = $(element).attr('title') || '';
            
            if (alt === 'Undergrad' || title === 'Undergrad') level = 'undergraduate';
            else if (alt === 'Graduate' || title === 'Graduate') level = 'graduate';

            if (['Fall', 'Spring', 'Summer'].includes(alt)) {
              if (!details['terms']) details['terms'] = [];
              if (Array.isArray(details['terms']) && !details['terms'].includes(alt)) {
                 (details['terms'] as string[]).push(alt);
              }
            } else if (alt === '______') descriptionStarted = true;
          } else if (element.name === 'a' && descriptionStarted) {
            const text = $(element).text().trim();
            if (text && !text.startsWith('Textbooks') && text !== 'end') descriptionParts.push(text);
          } else if (descriptionStarted && !['img', 'h3', 'br'].includes(element.name)) {
            const text = $(element).text().trim();
            const terms = ['Fall:', 'Spring:', 'Summer:', 'IAP:'];
            if (text && !text.startsWith('Textbooks') && text !== 'end' && !terms.some(t => text.startsWith(t))) descriptionParts.push(text);
          }
        }
        curr = curr.next;
      }

      const inferredLevel = level || this.inferLevelFromCourseCode(courseId);
      courses.push({
        university: this.name,
        courseCode: courseId,
        title: courseTitle,
        units: details.units as string | undefined,
        description: descriptionParts.join(" ").trim(),
        department: this.getDepartmentFromCourseCode(courseId),
        level: inferredLevel,
        corequisites: details.prerequisites as string | undefined,
        semesters: [{ term: termName, year: fullYear }],
        url: `https://student.mit.edu/catalog/search.cgi?search=${encodeURIComponent(courseId)}`,
        details: {
          terms: details.terms,
          instructors: instructors
        }
      });
    });

    return this.dedupeCoursesByTitleAndPattern(courses);
  }

  async retrieve(): Promise<Course[]> {
    const courses = await super.retrieve();
    if (courses.length > 0) {
      return this.dedupeCoursesByTitleAndPattern(courses);
    }

    // Historical fallback: MIT registrar archive pages sometimes stop exposing old term links.
    // Fall back to MIT Catalog subject pages for Course 6 and Course 18.
    const catalogFallback = await this.retrieveFromCatalogFallback();
    return this.dedupeCoursesByTitleAndPattern(catalogFallback);
  }

  private async retrieveFromCatalogFallback(): Promise<Course[]> {
    const subjectPages = [
      "https://catalog.mit.edu/subjects/6/",
      "https://catalog.mit.edu/subjects/18/",
    ];
    const input = this.semester?.toLowerCase() || "";
    const { term, year } = parseSemesterCode(input);
    const sem = { term, year };
    const all: Course[] = [];

    for (const pageUrl of subjectPages) {
      const html = await this.fetchPage(pageUrl);
      if (!html) continue;
      const $ = cheerio.load(html);

      $(".courseblock").each((_, el) => {
        const block = $(el);
        const titleRaw = block.find(".courseblocktitle strong").first().text().replace(/\s+/g, " ").trim();
        if (!titleRaw) return;
        const m = titleRaw.match(/^([A-Z0-9]+\.[A-Z]?\d+[A-Z]?)\s+(.+)$/);
        if (!m?.[1] || !m?.[2]) return;

        const code = m[1].trim();
        const title = m[2].trim();
        const desc = block.find(".courseblockdesc").first().text().replace(/\s+/g, " ").trim();
        const unitsText = block.find(".courseblockhours").first().text().replace(/\s+/g, " ").trim();
        const termsText = block.find(".courseblockterms").first().text().replace(/\s+/g, " ").trim();
        const instructorsText = block.find(".courseblockinstructors").first().text().replace(/\s+/g, " ").trim();

        all.push({
          university: this.name,
          courseCode: code,
          title,
          description: desc || "",
          units: unitsText || "",
          url: pageUrl,
          department: this.getDepartmentFromCourseCode(code),
          level: this.inferLevelFromCourseCode(code),
          semesters: [sem],
          details: {
            terms: termsText ? [termsText] : [],
            instructors: instructorsText ? [instructorsText] : [],
            source: "mit-catalog-fallback",
          },
        });
      });
    }

    if (all.length > 0) {
      console.log(`[${this.name}] Using MIT catalog fallback for historical term: ${this.semester || "unknown"}. Retrieved ${all.length} entries.`);
    }
    return all;
  }

  private parseCourseCode(code: string): {
    dept: string;
    subject: number;
    suffix2: string;
    numericLength: number;
    subjectPrefix: string;
    firstDigit: number;
    lastDigit: number;
    subjectSuffix: string;
  } | null {
    const match = code.trim().toUpperCase().match(/^([A-Z0-9]+)\.([A-Z]?)(\d+)([A-Z]?)$/);
    if (!match) return null;
    const dept = match[1];
    const subjectPrefix = match[2] || "";
    const subject = Number(match[3]);
    if (!Number.isFinite(subject)) return null;
    const suffix2 = String(subject % 100).padStart(2, "0");
    const firstDigit = Number(String(match[3])[0] || "0");
    const lastDigit = Number(String(match[3]).slice(-1));
    return {
      dept,
      subject,
      suffix2,
      numericLength: match[3].length,
      subjectPrefix,
      firstDigit: Number.isFinite(firstDigit) ? firstDigit : 0,
      lastDigit: Number.isFinite(lastDigit) ? lastDigit : 0,
      subjectSuffix: (match[4] || "").toUpperCase(),
    };
  }

  private inferLevelFromCourseCode(code: string): string {
    const parsed = this.parseCourseCode(code);
    if (!parsed) return "undergraduate";

    // Modern MIT 4-digit scheme often uses final digit as audience variant.
    if (parsed.numericLength === 4) {
      const lastDigit = parsed.lastDigit;
      if (lastDigit === 1) return "undergraduate";
      if (lastDigit === 0 || lastDigit === 2) return "graduate";
    }

    // General MIT rule: first digit after decimal indicates tier.
    if (parsed.firstDigit >= 5) return "graduate";
    return "undergraduate";
  }

  private getLevelRank(code: string): number {
    const parsed = this.parseCourseCode(code);
    if (!parsed) return 0;

    if (parsed.numericLength === 4) {
      const lastDigit = parsed.lastDigit;
      if (lastDigit === 1) return 1;
      if (lastDigit === 0 || lastDigit === 2) return 2;
    }

    if (parsed.firstDigit >= 5) return 2;
    if (parsed.firstDigit >= 1) return 1;
    return 0;
  }

  private getDepartmentFromCourseCode(code: string): string {
    const parsed = this.parseCourseCode(code);
    if (!parsed) return "MIT";

    const byDept: Record<string, string> = {
      "3": "Materials Science and Engineering",
      "4": "Architecture",
      "5": "Chemistry",
      "6": "Electrical Engineering and Computer Science",
      "7": "Biology",
      "8": "Physics",
      "17": "Political Science",
      "18": "Mathematics",
    };

    return byDept[parsed.dept] || `Course ${parsed.dept}`;
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

      // MIT has paired undergrad/grad variants in modern 4-digit numbering
      // where only the last digit differs (commonly ...0 / ...1 / ...2).
      // Collapse only these known variants while keeping stricter matching otherwise.
      const pairedMitGroup =
        parsed.numericLength === 4 && [0, 1, 2].includes(parsed.lastDigit)
          ? `${parsed.dept}-${Math.floor(parsed.subject / 10)}-paired-${parsed.subjectPrefix}-${parsed.subjectSuffix}`
          : null;
      const key = pairedMitGroup
        ? `${pairedMitGroup}::${titleKey}`
        : `${parsed.dept}-${parsed.suffix2}-${parsed.numericLength}-${parsed.subjectPrefix}-${parsed.subjectSuffix}::${titleKey}`;
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
      const mitCodeLinks = sorted
        .map((c) => ({ id: c.courseCode, link: c.url || "" }))
        .filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx);

      winner.details = {
        ...(winner.details as Record<string, unknown>),
        terms: mergedTerms,
        instructors: mergedInstructors,
        variant_code_links: mitCodeLinks,
      };
      winner.level = this.inferLevelFromCourseCode(winner.courseCode);

      deduped.push(winner);
    }

    return deduped;
  }
}
