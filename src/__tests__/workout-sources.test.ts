import { describe, expect, test, vi } from "vitest";
import { retrieveWorkoutSourceBatches } from "../lib/scrapers/workout-sources";
import { RicksClub } from "../lib/scrapers/ricks-club";

describe("retrieveWorkoutSourceBatches", () => {
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
