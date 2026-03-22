import { describe, expect, test, vi } from "vitest";
import { CAUSport } from "../lib/scrapers/cau-sport";

describe("CAUSport.parseWorkouts", () => {
  test("preserves multiple duration-page locations as a top-level array", async () => {
    const scraper = new CAUSport();
    vi.spyOn(scraper, "parseDurationPageMetadata").mockResolvedValue({
      dates: ["20.10.2025", "27.10.2025"],
      locations: ["Hall 1", "Hall 2"],
    });

    const html = `
      <div id="bs_top">Wintersemester 2025/26</div>
      <table>
        <tbody>
          <tr>
            <td class="bs_sknr"><span>1234-56</span></td>
            <td class="bs_sdet">
              <span>
                <span class="dispmobile">Yoga</span>
                Morning Flow
              </span>
            </td>
            <td class="bs_stag">Mo.</td>
            <td class="bs_szeit">08:00-09:00</td>
            <td class="bs_sort">Fallback Room</td>
            <td class="bs_szr">
              20.10.2025 - 27.10.2025
              <a href="/details.html">Details</a>
            </td>
            <td class="bs_skl">Coach A</td>
            <td class="bs_spreis"><span>10,00 / 20,00 / 30,00 / 40,00</span></td>
            <td class="bs_sbuch"><input type="submit" value="Buchen" /></td>
          </tr>
        </tbody>
      </table>
    `;

    const workouts = await scraper.parseWorkouts(
      html,
      "https://server.sportzentrum.uni-kiel.de/angebote/aktueller_zeitraum/yoga.html",
    );

    expect(workouts).toHaveLength(1);
    expect(workouts[0]?.title).toBe("Morning Flow");
    expect(workouts[0]?.location).toEqual(["Hall 1", "Hall 2"]);
    expect(workouts[0]?.dayOfWeek).toBe("Mo.");
    expect(workouts[0]?.schedule).toEqual([
      {
        day: "Mo.",
        time: "08:00-09:00",
        location: "Fallback Room",
      },
    ]);
    expect(workouts[0]?.price).toEqual({
      student: 10,
      staff: 20,
      external: 30,
      externalReduced: 40,
    });
  });

  test("falls back to the category label only when the course name is empty", async () => {
    const scraper = new CAUSport();
    vi.spyOn(scraper, "parseDurationPageMetadata").mockResolvedValue({
      dates: [],
      locations: [],
    });

    const html = `
      <div id="bs_top">Wintersemester 2025/26</div>
      <table>
        <tbody>
          <tr>
            <td class="bs_sknr"><span>1234-57</span></td>
            <td class="bs_sdet">
              <span>
                <span class="dispmobile">Yoga</span>
              </span>
            </td>
            <td class="bs_stag">Mo.</td>
            <td class="bs_szeit">08:00-09:00</td>
            <td class="bs_sort">Fallback Room</td>
            <td class="bs_szr">20.10.2025 - 27.10.2025</td>
            <td class="bs_skl">Coach A</td>
            <td class="bs_spreis"><span>10,00 / 20,00 / 30,00 / 40,00</span></td>
            <td class="bs_sbuch"><input type="submit" value="Buchen" /></td>
          </tr>
        </tbody>
      </table>
    `;

    const workouts = await scraper.parseWorkouts(
      html,
      "https://server.sportzentrum.uni-kiel.de/angebote/aktueller_zeitraum/yoga.html",
    );

    expect(workouts).toHaveLength(1);
    expect(workouts[0]?.title).toBe("Yoga");
  });

  test("limits duration page fetches and falls back to row metadata once the budget is exhausted", async () => {
    const scraper = new CAUSport();
    const parseDurationPageMetadata = vi.spyOn(scraper, "parseDurationPageMetadata")
      .mockResolvedValue({
        dates: ["20.10.2025", "27.10.2025"],
        locations: ["Hall 1"],
      });

    const html = `
      <div id="bs_top">Wintersemester 2025/26</div>
      <table>
        <tbody>
          <tr>
            <td class="bs_sknr"><span>1234-56</span></td>
            <td class="bs_sdet">
              <span>
                <span class="dispmobile">Yoga</span>
                Morning Flow
              </span>
            </td>
            <td class="bs_stag">Mo.</td>
            <td class="bs_szeit">08:00-09:00</td>
            <td class="bs_sort">Fallback Room 1</td>
            <td class="bs_szr">
              20.10.2025 - 27.10.2025
              <a href="/details-1.html">Details</a>
            </td>
            <td class="bs_skl">Coach A</td>
            <td class="bs_spreis"><span>10,00 / 20,00 / 30,00 / 40,00</span></td>
            <td class="bs_sbuch"><input type="submit" value="Buchen" /></td>
          </tr>
          <tr>
            <td class="bs_sknr"><span>1234-57</span></td>
            <td class="bs_sdet">
              <span>
                <span class="dispmobile">Yoga</span>
                Evening Flow
              </span>
            </td>
            <td class="bs_stag">Di.</td>
            <td class="bs_szeit">18:00-19:00</td>
            <td class="bs_sort">Fallback Room 2</td>
            <td class="bs_szr">
              21.10.2025 - 28.10.2025
              <a href="/details-2.html">Details</a>
            </td>
            <td class="bs_skl">Coach B</td>
            <td class="bs_spreis"><span>12,00 / 22,00 / 32,00 / 42,00</span></td>
            <td class="bs_sbuch"><input type="submit" value="Buchen" /></td>
          </tr>
        </tbody>
      </table>
    `;

    const workouts = await scraper.parseWorkouts(
      html,
      "https://server.sportzentrum.uni-kiel.de/angebote/aktueller_zeitraum/yoga.html",
      { detailPageBudget: { remaining: 1 } },
    );

    expect(parseDurationPageMetadata).toHaveBeenCalledTimes(1);
    expect(workouts).toHaveLength(2);
    const morningFlow = workouts.find((workout) => workout.courseCode === "1234-56");
    const eveningFlow = workouts.find((workout) => workout.courseCode === "1234-57");

    expect(morningFlow?.location).toEqual(["Hall 1"]);
    expect(morningFlow?.plannedDates).toEqual(["20.10.2025", "27.10.2025"]);
    expect(eveningFlow?.location).toEqual(["Fallback Room 2"]);
    expect(eveningFlow?.plannedDates).toEqual([]);
    expect(eveningFlow?.durationUrl).toBe("https://server.sportzentrum.uni-kiel.de/details-2.html");
  });
});
