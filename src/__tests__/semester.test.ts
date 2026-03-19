import { describe, expect, test, vi } from "vitest";
import { buildCurrentWorkoutSemester } from "../lib/scrapers/utils/semester";
import { CAUSport } from "../lib/scrapers/cau-sport";

describe("workout semester helpers", () => {
  test("defaults to the summer semester for 2026", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00Z"));

    try {
      expect(buildCurrentWorkoutSemester()).toBe("su26");
    } finally {
      vi.useRealTimers();
    }
  });

  test("uses the live CAU path for the current summer semester", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00Z"));

    try {
      const scraper = new CAUSport();
      scraper.semester = "su26";
      expect(scraper.getSemesterParam()).toBe("aktueller_zeitraum");
    } finally {
      vi.useRealTimers();
    }
  });
});
