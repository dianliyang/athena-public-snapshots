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
});
