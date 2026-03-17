import { describe, expect, test } from "vitest";
import { UrbanApes } from "../lib/scrapers/urban-apes";

describe("UrbanApes.parseWorkouts", () => {
  test("categorizes the gym as climbing and titles it as bouldering", () => {
    const scraper = new UrbanApes();
    const html = `
      <div class="fusion-panel">
        <div class="fusion-toggle-heading">Opening hours</div>
        <div class="panel-body">
          <p><strong>Monday - Friday</strong> 9:00 a.m. - 10:00 p.m.</p>
        </div>
      </div>
      <div class="fusion-panel">
        <div class="fusion-toggle-heading">Prices</div>
        <div class="panel-body">
          <table>
            <tbody>
              <tr>
                <td><strong>Day Ticket</strong></td>
                <td>15,00 €</td>
                <td>12,00 €</td>
                <td>10,00 €</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="fusion-text">
        <p>urban apes Kiel, Alte Lübecker Chaussee 1, 24113 Kiel</p>
      </div>
    `;

    const workouts = scraper.parseWorkouts(html, "https://www.urbanapes.de/kiel/quick-overview/");

    expect(workouts).toHaveLength(1);
    expect(workouts[0]?.category).toBe("Climbing");
    expect(workouts[0]?.title).toBe("Bouldering");
  });
});
