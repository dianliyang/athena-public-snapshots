import { describe, expect, test, vi, beforeEach } from "vitest";

const { retrieveWorkoutSourceBatchesMock } = vi.hoisted(() => ({
  retrieveWorkoutSourceBatchesMock: vi.fn(),
}));

vi.mock("../lib/scrapers/workout-sources", () => ({
  retrieveWorkoutSourceBatches: retrieveWorkoutSourceBatchesMock,
}));

describe("buildPublicSnapshots default workout retrieval", () => {
  beforeEach(() => {
    retrieveWorkoutSourceBatchesMock.mockReset();
  });

  test("uses all active workout sources by default", async () => {
    retrieveWorkoutSourceBatchesMock.mockResolvedValue({
      batches: [
        {
          source: "Urban Apes",
          pageUrl: "https://www.urbanapes.de/kiel/quick-overview/",
          workouts: [
            {
              id: "urban-apes-bouldering",
              source: "Urban Apes",
              provider: "Urban Apes",
              courseCode: "urban-apes-bouldering",
              category: "Climbing",
              title: "Bouldering",
              dayOfWeek: "",
              startTime: "",
              endTime: "",
              location: ["Kiel"],
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
              url: "https://www.urbanapes.de/kiel/quick-overview/",
              semester: "su26",
              schedule: [],
            },
          ],
        },
      ],
    });

    const { buildPublicSnapshots } = await import("../pipeline/build-public-snapshots");
    await buildPublicSnapshots(
      { version: "2026-03-20T10-00-00Z" },
      {},
    );

    expect(retrieveWorkoutSourceBatchesMock).toHaveBeenCalledWith({
      semester: "su26",
      sources: ["cau-sport", "urban-apes", "ricks-club", "haw-kiel-sport"],
    });
  });
});
