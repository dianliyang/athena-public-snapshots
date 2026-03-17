import { describe, expect, test } from "vitest";
import { UrbanApes } from "../lib/scrapers/urban-apes";

describe("UrbanApes.parseWorkouts", () => {
  test("categorizes the gym as bouldering and titles it as bouldering", () => {
    const scraper = new UrbanApes();
    const html = `
      <div class="fusion-panel">
        <div class="fusion-toggle-heading">Opening hours</div>
        <div class="panel-body">
          <p><strong>Monday - Friday</strong> 9:00 a.m. - 10:00 p.m.</p>
          <p><strong>Saturday & Sunday</strong> 10:00 a.m. - 8:00 p.m.</p>
        </div>
      </div>
      <div class="fusion-panel">
        <div class="fusion-toggle-heading">Most important information as a glance</div>
        <div class="panel-body">
          <p>
            <strong>• No previous experience necessary</strong><br>
            • We don’t accept cash – card payment only!<br>
            • Bouldering shoes are offered to rent. Please see price list for rental prices.
          </p>
          <p>
            • If you come to us regularly, please sign up for a profile.
          </p>
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
          <p>All prices are in euros and include VAT.</p>
          <p><strong>*Children</strong>: Ages 4 to 13 (inclusive).</p>
          <p><strong>*Discounted</strong>: Applies to individuals aged 14 to 17, pupils, apprentices, students, people with disabilities, recipients of citizen's allowance, unemployment benefits, and pensions, as well as voluntary service members.</p>
          <p>Individual conditions for companies, clubs, and schools available upon request.<br>School climbing, events, and other activities can be arranged outside regular opening hours by appointment.</p>
        </div>
      </div>
      <div class="fusion-text">
        <p>urban apes Kiel, Grasweg 40, 24118 Kiel</p>
      </div>
    `;

    const workouts = scraper.parseWorkouts(html, "https://www.urbanapes.de/kiel/quick-overview/");

    expect(workouts).toHaveLength(1);
    expect(workouts[0]?.courseCode).toBe("urban-apes-kiel");
    expect(workouts[0]?.category).toBe("Bouldering");
    expect(workouts[0]?.title).toBe("Bouldering");
    expect(workouts[0]?.location).toEqual(["Grasweg 40, 24118 Kiel"]);
    expect(workouts[0]?.schedule).toEqual([
      {
        day: "Mon-Fri",
        time: "09:00-22:00",
        location: "Grasweg 40, 24118 Kiel",
      },
      {
        day: "Sat-Sun",
        time: "10:00-20:00",
        location: "Grasweg 40, 24118 Kiel",
      },
    ]);
    expect(workouts[0]?.description).toEqual({
      general: "No previous experience necessary\nWe don't accept cash - card payment only!\nBouldering shoes are offered to rent. Please see price list for rental prices.\nIf you come to us regularly, please sign up for a profile.",
      price: "All prices are in euros and include VAT.\n*Children: Ages 4 to 13 (inclusive).\n*Discounted: Applies to individuals aged 14 to 17, pupils, apprentices, students, people with disabilities, recipients of citizen's allowance, unemployment benefits, and pensions, as well as voluntary service members.\nIndividual conditions for companies, clubs, and schools available upon request.\nSchool climbing, events, and other activities can be arranged outside regular opening hours by appointment.",
    });
    expect(workouts[0]?.price).toEqual({
      adults: 15,
      children: 10,
      discount: 12,
    });
  });
});
