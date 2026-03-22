import { describe, expect, test, vi } from "vitest";
import { retrieveWorkoutSourceBatches } from "../lib/scrapers/workout-sources";
import { HAWKielSport } from "../lib/scrapers/haw-kiel-sport";
import { RicksClub } from "../lib/scrapers/ricks-club";

describe("retrieveWorkoutSourceBatches", () => {
  test("returns a dedicated batch for the haw-kiel-sport source", async () => {
    vi.spyOn(HAWKielSport.prototype, "retrieveWorkouts").mockResolvedValue([
      {
        source: "HAW Kiel Hochschulsport",
        provider: "HAW Kiel Hochschulsport",
        courseCode: "haw-kiel-120",
        category: "Ballsportarten",
        title: "Tischfußball",
        description: {
          general: "Offenes Spielangebot",
          price: "Kostenlos",
        },
        dayOfWeek: "Dienstag",
        startTime: "18:00",
        endTime: "20:00",
        location: ["Campus Center Kiel"],
        instructor: "Alex Coach",
        startDate: "2026-03-01",
        endDate: "2026-08-31",
        price: {
          student: 0,
          staff: 0,
          external: 0,
          externalReduced: 0,
        },
        bookingStatus: "available",
        bookingUrl: "https://haw-kiel.venuzle.com/events/120",
        url: "https://haw-kiel.venuzle.com/events/120",
        semester: "",
        schedule: [
          { day: "Dienstag", time: "18:00-20:00", location: "Campus Center Kiel" },
        ],
      },
    ]);

    const result = await retrieveWorkoutSourceBatches({ sources: ["haw-kiel-sport"] });

    expect(result.batches).toEqual([
      {
        source: "HAW Kiel Hochschulsport",
        workouts: [
          expect.objectContaining({
            title: "Tischfußball",
            provider: "HAW Kiel Hochschulsport",
          }),
        ],
        pageUrl: "https://haw-kiel.venuzle.com/search/events?v=table",
      },
    ]);
  });

  test("returns a dedicated batch for the ricks-club source", async () => {
    vi.spyOn(RicksClub.prototype, "retrieveWorkouts").mockResolvedValue([
      {
        source: "Ricks Club",
        provider: "Ricks Club",
        courseCode: "ricks-club-bowling",
        category: "Bowling",
        title: "Bowling",
        description: {
          general: "Bowling lanes",
          price: "24,00 € pro Bahn / Stunde",
        },
        dayOfWeek: "",
        startTime: "",
        endTime: "",
        location: ["Holtenauer Straße 279, 24106 Kiel"],
        instructor: "",
        startDate: "",
        endDate: "",
        price: {
          student: null,
          staff: null,
          external: null,
          externalReduced: null,
        },
        bookingStatus: "",
        bookingUrl: "",
        url: "https://www.ricksclub.de/",
        semester: "",
        schedule: [],
      },
    ]);

    const result = await retrieveWorkoutSourceBatches({ sources: ["ricks-club"] });

    expect(result.batches).toEqual([
      {
        source: "Ricks Club",
        workouts: [
          expect.objectContaining({
            title: "Bowling",
            provider: "Ricks Club",
          }),
        ],
        pageUrl: "https://www.ricksclub.de/",
      },
    ]);
  });
});
