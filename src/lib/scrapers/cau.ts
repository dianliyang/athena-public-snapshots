import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { BaseScraper } from "./BaseScraper";
import { Course } from "./types";
import * as cauBlobCache from "./cau-blob-cache";

type XmlExportParams = {
  token: string;
  db: string;
  keys: string;
  ref: string;
  sem: string;
  tdir: string;
};

type XmlLectureTerm = {
  startdate: string | null;
  enddate: string | null;
  starttime: string | null;
  endtime: string | null;
  repeat: string | null;
  exclude: string | null;
  roomKeys: string[];
};

type XmlLectureRecord = {
  key: string;
  id: string;
  number: string | null;
  importParentId: string | null;
  parentLectureKey: string | null;
  startdate: string | null;
  enddate: string | null;
  isEnglish: boolean;
  name: string;
  short: string;
  titleEn: string | null;
  type: string;
  orgname: string | null;
  summary: string | null;
  timeDescription: string | null;
  literature: string | null;
  organizational: string | null;
  ectsCred: string | null;
  sws: string | null;
  resourceUrls: string[];
  classificationKeys: string[];
  personKeys: string[];
  roomKeys: string[];
  terms: XmlLectureTerm[];
};

type ResolvedRoom = {
  name: string | null;
  short: string | null;
  building: string | null;
  address: string | null;
  label: string | null;
};

type ResolvedPerson = {
  name: string | null;
  email: string | null;
  office: string | null;
};

type ModulDbUnitEntry = {
  type: string;
  sws: number;
};

type ModulDbModule = {
  moduleCode: string;
  title: string | null;
  responsible: string | null;
  ects: number | null;
  workloadText: string | null;
  teachingLanguage: string | null;
  description: string | null;
  learningGoals: string | null;
  contents: string | null;
  prerequisites: string | null;
  assessment: string | null;
  teachingMethods: string | null;
  applicability: string | null;
  notes: string | null;
  literature: string | null;
  categories: string[];
  resourceUrls: string[];
  unitsBreakdown: ModulDbUnitEntry[];
  semesters: Array<{ term: string; year: number }>;
  pageUrl: string;
};

type DescriptionSection = {
  key: string;
  label: string;
  text: string;
  sourceId: string;
  sourceLabel: string;
};

type CauScheduleEntry = {
  kind: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
  location: string;
  repeat: string | null;
  exclude: string | null;
};

const CAU_DEPARTMENT_TRANSLATIONS: Record<string, string> = {
  "Echtzeitsysteme / Eingebettete Systeme": "Real-Time Systems / Embedded Systems",
  "Algorithmen und Komplexität": "Algorithms and Complexity",
  "Algorithmische Optimale Steuerung - CO2-Aufnahme des Meeres":
    "Algorithmic Optimal Control - Ocean CO2 Uptake",
  "Archäoinformatik - Data Science": "Archaeoinformatics - Data Science",
  "Didaktik der Informatik": "Computer Science Education",
  "Datenbanksysteme und Data Mining": "Database Systems and Data Mining",
  "Intelligente Systeme": "Intelligent Systems",
  "Programmiersprachen und Übersetzerkonstruktion":
    "Programming Languages and Compiler Construction",
  "Verteilte Systeme": "Distributed Systems",
  "Theoretische Informatik": "Theoretical Computer Science",
  "Visual Computing und Artificial Intelligence":
    "Visual Computing and Artificial Intelligence",
  "Zuverlässige Systeme": "Reliable Systems",
  "Institut für Informatik": "Institute of Computer Science",
  "Geschäftszimmer der Informatik": "Computer Science Office",
  "Referat Liegenschaften und Services": "Facilities and Services Office",
};

const CAU_EXCLUDED_COURSE_CODES = new Set([
  "inf-hpc",
]);

export class CAU extends BaseScraper {
  private modulDbCache = new Map<string, Promise<ModulDbModule | null>>();
  forceUpdate = false;

  constructor() {
    super("cau");
  }

  getSemesterParam(): string {
    if (!this.semester) return "2025w";
    const input = this.semester.toLowerCase();
    const yearDigits = input.replace(/\D/g, "");
    let year = 2025;
    if (yearDigits.length >= 4) {
      year = Number(yearDigits.slice(-4));
    } else if (yearDigits.length >= 2) {
      year = 2000 + Number(yearDigits.slice(-2));
    }
    if (input.includes('wi') || input.includes('winter') || input.includes('fa') || input.includes('fall')) return `${year}w`;
    if (input.includes('sp') || input.includes('spring') || input.includes('su') || input.includes('summer')) return `${year}s`;
    return `${year}w`;
  }

  async links(): Promise<string[]> {
    const sem = this.getSemesterParam();
    return [
      `https://univis.uni-kiel.de/form?__s=2&dsc=anew/tlecture&marked=__ALL&anonymous=1&lang=en&ref=tlecture&sem=${sem}&tdir=techn/infora/master&tlecture_all=1`,
    ];
  }

  private extractNavigationToken(html: string): string | null {
    const m = html.match(/(?:\?|&|&amp;)__e=(\d+)/i);
    return m ? m[1] : null;
  }

  private withNavigationToken(url: string, token: string): string {
    const u = new URL(url);
    u.searchParams.set("__e", token);
    return u.toString();
  }

  private extractXmlExportParams(html: string): XmlExportParams {
    const $ = cheerio.load(html);
    const hiddenFieldsPresent = ["__e", "db", "keys", "ref", "sem", "tdir"]
      .every((name) => $(`input[name="${name}"]`).length > 0);

    if (!hiddenFieldsPresent) {
      const href = $("a[href*='dsc=anew/xml']").first().attr("href")?.trim();
      if (href) {
        const url = new URL(this.toAbsoluteUrl(href));
        return {
          token: url.searchParams.get("__e") || "",
          db: url.searchParams.get("db") || "",
          keys: url.searchParams.get("keys") || "",
          ref: url.searchParams.get("ref") || "tlecture",
          sem: url.searchParams.get("sem") || this.getSemesterParam(),
          tdir: url.searchParams.get("tdir") || "techn/infora/master",
        };
      }
    }

    const readRequiredField = (name: string): string => {
      const value = $(`input[name="${name}"]`).first().attr("value")?.trim();
      if (!value) throw new Error(`Missing CAU XML export field: ${name}`);
      return value;
    };

    return {
      token: readRequiredField("__e"),
      db: readRequiredField("db"),
      keys: readRequiredField("keys"),
      ref: readRequiredField("ref"),
      sem: readRequiredField("sem"),
      tdir: readRequiredField("tdir"),
    };
  }

  extractXmlExportParamsForTests(html: string): XmlExportParams {
    return this.extractXmlExportParams(html);
  }

  private buildXmlExportRequest(params: XmlExportParams): { url: string; body: URLSearchParams } {
    const body = new URLSearchParams({
      __s: "1",
      dsc: "anew/unihd",
      donedef: "1",
      setsem_jump: "anew/xml",
      db: params.db,
      keys: params.keys,
      anonymous: "1",
      lang: "en",
      ref: params.ref,
      sem: params.sem,
      tdir: params.tdir,
      __e: params.token,
      level: "3",
      option: "orgname",
      "done-anew/xml:doit": "to XML",
    });

    return {
      url: "https://univis.uni-kiel.de/form",
      body,
    };
  }

  buildXmlExportRequestForTests(params: XmlExportParams): { url: string; body: URLSearchParams } {
    return this.buildXmlExportRequest(params);
  }

  private parseXmlLectures(xml: string): XmlLectureRecord[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const readText = (element: cheerio.Cheerio<AnyNode>, selector: string): string | null => {
      const value = element.children(selector).first().text().trim();
      return value || null;
    };
    const readRefKeys = (element: cheerio.Cheerio<AnyNode>, selector: string, type?: string): string[] => {
      const refs = element.find(selector).toArray()
        .map((node) => {
          const refType = node.attribs?.type?.trim();
          if (type && refType !== type) return null;
          return node.attribs?.key?.trim() || null;
        })
        .filter((value): value is string => Boolean(value));
      return Array.from(new Set(refs));
    };
    const readUrls = (element: cheerio.Cheerio<AnyNode>, selector: string): string[] => {
      return Array.from(new Set(
        element.children(selector).toArray()
          .map((node) => cheerio.load(node, { xmlMode: true }).root().text().trim())
          .filter(Boolean),
      ));
    };

    return $("Lecture").toArray().map((node) => {
      const lecture = $(node);
      const terms = lecture.find("terms > term").toArray().map((termNode) => {
        const term = $(termNode);
        return {
          startdate: readText(term, "startdate"),
          enddate: readText(term, "enddate"),
          starttime: readText(term, "starttime"),
          endtime: readText(term, "endtime"),
          repeat: readText(term, "repeat"),
          exclude: readText(term, "exclude"),
          roomKeys: readRefKeys(term, "room > UnivISRef", "Room"),
        };
      });

      const roomKeys = Array.from(new Set([
        ...readRefKeys(lecture, "room > UnivISRef", "Room"),
        ...terms.flatMap((term) => term.roomKeys),
      ]));

      return {
        key: lecture.attr("key")?.trim() || "",
        id: readText(lecture, "id") || "",
        number: readText(lecture, "number"),
        importParentId: readText(lecture, "import_parent_id"),
        parentLectureKey: lecture.find("parent-lv > UnivISRef[type='Lecture']").first().attr("key")?.trim() || null,
        startdate: readText(lecture, "startdate"),
        enddate: readText(lecture, "enddate"),
        isEnglish: readText(lecture, "englisch")?.toLowerCase() === "ja",
        name: readText(lecture, "name") || "",
        short: readText(lecture, "short") || "",
        titleEn: readText(lecture, "title_en"),
        type: readText(lecture, "type") || "",
        orgname: readText(lecture, "orgname"),
        summary: readText(lecture, "summary"),
        timeDescription: readText(lecture, "time_description"),
        literature: readText(lecture, "literature"),
        organizational: readText(lecture, "organizational"),
        ectsCred: readText(lecture, "ects_cred"),
        sws: readText(lecture, "sws"),
        resourceUrls: Array.from(new Set([
          ...readUrls(lecture, "url"),
          ...readUrls(lecture, "url_description"),
        ])),
        classificationKeys: readRefKeys(lecture, "classification > UnivISRef", "Title"),
        personKeys: readRefKeys(lecture, "doz > UnivISRef", "Person"),
        roomKeys,
        terms,
      };
    });
  }

  parseXmlLecturesForTests(xml: string): XmlLectureRecord[] {
    return this.parseXmlLectures(xml);
  }

  private deriveCategory(classificationKeys: string[], titleMap?: Map<string, string>): string {
    const xmlCategory = classificationKeys
      .map((key) => titleMap?.get(key)?.trim())
      .find(Boolean);
    if (xmlCategory) return xmlCategory;

    const key = classificationKeys[0]?.toLowerCase() || "";
    if (key.includes(".theore")) return "Theoretical Computer Science";
    if (key.includes(".wahlpf")) return "Compulsory elective modules in Computer Science";
    if (key.includes(".master_1")) return "Seminar";
    if (key.includes(".master_2")) return "Advanced Project";
    if (key.includes(".master_3")) return "Involvement in a working group";
    if (key.includes(".frei") || key.includes(".open")) return "Open Elective";
    return "General";
  }

  deriveCategoryForTests(classificationKeys: string[], titleMap?: Map<string, string>): string {
    return this.deriveCategory(classificationKeys, titleMap);
  }

  private isAuxiliaryType(type: string): boolean {
    return ["ue", "ex", "exercise", "tutorial", "tut"].includes(type.trim().toLowerCase());
  }

  isAuxiliaryTypeForTests(type: string): boolean {
    return this.isAuxiliaryType(type);
  }

  private parseDefinitionList(html: string): Map<string, string> {
    const $ = cheerio.load(html);
    const values = new Map<string, string>();

    $("dt").each((_, node) => {
      const label = $(node).text().replace(/\s+/g, " ").trim().toLowerCase();
      const value = $(node).next("dd").text().replace(/\s+/g, " ").trim();
      if (label && value) values.set(label, value);
    });

    return values;
  }

  private parseRoomView(html: string): ResolvedRoom {
    const values = this.parseDefinitionList(html);
    const name = values.get("room") || null;
    const building = values.get("building") || null;
    const address = values.get("address") || null;
    const label = [name, building, address].filter(Boolean).join(", ") || null;
    return { name, short: name, building, address, label };
  }

  parseRoomViewForTests(html: string): ResolvedRoom {
    return this.parseRoomView(html);
  }

  private parsePersonView(html: string): ResolvedPerson {
    const values = this.parseDefinitionList(html);
    return {
      name: values.get("name") || null,
      email: values.get("email") || null,
      office: values.get("office") || null,
    };
  }

  parsePersonViewForTests(html: string): ResolvedPerson {
    return this.parsePersonView(html);
  }

  private buildResolvedReferenceMaps(xml: string): {
    roomMap: Map<string, string>;
    personMap: Map<string, string>;
    titleMap: Map<string, string>;
  } {
    const $ = cheerio.load(xml, { xmlMode: true });
    const roomMap = new Map<string, string>();
    const personMap = new Map<string, string>();
    const titleMap = new Map<string, string>();

    $("Person").each((_, node) => {
      const person = $(node);
      const key = person.attr("key")?.trim();
      if (!key) return;
      const prefix = person.children("title").first().text().trim();
      const firstname = person.children("firstname").first().text().trim();
      const lastname = person.children("lastname").first().text().trim();
      const suffix = person.children("atitle").first().text().trim();
      const fullName = [prefix, [firstname, lastname].filter(Boolean).join(" ").trim(), suffix]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (fullName) personMap.set(key, fullName);
    });

    $("Room").each((_, node) => {
      const room = $(node);
      const key = room.attr("key")?.trim();
      if (!key) return;
      const short = room.children("short").first().text().trim();
      const name = room.children("name").first().text().trim();
      const address = room.children("address").first().text().trim();
      const label = [short || name, address].filter(Boolean).join(", ").trim();
      if (label) roomMap.set(key, label);
    });

    $("Title").each((_, node) => {
      const title = $(node);
      const key = title.attr("key")?.trim();
      if (!key) return;
      const label = title.children("title_en").first().text().trim() || title.children("title").first().text().trim();
      if (label) titleMap.set(key, label);
    });

    return { roomMap, personMap, titleMap };
  }

  private normalizeLectureName(name: string, short: string): string {
    return name
      .replace(new RegExp(`^${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i"), "")
      .trim();
  }

  private normalizeDepartmentName(value: string | null | undefined): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    return CAU_DEPARTMENT_TRANSLATIONS[trimmed] || trimmed;
  }

  private normalizeCourseType(type: string): string {
    const normalized = type.trim().toUpperCase();
    if (normalized === "V") return "Lecture";
    if (normalized === "UE") return "Exercise";
    if (normalized === "S") return "Seminar";
    if (normalized === "OS") return "Advanced Seminar";
    if (normalized === "SPR") return "Language Course";
    return normalized || "Unknown";
  }

  private isLayoutOnlyLecture(lecture: XmlLectureRecord): boolean {
    return /\(\s*layout\s*\)/i.test(lecture.name) || /\(\s*layout\s*\)/i.test(lecture.titleEn || "");
  }

  private shouldPersistPrimaryLecture(lecture: XmlLectureRecord): boolean {
    if (!lecture.isEnglish) return false;
    if (this.isAuxiliaryType(lecture.type)) return false;
    if (!lecture.short.trim()) return false;
    if (this.isLayoutOnlyLecture(lecture)) return false;
    return true;
  }

  private shouldKeepAfterLanguageMerge(course: Course): boolean {
    if (this.isExcludedCourseCode(course.courseCode)) {
      return false;
    }

    const details = course.details && typeof course.details === "object"
      ? course.details as Record<string, unknown>
      : {};
    const modulDbTeachingLanguage =
      typeof details.modulDbTeachingLanguage === "string"
        ? details.modulDbTeachingLanguage.trim().toLowerCase()
        : "";

    if (modulDbTeachingLanguage.includes("deutsch") || modulDbTeachingLanguage.includes("german")) {
      return false;
    }

    return true;
  }

  shouldKeepAfterLanguageMergeForTests(course: Course): boolean {
    return this.shouldKeepAfterLanguageMerge(course);
  }

  private isExcludedCourseCode(courseCode: string | null | undefined): boolean {
    const normalized = (courseCode || "").trim().toLowerCase();
    return CAU_EXCLUDED_COURSE_CODES.has(normalized);
  }

  private normalizeDescription(summary: string | null, timeDescription: string | null): string | undefined {
    const parts = [summary, timeDescription]
      .map((value) => value?.replace(/\s+/g, " ").trim() || "")
      .filter(Boolean);
    return parts.length > 0 ? parts.join("\n\n") : undefined;
  }

  private repeatToDayOfWeek(repeat: string | null): number | null {
    const match = repeat?.match(/(?:^|\s)(\d)(?:\s|$)/);
    if (!match) return null;
    const code = Number(match[1]);
    if (code >= 1 && code <= 6) return code;
    if (code === 7) return 0;
    return null;
  }

  private formatDayOfWeek(dayOfWeek: number): string {
    const labels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return labels[dayOfWeek] || "Unknown";
  }

  private resolveLectureLocation(
    roomKeys: string[],
    resolvedRefs?: { roomMap: Map<string, string> },
  ): string {
    const label = roomKeys
      .map((key) => resolvedRefs?.roomMap.get(key) || key)
      .find((value) => typeof value === "string" && value.trim().length > 0);
    return label || "TBD";
  }

  private buildScheduleEntries(
    lecture: XmlLectureRecord,
    resolvedRefs?: { roomMap: Map<string, string> },
    recurringEndDateFallback?: string | null,
  ): CauScheduleEntry[] {
    const kind = this.normalizeCourseType(lecture.type);
    const defaultLocation = this.resolveLectureLocation(lecture.roomKeys, resolvedRefs);

    return lecture.terms.flatMap((term) => {
      const dayOfWeek = this.repeatToDayOfWeek(term.repeat);
      const startTime = term.starttime?.trim() || "";
      const endTime = term.endtime?.trim() || "";
      const startDate = term.startdate || lecture.startdate || "";
      const endDate =
        term.enddate ||
        lecture.enddate ||
        (term.repeat ? recurringEndDateFallback || "" : "") ||
        startDate;
      if (dayOfWeek === null || !startTime || !endTime || !startDate || !endDate) {
        return [];
      }

      const location = term.roomKeys.length > 0
        ? this.resolveLectureLocation(term.roomKeys, resolvedRefs)
        : defaultLocation;

      return [{
        kind,
        dayOfWeek,
        startTime,
        endTime,
        startDate,
        endDate,
        location,
        repeat: term.repeat,
        exclude: term.exclude,
      }];
    });
  }

  private buildScheduleLines(entries: CauScheduleEntry[]): Record<string, string[]> {
    const schedule = new Map<string, string[]>();

    for (const entry of entries) {
      const current = schedule.get(entry.kind) || [];
      const line = `${this.formatDayOfWeek(entry.dayOfWeek)} ${entry.startTime}-${entry.endTime} in ${entry.location}`;
      if (!current.includes(line)) current.push(line);
      schedule.set(entry.kind, current);
    }

    return Object.fromEntries(schedule.entries());
  }

  private decodeModulDbFragment(raw: string | null): { text: string | null; urls: string[] } {
    const source = raw?.trim();
    if (!source) return { text: null, urls: [] };
    const $ = cheerio.load(source);
    const hrefs = $("a[href]")
      .map((_, node) => $(node).attr("href")?.trim() || "")
      .get()
      .filter(Boolean);
    const text = $.root().text().replace(/\s+/g, " ").trim() || null;
    const textUrls = text?.match(/https?:\/\/[^\s<>"')]+/g) || [];
    return {
      text,
      urls: Array.from(new Set([...hrefs, ...textUrls])),
    };
  }

  private parseModulDbUnits(raw: string | null): ModulDbUnitEntry[] {
    if (!raw) return [];
    const normalized = raw.replace(/\s+/g, " ").trim();
    const entries = Array.from(normalized.matchAll(/(\d+)\s*([A-Za-zÜü]+)/g))
      .map((match) => {
        const sws = Number(match[1]) || 0;
        const token = match[2].toUpperCase().replace("Ü", "UE");
        if (sws <= 0) return null;
        if (token === "V") return { type: "V", sws };
        if (token === "UE") return { type: "UE", sws };
        if (token === "S") return { type: "S", sws };
        if (token === "P") return { type: "P", sws };
        if (token === "PUE") return { type: "PUE", sws };
        return { type: token, sws };
      })
      .filter((value): value is ModulDbUnitEntry => Boolean(value));

    return entries;
  }

  private buildModulDbPageUrl(moduleCode: string): string {
    return `https://moduldb.informatik.uni-kiel.de/show.cgi?mod=${encodeURIComponent(moduleCode)}`;
  }

  private buildModulDbXmlUrl(moduleCode: string): string {
    return `https://moduldb.informatik.uni-kiel.de/show.cgi?xml=${encodeURIComponent(moduleCode)}`;
  }

  private parseModulDbXml(xml: string): ModulDbModule | null {
    const $ = cheerio.load(xml, { xmlMode: true });
    const root = $("modul").first();
    if (root.length === 0) return null;

    const moduleCode = root.children("modulcode").first().text().trim();
    if (!moduleCode) return null;

    const summary = this.decodeModulDbFragment(root.children("kurzfassung").first().text());
    const learningGoals = this.decodeModulDbFragment(root.children("lernziele").first().text());
    const contents = this.decodeModulDbFragment(root.children("lehrinhalte").first().text());
    const prerequisites = this.decodeModulDbFragment(root.children("voraussetzungen").first().text());
    const assessment = this.decodeModulDbFragment(root.children("pruefungsleistung").first().text());
    const teachingMethods = this.decodeModulDbFragment(root.children("lehrmethoden").first().text());
    const applicability = this.decodeModulDbFragment(root.children("verwendbarkeit").first().text());
    const literature = this.decodeModulDbFragment(root.children("literatur").first().text());
    const references = this.decodeModulDbFragment(root.children("verweise").first().text());
    const notes = this.decodeModulDbFragment(root.children("kommentar").first().text());
    const unitsBreakdown = this.parseModulDbUnits(root.find("durchfuehrung > praesenz").first().text().trim() || null);
    const semesters = root.find("durchfuehrung > veranstaltung > semester").map((_, node) => {
      const raw = $(node).text().trim();
      return this.normalizeModulDbSemester(raw);
    }).get().filter((value): value is { term: string; year: number } => Boolean(value));

    return {
      moduleCode,
      title: root.find("modulname > englisch").first().text().trim() || root.find("modulname > deutsch").first().text().trim() || null,
      responsible: root.children("verantwortlich").first().text().trim() || null,
      ects: Number(root.children("ectspunkte").first().text().trim()) || null,
      workloadText: root.children("workload").first().text().replace(/\s+/g, " ").trim() || null,
      teachingLanguage: root.children("lehrsprache").first().text().replace(/\s+/g, " ").trim() || null,
      description: summary.text,
      learningGoals: learningGoals.text,
      contents: contents.text,
      prerequisites: prerequisites.text,
      assessment: assessment.text,
      teachingMethods: teachingMethods.text,
      applicability: applicability.text,
      notes: notes.text,
      literature: literature.text,
      categories: root.find("kategorien > kategorie").map((_, node) => $(node).text().replace(/\s+/g, " ").trim()).get().filter(Boolean),
      resourceUrls: Array.from(new Set([
        this.buildModulDbPageUrl(moduleCode),
        ...summary.urls,
        ...learningGoals.urls,
        ...contents.urls,
        ...literature.urls,
        ...references.urls,
        ...assessment.urls,
        ...teachingMethods.urls,
        ...applicability.urls,
        ...notes.urls,
      ])),
      unitsBreakdown,
      semesters,
      pageUrl: this.buildModulDbPageUrl(moduleCode),
    };
  }

  parseModulDbXmlForTests(xml: string): ModulDbModule | null {
    return this.parseModulDbXml(xml);
  }

  private inferRecurringLectureEndDate(xml: string): string | null {
    const $ = cheerio.load(xml, { xmlMode: true });
    const counts = new Map<string, number>();

    $("Lecture").each((_, node) => {
      const lecture = $(node);
      const hasRecurringTerm = lecture.find("terms > term > repeat").toArray().some((termNode) => {
        const repeat = $(termNode).text().trim();
        return repeat.length > 0;
      });
      if (!hasRecurringTerm) return;

      const endDate = lecture.children("enddate").first().text().trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return;

      counts.set(endDate, (counts.get(endDate) || 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return left[0].localeCompare(right[0]);
      })[0]?.[0] || null;
  }

  private toSemesterInfo(): { term: string; year: number } {
    const semParam = this.getSemesterParam();
    return {
      year: parseInt(semParam.substring(0, 4)),
      term: semParam.endsWith("w") ? "Winter" : "Spring",
    };
  }

  private buildLectureResourceUrl(lectureKey: string): string | null {
    const trimmed = lectureKey.trim();
    if (!trimmed.startsWith("Lecture.")) return null;
    const lvs = trimmed.replace(/^Lecture\./, "").replace(/\./g, "/");
    const sem = this.getSemesterParam();
    return `https://univis.uni-kiel.de/form?dsc=anew/lecture_view&lvs=${lvs}&anonymous=1&lang=en&sem=${sem}&tdir=techn/infora/master`;
  }

  private courseFromLectureRecord(
    lecture: XmlLectureRecord,
    resolvedRefs?: { roomMap: Map<string, string>; personMap: Map<string, string>; titleMap: Map<string, string> },
    recurringEndDateFallback?: string | null,
  ): Course {
    const semesterInfo = this.toSemesterInfo();
    const instructors = lecture.personKeys.map((key) => resolvedRefs?.personMap.get(key) || key);
    const ownWorkload = lecture.sws ? Number(lecture.sws) || 0 : 0;
    const resourceUrls = Array.from(
      new Set([
        ...(lecture.resourceUrls || []),
        this.buildLectureResourceUrl(lecture.key),
      ].filter((value): value is string => Boolean(value))),
    );
    const scheduleEntries = this.buildScheduleEntries(lecture, resolvedRefs, recurringEndDateFallback);
    return {
      university: "CAU Kiel",
      courseCode: lecture.short,
      title: this.normalizeLectureName(lecture.name, lecture.short),
      units: lecture.sws ? `${lecture.type} ${lecture.sws}` : undefined,
      credit: lecture.ectsCred ? Number(lecture.ectsCred) : undefined,
      description: this.normalizeDescription(lecture.summary, lecture.timeDescription),
      department: this.normalizeDepartmentName(lecture.orgname),
      prerequisites: lecture.organizational || undefined,
      instructors,
      resources: resourceUrls.length > 0 ? resourceUrls : undefined,
      level: "graduate",
      workload: ownWorkload || undefined,
      category: this.deriveCategory(lecture.classificationKeys, resolvedRefs?.titleMap),
      semesters: [semesterInfo],
      details: {
        type: lecture.type,
        normalizedType: this.normalizeCourseType(lecture.type),
        internalId: lecture.id,
        internalNumber: lecture.number,
        classificationKeys: lecture.classificationKeys,
        literature: lecture.literature,
        organizational: lecture.organizational,
        dataSources: [
          {
            id: "univis",
            label: "UnivIS",
            coverage: ["catalog", "schedule", "instructors"],
          },
        ],
        unitsBreakdown: lecture.sws ? [{ type: lecture.type, sws: ownWorkload }] : [],
        ...(scheduleEntries.length > 0 ? {
          schedule: this.buildScheduleLines(scheduleEntries),
          scheduleEntries,
        } : {}),
      },
    };
  }

  private formatUnitsBreakdown(entries: Array<{ type: string; sws: number }>): string | undefined {
    if (entries.length === 0) return undefined;
    return entries
      .filter((entry) => entry.sws > 0)
      .map((entry) => `${entry.type} ${entry.sws}`)
      .join(" ");
  }

  private normalizeModulDbSemester(raw: string): { term: string; year: number } | null {
    const value = raw.trim();
    if (!value) return null;
    const springMatch = value.match(/^SS(\d{2})$/i);
    if (springMatch) {
      return { term: "Spring", year: 2000 + Number(springMatch[1]) };
    }
    const winterMatch = value.match(/^WS(\d{2})\/\d{2}$/i);
    if (winterMatch) {
      return { term: "Winter", year: 2000 + Number(winterMatch[1]) };
    }
    return null;
  }

  private mergeSemesterHistory(
    current: Array<{ term: string; year: number }> | undefined,
    incoming: Array<{ term: string; year: number }>,
  ): Array<{ term: string; year: number }> {
    const merged = new Map<string, { term: string; year: number }>();
    const preferred = current?.[0];
    for (const semester of [...(current || []), ...incoming]) {
      merged.set(`${semester.term}-${semester.year}`, semester);
    }
    const ordered = Array.from(merged.values()).sort((left, right) => {
      if (left.year !== right.year) return right.year - left.year;
      if (left.term === right.term) return 0;
      return left.term === "Winter" ? -1 : 1;
    });
    if (!preferred) return ordered;

    const preferredKey = `${preferred.term}-${preferred.year}`;
    const preferredSemester = merged.get(preferredKey);
    if (!preferredSemester) return ordered;

    return [
      preferredSemester,
      ...ordered.filter(
        (semester) => `${semester.term}-${semester.year}` !== preferredKey,
      ),
    ];
  }

  private buildDescriptionSections(modul: ModulDbModule): DescriptionSection[] {
    const candidates: Array<{ key: string; label: string; text: string | null }> = [
      { key: "summary", label: "Summary", text: modul.description },
      { key: "learning_goals", label: "Learning goals", text: modul.learningGoals },
      { key: "contents", label: "Contents", text: modul.contents },
      { key: "assessment", label: "Assessment", text: modul.assessment },
      { key: "teaching_methods", label: "Teaching methods", text: modul.teachingMethods },
      { key: "applicability", label: "Applicability", text: modul.applicability },
      { key: "notes", label: "Notes", text: modul.notes },
    ];

    return candidates
      .filter((section) => section.text && section.text.trim().length > 0)
      .map((section) => ({
        key: section.key,
        label: section.label,
        text: section.text!.trim(),
        sourceId: "moduldb",
        sourceLabel: "ModulDB",
      }));
  }

  private appendDataSource(details: Record<string, unknown>, source: { id: string; label: string; coverage: string[] }): void {
    const current = Array.isArray(details.dataSources) ? details.dataSources as Array<Record<string, unknown>> : [];
    const withoutExisting = current.filter((entry) => entry?.id !== source.id);
    details.dataSources = [...withoutExisting, source];
  }

  private mergeModulDbIntoCourse(course: Course, modul: ModulDbModule | null): Course {
    if (!modul) return course;

    const details = { ...((course.details as Record<string, unknown> | undefined) || {}) };
    const next: Course = {
      ...course,
      credit: course.credit ?? modul.ects ?? undefined,
      description: course.description || undefined,
      prerequisites: modul.prerequisites || course.prerequisites,
      instructors: course.instructors && course.instructors.length > 0
        ? course.instructors
        : (modul.responsible ? [modul.responsible] : undefined),
      resources: Array.from(new Set([...(course.resources || []), ...modul.resourceUrls])),
      semesters: this.mergeSemesterHistory(course.semesters, modul.semesters),
    };

    if (modul.unitsBreakdown.length > 0) {
      details.unitsBreakdown = modul.unitsBreakdown;
      next.units = this.formatUnitsBreakdown(modul.unitsBreakdown) || next.units;
      const totalWorkload = modul.unitsBreakdown.reduce((sum, entry) => sum + entry.sws, 0);
      next.workload = totalWorkload || next.workload;
    }

    if (!next.credit && modul.ects) next.credit = modul.ects;

    details.modulDbWorkloadText = modul.workloadText;
    details.modulDbTeachingLanguage = modul.teachingLanguage;
    details.descriptionSections = this.buildDescriptionSections(modul);
    details.modulDbLearningGoals = modul.learningGoals;
    details.modulDbContents = modul.contents;
    details.modulDbAssessment = modul.assessment;
    details.modulDbTeachingMethods = modul.teachingMethods;
    details.modulDbApplicability = modul.applicability;
    details.modulDbNotes = modul.notes;
    details.modulDbLiterature = modul.literature;
    this.appendDataSource(details, {
      id: "moduldb",
      label: "ModulDB",
      coverage: ["module", "prerequisites", "workload"],
    });
    next.details = details;
    return next;
  }

  enrichCourseWithModulDbForTests(course: Course, xml: string): Course {
    return this.mergeModulDbIntoCourse(course, this.parseModulDbXml(xml));
  }

  private isValidUnivisXmlPayload(xml: string): boolean {
    if (!xml || !xml.includes("<Lecture")) return false;
    try {
      this.parseXmlLectures(xml);
      return true;
    } catch {
      return false;
    }
  }

  private async resolveSemesterXml(link: string): Promise<{ page: string; xml: string }> {
    const cacheKey = cauBlobCache.semesterXmlKey(this.getSemesterParam());

    if (!this.forceUpdate) {
      const cachedXml = await cauBlobCache.readCachedText(cacheKey);
      if (cachedXml) {
        if (this.isValidUnivisXmlPayload(cachedXml)) {
          return { page: "", xml: cachedXml };
        }
        console.warn(`[${this.name}] Cached semester XML was invalid. Refetching fresh export.`);
      }
    }

    const page = await this.fetchPage(link);
    if (!page) return { page: "", xml: "" };

    try {
      const params = this.extractXmlExportParams(page);
      const xml = await this.fetchXmlExport(params);
      if (this.isValidUnivisXmlPayload(xml)) {
        await cauBlobCache.writeCachedText(cacheKey, xml, {
          contentType: "application/xml; charset=utf-8",
        });
        return { page, xml };
      }
    } catch {
      // Fall back to the legacy HTML parser until the XML path fully covers every case.
    }

    return { page, xml: "" };
  }

  private async fetchModulDbModule(courseCode: string): Promise<ModulDbModule | null> {
    const normalizedCode = courseCode.trim();
    if (!normalizedCode) return null;
    if (this.modulDbCache.has(normalizedCode)) {
      return this.modulDbCache.get(normalizedCode)!;
    }

    const request = (async () => {
      const cacheKey = cauBlobCache.modulDbXmlKey(normalizedCode);
      if (!this.forceUpdate) {
        const cachedXml = await cauBlobCache.readCachedText(cacheKey);
        if (cachedXml) {
          const cachedModule = this.parseModulDbXml(cachedXml);
          if (cachedModule) return cachedModule;
          console.warn(`[${this.name}] Cached ModulDB XML for ${normalizedCode} was invalid. Refetching fresh payload.`);
        }
      }

      try {
        const response = await fetch(this.buildModulDbXmlUrl(normalizedCode));
        if (!response.ok) return null;
        const xml = await response.text();
        const parsed = this.parseModulDbXml(xml);
        if (!parsed) return null;
        await cauBlobCache.writeCachedText(cacheKey, xml, {
          contentType: "application/xml; charset=utf-8",
        });
        return parsed;
      } catch {
        return null;
      }
    })();

    this.modulDbCache.set(normalizedCode, request);
    return request;
  }

  private async enrichCoursesWithModulDb(courses: Course[]): Promise<Course[]> {
    return Promise.all(
      courses.map(async (course) => {
        if (!course.courseCode?.trim()) return course;
        const modul = await this.fetchModulDbModule(course.courseCode);
        return this.mergeModulDbIntoCourse(course, modul);
      }),
    );
  }

  private mergeLectureChildren(
    records: XmlLectureRecord[],
    resolvedRefs?: { roomMap: Map<string, string>; personMap: Map<string, string>; titleMap: Map<string, string> },
    recurringEndDateFallback?: string | null,
  ): Course[] {
    const primaryRecords = records.filter((lecture) => this.shouldPersistPrimaryLecture(lecture));
    const primaryCourses = new Map(primaryRecords.map((lecture) => [
      lecture.key,
      this.courseFromLectureRecord(lecture, resolvedRefs, recurringEndDateFallback),
    ]));

    for (const record of records) {
      if (!this.isAuxiliaryType(record.type)) continue;
      const parentKey = record.parentLectureKey;
      if (!parentKey) continue;
      const parentCourse = primaryCourses.get(parentKey);
      if (!parentCourse) continue;
      const details = (parentCourse.details || {}) as Record<string, unknown>;
      const breakdown = Array.isArray(details.unitsBreakdown)
        ? [...details.unitsBreakdown as Array<{ type: string; sws: number }>]
        : [];
      const sws = record.sws ? Number(record.sws) || 0 : 0;
      if (sws > 0) breakdown.push({ type: record.type, sws });
      details.unitsBreakdown = breakdown;
      const existingScheduleEntries = Array.isArray(details.scheduleEntries)
        ? [...details.scheduleEntries as CauScheduleEntry[]]
        : [];
      const nextScheduleEntries = this.buildScheduleEntries(record, resolvedRefs, recurringEndDateFallback);
      const mergedScheduleEntries = Array.from(
        new Map(
          [...existingScheduleEntries, ...nextScheduleEntries].map((entry) => [
            `${entry.kind}|${entry.dayOfWeek}|${entry.startTime}|${entry.endTime}|${entry.startDate}|${entry.endDate}|${entry.location}`,
            entry,
          ]),
        ).values(),
      );
      if (mergedScheduleEntries.length > 0) {
        details.scheduleEntries = mergedScheduleEntries;
        details.schedule = this.buildScheduleLines(mergedScheduleEntries);
      }
      parentCourse.details = details;
      parentCourse.units = this.formatUnitsBreakdown(breakdown) || parentCourse.units;
      const totalWorkload = breakdown.reduce((sum, entry) => sum + entry.sws, 0);
      parentCourse.workload = totalWorkload || parentCourse.workload;
    }

    return Array.from(primaryCourses.values());
  }

  async mergeLectureChildrenForTests(records: XmlLectureRecord[]): Promise<Course[]> {
    return this.mergeLectureChildren(records);
  }

  private async normalizeXmlCourses(xml: string, options?: { resolveRefs?: boolean }): Promise<Course[]> {
    const records = this.parseXmlLectures(xml);
    const recurringEndDateFallback = this.inferRecurringLectureEndDate(xml);
    const resolvedRefs = options?.resolveRefs === false
      ? { roomMap: new Map<string, string>(), personMap: new Map<string, string>(), titleMap: new Map<string, string>() }
      : this.buildResolvedReferenceMaps(xml);
    return this.mergeLectureChildren(records, resolvedRefs, recurringEndDateFallback);
  }

  async parseXmlCoursesForTests(xml: string): Promise<Course[]> {
    return this.normalizeXmlCourses(xml);
  }

  private sanitizeCourseUrl(rawUrl: string): string {
    const absolute = rawUrl.startsWith("http")
      ? rawUrl
      : `https://univis.uni-kiel.de/${rawUrl.replace(/&amp;/g, "&")}`;
    const u = new URL(absolute);
    // Drop volatile navigation/session params that cause "outdated key" errors later.
    u.searchParams.delete("__e");
    u.searchParams.delete("__s");
    return u.toString();
  }

  private toAbsoluteUrl(rawUrl: string): string {
    if (!rawUrl) return "";
    return rawUrl.startsWith("http")
      ? rawUrl
      : `https://univis.uni-kiel.de/${rawUrl.replace(/&amp;/g, "&")}`;
  }

  private collectRelatedLinksFromContainer(container: cheerio.Cheerio<any>): string[] { // eslint-disable-line @typescript-eslint/no-explicit-any
    const ignoredPatterns = [
      /dsc=anew\/lecture_view/i,
      /dsc=anew\/tel_view/i,
      /dsc=anew\/room_view/i,
      /dsc=anew\/lecture\b/i,
      /__e=\d+/i,
    ];

    const links = container
      .find("a[href]")
      .map((_, a) => (a.attribs?.href || "").trim())
      .get()
      .map((href) => this.toAbsoluteUrl(href))
      .filter((href) => /^https?:\/\//i.test(href))
      .filter((href) => !ignoredPatterns.some((pattern) => pattern.test(href)))
      .filter((href) => !/^mailto:/i.test(href))
      .filter((href) => !/^javascript:/i.test(href));

    return Array.from(new Set(links));
  }

  private extractDepartmentFromDetailHtml(html: string): string | null {
    if (!html) return null;
    const $ = cheerio.load(html);
    let department: string | null = null;
    const sanitizeDepartment = (value: string): string => {
      return value
        .replace(/\s+/g, " ")
        .replace(/\bUnivIS is a product of Config eG\b.*$/i, "")
        .replace(/\bOutdated referring page\b.*$/i, "")
        .trim();
    };

    $("dt").each((_, dt) => {
      if (department) return;
      const label = $(dt).text().trim().toLowerCase();
      const inlineAnchorText = sanitizeDepartment($(dt).find("a").first().text().trim());
      const dtText = sanitizeDepartment(
        $(dt)
          .clone()
          .children("a")
          .remove()
          .end()
          .text()
          .replace(/^[^:]*:\s*/i, "")
          .trim(),
      );
      const ddText = sanitizeDepartment($(dt).next("dd").text().trim());
      const value = inlineAnchorText || dtText || ddText;
      const isDepartmentLabel =
        label.includes("department") ||
        label.includes("institut") ||
        label.includes("fach") ||
        label.includes("chair") ||
        label.includes("arbeitsgruppe") ||
        label.includes("institution") ||
        label.includes("einrichtung");
      if (isDepartmentLabel && value) department = value;
    });

    if (department) return department;

    const bodyText = $("body").text().replace(/\s+/g, " ");
    const directMatch = bodyText.match(/(?:department|institut|chair)\s*:\s*([^|,;]+)/i);
    const cleaned = directMatch?.[1] ? sanitizeDepartment(directMatch[1]) : "";
    return cleaned || null;
  }

  async fetchPage(url: string, retries = 3): Promise<string> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        let response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let buffer = await response.arrayBuffer();
        let html = new TextDecoder("windows-1252").decode(buffer);

        // UnivIS rejects stale/missing navigation tokens with error pages.
        if (
          html.includes("Outdated referring page") ||
          html.includes("<title>Browser Error</title>")
        ) {
          const token = this.extractNavigationToken(html);
          if (token) {
            response = await fetch(this.withNavigationToken(url, token));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            buffer = await response.arrayBuffer();
            html = new TextDecoder("windows-1252").decode(buffer);
          }
        }

        return html;
      } catch (error) { // eslint-disable-line @typescript-eslint/no-unused-vars
        if (attempt === retries) return "";
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return "";
  }

  private async fetchXmlExport(params: XmlExportParams): Promise<string> {
    const request = this.buildXmlExportRequest(params);
    const response = await fetch(request.url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/xml,text/xml,text/html;q=0.9,*/*;q=0.8",
      },
      body: request.body.toString(),
    });
    if (!response.ok) return "";
    const buffer = await response.arrayBuffer();
    return new TextDecoder("windows-1252").decode(buffer);
  }

  async parser(html: string, existingCodes: Set<string> = new Set()): Promise<Course[]> {
    const $ = cheerio.load(html);
    const courses: Course[] = [];
    const semParam = this.getSemesterParam();
    const year = parseInt(semParam.substring(0, 4));
    const term = semParam.endsWith('w') ? "Winter" : "Spring";
    const headerCategoryMap: Record<string, string> = {
      "theoretical computer science": "Theoretical Computer Science",
      "compulsory elective modules in computer science": "Compulsory elective modules in Computer Science",
      seminar: "Seminar",
      "advanced project": "Advanced Project",
      "involvement in a working group": "Involvement in a working group",
      "open elective": "Open Elective",
    };

    const normalizeHeader = (value: string) =>
      value
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[–—]/g, "-")
        .trim();

    let currentHeaderCategory: string | null = null;

    $("tr").each((_, tr) => {
      const trText = normalizeHeader($(tr).text());
      const headerKey = Object.keys(headerCategoryMap).find((k) => trText === k || trText.startsWith(`${k} `));
      if (headerKey) {
        currentHeaderCategory = headerCategoryMap[headerKey];
      }

      if ($(tr).find("a[href*='key='], a[href*='lecture_view']").length === 0) return;
      const td = $(tr).find("td[width='100%']").first().length > 0
        ? $(tr).find("td[width='100%']").first()
        : $(tr).find("td").first();
      const titleA = td.find("a[href*='key='], a[href*='lecture_view']").first();
      if (titleA.length > 0) {
        const fullText = td.text().replace(/\s+/g, " ").trim();
        const bracketMatch = fullText.match(/\[([a-zA-ZÜÖÄüöä0-9._\s-]+)\]/);
        const startMatch = fullText.match(/^([a-zA-Z0-9._-]+):/);
        const internalIdMatch = fullText.match(/\((\d{6})\)/);

        if (internalIdMatch) {
          const internalId = internalIdMatch[1];
          let courseCode = bracketMatch ? bracketMatch[1].trim() : (startMatch ? startMatch[1] : internalId);
          // Strip Ü/Ö prefix from exercise codes (e.g. "ÜinfCN-01a" → "infCN-01a", "Ü infFGA-01a" → "infFGA-01a")
          courseCode = courseCode.replace(/^[ÜÖüö]\s*/i, "");
          if (['exercise', 'übung', 'praktikum', 'practical', 'projekt', 'project', 'tutorium', 'tutorial', 'workshop'].includes(courseCode.toLowerCase())) {
              courseCode = internalId;
          }

          let title = titleA.text().trim();
          title = title.replace(/^[a-zA-Z0-9._-]+[:\s]+/, "").replace(/^[-–—]\s*/, "").trim();
          const isLayoutOnlyEntry = /\(\s*layout\s*\)/i.test(title);
          if (isLayoutOnlyEntry) return;
          if (this.isExcludedCourseCode(courseCode)) return;

          if (existingCodes.has(courseCode)) {
            courses.push({
              university: "CAU Kiel", courseCode, title, semesters: [{ term, year }],
              details: { is_partially_scraped: true, internalId } as any // eslint-disable-line @typescript-eslint/no-explicit-any
            });
            return;
          }

          let type = "Lecture";
          let category = currentHeaderCategory || "General";
          const titleLower = title.toLowerCase();

          if (!currentHeaderCategory) {
            if (titleLower.includes("advanced project") || titleLower.includes("oberprojekt") || titleLower.includes("advanced computer science project") || titleLower.startsWith("master project")) category = "Advanced Project";
            else if (titleLower.includes("seminar") && !titleLower.includes("supervision")) category = "Seminar";
            else if (titleLower.includes("colloquium") || titleLower.includes("kolloquium") || titleLower.includes("study group")) category = "Colloquia and study groups";
            else if (titleLower.includes("theoretical") || titleLower.includes("theoretische")) category = "Theoretical Computer Science";
            else if (titleLower.includes("involvement") || titleLower.includes("mitarbeit")) category = "Involvement in a working group";
            else if (titleLower.includes("thesis supervision") || titleLower.includes("begleitseminar zur masterarbeit")) category = "Master Thesis Supervision Seminar";
            else if (titleLower.includes("elective") || titleLower.includes("wahlpflicht")) category = "Compulsory elective modules in Computer Science";
            else if (titleLower.includes("open elective") || titleLower.includes("freie wahl")) category = "Open Elective";
            else category = "Standard Course";
          }

          if (courseCode.startsWith("E")) type = "Exercise";
          else if (courseCode.startsWith("P") || courseCode.startsWith("PE")) type = "Practical";

          const course: Course = {
            university: "CAU Kiel", courseCode, title,
            semesters: [{ term, year }], level: "graduate",
            details: { internalId, schedule: {}, category, type, rawUnits: 0 } as any // eslint-disable-line @typescript-eslint/no-explicit-any
          };

          const rowRelatedLinks = this.collectRelatedLinksFromContainer(td);
          if (rowRelatedLinks.length > 0) {
            (course.details as Record<string, unknown>).resources = rowRelatedLinks;
          }

          td.find("dl dt").each((_, dt) => {
            const label = $(dt).text().trim().toLowerCase();
            const dd = $(dt).next("dd");
            const value = dd.text().trim();
            const isDepartmentLabel =
              label.includes("department") ||
              label.includes("institut") ||
              label.includes("fach") ||
              label.includes("chair") ||
              label.includes("arbeitsgruppe") ||
              label.includes("institution");
            if (label.includes("dozent") || label.includes("lecturer")) {
              (course.details as any).instructors = value.split(",").map(i => i.trim()).filter(i => i && i !== "N.N." && i !== "N. N."); // eslint-disable-line @typescript-eslint/no-explicit-any
            } else if (label.includes("angaben") || label.includes("details")) {
              const typeMatch = value.match(/^(Vorlesung|Übung|Seminar|Praktikum|Kolloquium|Projekt|Lecture|Exercise[^,]*|Practical[^,]*|Colloquium|Project)/i);
              if (typeMatch) {
                  const t = typeMatch[1].toLowerCase();
                  if (t === 'vorlesung' || t === 'lecture') type = "Lecture";
                  else if (t === 'übung' || t.startsWith('exercise')) type = "Exercise";
                  else if (t === 'praktikum' || t.startsWith('practical')) type = "Practical";
                  else if (t === 'seminar') type = "Seminar";
                  else if (t === 'projekt' || t === 'project') type = "Project";
                  else if (t === 'kolloquium' || t === 'colloquium') type = "Colloquium";
                  (course.details as any).type = type; // eslint-disable-line @typescript-eslint/no-explicit-any
              }
              const ectsMatch = value.match(/(?:ECTS|Credits):\s*(\d+)/i);
              if (ectsMatch) course.credit = parseInt(ectsMatch[1]);
              const unitsMatch = value.match(/(\d+)\s*(?:cred\.h|SWS)/i);
              if (unitsMatch) {
                  const u = parseInt(unitsMatch[1]);
                  course.units = u.toString();
                  (course.details as any).rawUnits = u; // eslint-disable-line @typescript-eslint/no-explicit-any
              }
              if (value.toLowerCase().includes("englisch") || value.toLowerCase().includes("english")) (course.details as any).isEnglish = true; // eslint-disable-line @typescript-eslint/no-explicit-any
            } else if (label.includes("voraussetzungen") || label.includes("prerequisites")) {
              course.corequisites = value;
              (course.details as any).prerequisites = value; // eslint-disable-line @typescript-eslint/no-explicit-any
            } else if (label.includes("inhalt") || label.includes("contents")) {
              course.description = value;
              (course.details as any).contents = value; // eslint-disable-line @typescript-eslint/no-explicit-any
              const contentsRelatedLinks = this.collectRelatedLinksFromContainer(dd);
              if (contentsRelatedLinks.length > 0) {
                const current =
                  Array.isArray((course.details as Record<string, unknown>).resources)
                    ? ((course.details as Record<string, unknown>).resources as string[])
                    : [];
                (course.details as Record<string, unknown>).resources = Array.from(new Set([...current, ...contentsRelatedLinks]));
              }
            } else if (isDepartmentLabel) {
              course.department = value || course.department;
              (course.details as any).department = value || null; // eslint-disable-line @typescript-eslint/no-explicit-any
            } else if (label.includes("termine") || label.includes("dates")) {
              if (value) {
                  const cType = (course.details as any).type || "Lecture"; // eslint-disable-line @typescript-eslint/no-explicit-any
                  const sched = (course.details as any).schedule; // eslint-disable-line @typescript-eslint/no-explicit-any
                  if (!sched[cType]) sched[cType] = [];
                  sched[cType].push(value);
              }
            }
          });

          // Verification with keywords
          const hasEnglishTag = (course.details as any).isEnglish; // eslint-disable-line @typescript-eslint/no-explicit-any
          const hasGermanChars = /[äöüß]/i.test(title);
          const germanWords = ['masterprojekt', 'oberprojekt', 'algorithmische', 'informatik', 'eingebettete', 'echtzeitsysteme', 'programmiersprachen', 'programmiersysteme', 'steuerung', 'meeresforschung', 'forschung', 'technische', 'grundlagen', 'einführung', 'verfahren', 'methoden', 'anwendungen', 'begleitseminar', 'masterarbeit', 'mitarbeit', 'arbeitsgruppe', 'wahlpflicht', 'kolloquium', 'tutorium', 'werkstatt'];
          const hasGermanWords = germanWords.some(w => titleLower.includes(w));
          const englishKeywords = ['computer', 'data', 'science', 'network', 'system', 'software', 'intelligence', 'security', 'advanced', 'distributed', 'introduction', 'foundation', 'logic', 'machine', 'learning', 'cloud', 'robotics', 'project', 'seminar', 'vision', 'rendering', 'parallel', 'algorithm', 'things', 'wireless', 'matlab', 'mining'];
          const hasEnglishKeywords = englishKeywords.some(word => new RegExp(`\\b${word}\\b`, 'i').test(title));
          
          if (hasEnglishTag || (hasEnglishKeywords && !hasGermanChars && !hasGermanWords)) {
            const rawUrl = titleA.attr("href");
            if (rawUrl) {
              const absoluteRawUrl = rawUrl.startsWith("http")
                ? rawUrl
                : `https://univis.uni-kiel.de/${rawUrl.replace(/&amp;/g, "&")}`;
              course.url = this.sanitizeCourseUrl(rawUrl);
              (course.details as Record<string, unknown>).rawDetailUrl = absoluteRawUrl;
            }
            courses.push(course);
          }
        }
      }
    });
    return courses;
  }

  async retrieve(): Promise<Course[]> {
    const links = await this.links();
    console.log(`[${this.name}] Scraping English courses from ${links.length} departments...`);
    const xmlItems: Course[] = [];
    const htmlItems: Course[] = [];
    const [primaryLink, ...fallbackLinks] = links;

    if (primaryLink) {
      const { page, xml } = await this.resolveSemesterXml(primaryLink);
      if (xml) {
        xmlItems.push(...await this.normalizeXmlCourses(xml));
      } else if (page) {
        htmlItems.push(...await this.parser(page, new Set()));
      }
    }

    for (const link of fallbackLinks) {
      const page = await this.fetchPage(link);
      if (!page) continue;
      htmlItems.push(...await this.parser(page, new Set()));
    }
    const merged = xmlItems.length > 0 && htmlItems.length === 0
      ? xmlItems
      : [...xmlItems, ...this.mergeCourses(htmlItems)];
    const enriched = (await this.enrichCoursesWithModulDb(merged)).filter((course) =>
      this.shouldKeepAfterLanguageMerge(course),
    );
    const projectTableCategories = new Set([
      "Seminar",
      "Advanced Project",
      "Involvement in a working group",
      "Open Elective",
      "Colloquia and study groups",
      "Master Thesis Supervision Seminar",
    ]);
    const isProjectSeminarWorkshop = (item: Course) => {
      const category =
        item.details && typeof item.details === "object" && typeof item.details.category === "string"
          ? item.details.category
          : "";
      const title = (item.title || "").toLowerCase();
      return (
        projectTableCategories.has(category) ||
        title.includes("project") ||
        title.includes("seminar") ||
        title.includes("workshop")
      );
    };

    let projectSeminarDepartmentStatus = new Map<string, boolean>();
    let courseDepartmentStatus = new Map<string, boolean>();
    if (this.db) {
      projectSeminarDepartmentStatus = await this.db.getProjectSeminarDepartmentStatus("CAU Kiel");
      courseDepartmentStatus = await this.db.getCourseDepartmentStatus("CAU Kiel");
    }

    const missingDepartmentItems = enriched.filter((item) => {
      const detailsDepartment =
        item.details && typeof item.details === "object"
          ? ((item.details as Record<string, unknown>).department as string | undefined)
          : undefined;
      if (item.department || detailsDepartment || !item.url) return false;
      const inProjectsTable = isProjectSeminarWorkshop(item);
      const dbStatusMap = inProjectsTable ? projectSeminarDepartmentStatus : courseDepartmentStatus;
      const hasDepartmentInDb = dbStatusMap.get(item.courseCode);
      // Fetch detail only when this is a new row or existing row without department.
      return hasDepartmentInDb !== true;
    });

    if (missingDepartmentItems.length > 0) {
      await Promise.all(
        missingDepartmentItems.map(async (item) => {
          const rawDetailUrl =
            item.details && typeof item.details === "object"
              ? ((item.details as Record<string, unknown>).rawDetailUrl as string | undefined)
              : undefined;
          const detailUrl = rawDetailUrl || item.url;
          if (!detailUrl) return;
          const detailHtml = await this.fetchPage(detailUrl);
          const department = this.extractDepartmentFromDetailHtml(detailHtml);
          if (!department) return;
          item.department = this.normalizeDepartmentName(department);
          if (!item.details || typeof item.details !== "object") item.details = {};
          (item.details as Record<string, unknown>).department = this.normalizeDepartmentName(department);
        }),
      );
    }

    console.log(`[${this.name}] Found ${enriched.length} English academic items after merging.`);
    return enriched;
  }

  private mergeCourses(items: Course[]): Course[] {
    const courseMap = new Map<string, Course>();
    
    const normalizeTitle = (title: string) => {
        let t = title.trim();
        // Strip course code prefixes (alphanumeric codes containing digits/dots/hyphens like "infIoT-01a:")
        t = t.replace(/^[a-zA-Z0-9._-]*[\d._][a-zA-Z0-9._-]*[:\s]+/, "");
        // Strip exercise/practical prefixes
        const prefixes = /^(übung|.?bung|exercise|practical exercise|practice|tutorial|lab|projekt|project|workshop|fyord workshop|begleitseminar|oberseminar|tutorium)( zu| to)?[:\s]+/i;
        while (prefixes.test(t)) { t = t.replace(prefixes, ""); }
        // Strip leftover connectors from partial prefix removal
        t = t.replace(/^(zu|to)[:\s]+/i, "");
        return t.trim().toLowerCase();
    };

    const isSecondary = (c: Course) => {
        const type = (c.details as any).type; // eslint-disable-line @typescript-eslint/no-explicit-any
        return type === "Exercise" || type === "Practical" || type === "Project" ||
               /^(übung|.?bung|exercise|practical|practice|tutorial|lab|projekt|project|workshop)( zu| to)?:\s*/i.test(c.title);
    };

    // Deduplicate items by courseCode + internalId (same course appears in multiple page sections)
    const deduped = new Map<string, Course>();
    for (const item of items) {
        const key = `${item.courseCode}__${(item.details as any).internalId}`; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!deduped.has(key)) deduped.set(key, item);
    }

    const sorted = [...deduped.values()].sort((a, b) => {
        const secA = isSecondary(a); const secB = isSecondary(b);
        if (secA === secB) return 0;
        return secA ? 1 : -1;
    });

    for (const item of sorted) {
      const itemNormTitle = normalizeTitle(item.title);
      let targetCode: string | undefined;
      if (courseMap.has(item.courseCode)) targetCode = item.courseCode;
      else if (item.courseCode.startsWith("PE") && courseMap.has(item.courseCode.substring(2))) targetCode = item.courseCode.substring(2);
      else if ((item.courseCode.startsWith("E") || item.courseCode.startsWith("P")) && courseMap.has(item.courseCode.substring(1))) targetCode = item.courseCode.substring(1);

      if (!targetCode) {
          const itemInternalId = (item.details as any).internalId; // eslint-disable-line @typescript-eslint/no-explicit-any
          for (const [code, existing] of courseMap.entries()) {
              if ((existing.details as any).internalId === itemInternalId) { // eslint-disable-line @typescript-eslint/no-explicit-any
                  targetCode = code; break;
              }
          }
      }

      if (!targetCode) {
        for (const [code, existing] of courseMap.entries()) {
             const existingNormTitle = normalizeTitle(existing.title);
             if (existingNormTitle === itemNormTitle && !isSecondary(existing)) {
                 targetCode = code; break;
             }
        }
      }

      if (!targetCode) {
        for (const [code, existing] of courseMap.entries()) {
             const existingNormTitle = normalizeTitle(existing.title);
             // Require the shorter title to be at least 60% of the longer title's length to avoid false matches
             const shorter = existingNormTitle.length < itemNormTitle.length ? existingNormTitle : itemNormTitle;
             const longer = existingNormTitle.length < itemNormTitle.length ? itemNormTitle : existingNormTitle;
             if (shorter.length > 5 && longer.includes(shorter) && shorter.length >= longer.length * 0.6 && !isSecondary(existing)) {
                 targetCode = code; break;
             }
        }
      }

      if (targetCode && courseMap.has(targetCode)) {
        const existing = courseMap.get(targetCode)!;
        const isNewCodeBetter = /^[a-zA-Z]/.test(item.courseCode) && /^\d/.test(existing.courseCode);

        const target = isNewCodeBetter ? item : existing;
        const source = isNewCodeBetter ? existing : item;

        if (isNewCodeBetter) {
            courseMap.delete(existing.courseCode);
            courseMap.set(item.courseCode, item);
        }

        const tDetails = target.details as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const sDetails = source.details as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        
        if (!tDetails.breakdown) tDetails.breakdown = [0, 0, 0, 0];
        if (!sDetails.breakdown) sDetails.breakdown = [0, 0, 0, 0];

        const su = sDetails.rawUnits || 0;
        const stype = sDetails.type;
        if (stype === "Lecture") tDetails.breakdown[0] += su;
        else if (stype === "Seminar") tDetails.breakdown[1] += su;
        else if (stype === "Exercise") tDetails.breakdown[2] += su;
        else if (stype === "Practical" || stype === "Project") tDetails.breakdown[3] += su;

        const sSched = sDetails.schedule || {};
        const tSched = tDetails.schedule || {};
        for (const [type, dates] of Object.entries(sSched)) {
            if (!tSched[type]) tSched[type] = [];
            (dates as string[]).forEach(d => { if (!tSched[type].includes(d)) tSched[type].push(d); });
        }
        tDetails.schedule = tSched;

        const sInstr = (sDetails.instructors || []).filter((i: string) => i && i !== "N.N." && i !== "N. N.");
        const tInstr = (tDetails.instructors || []).filter((i: string) => i && i !== "N.N." && i !== "N. N.");
        sInstr.forEach((i: string) => { if (!tInstr.includes(i)) tInstr.push(i); });
        tDetails.instructors = tInstr;

        const sLinks = Array.isArray(sDetails.resources) ? (sDetails.resources as string[]) : [];
        const tLinks = Array.isArray(tDetails.resources) ? (tDetails.resources as string[]) : [];
        tDetails.resources = Array.from(new Set([...tLinks, ...sLinks]));

        if (!target.url && source.url) target.url = source.url;
        if (!target.department && source.department) target.department = source.department;
        if (!tDetails.department && sDetails.department) tDetails.department = sDetails.department;
        if (!tDetails.rawDetailUrl && sDetails.rawDetailUrl) tDetails.rawDetailUrl = sDetails.rawDetailUrl;

        if (!target.description) target.description = source.description;
      } else {
        const details = item.details as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!details.breakdown) {
            details.breakdown = [0, 0, 0, 0];
            const u = details.rawUnits || 0;
            const type = details.type;
            if (type === "Lecture") details.breakdown[0] += u;
            else if (type === "Seminar") details.breakdown[1] += u;
            else if (type === "Exercise") details.breakdown[2] += u;
            else if (type === "Practical" || type === "Project") details.breakdown[3] += u;
        }
        courseMap.set(item.courseCode, item);
      }
    }

    const result = Array.from(courseMap.values());
    result.forEach(c => {
        const d = c.details as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (d.breakdown) {
            c.units = `${d.breakdown[0]}-${d.breakdown[1]}-${d.breakdown[2]}-${d.breakdown[3]}`;
            delete d.breakdown; delete d.rawUnits; delete d.type;
        }
    });
    return result;
  }
}
