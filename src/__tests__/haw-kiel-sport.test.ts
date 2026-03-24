import { describe, expect, test, vi } from "vitest";
import { HAWKielSport } from "../lib/scrapers/haw-kiel-sport";

describe("HAWKielSport", () => {
  test("parses listing rows and enriches workouts with detail-page metadata", async () => {
    const scraper = new HAWKielSport();
    vi.spyOn(scraper, "fetchPage").mockImplementation(async (url: string) => {
      if (url === "https://haw-kiel.venuzle.com/events/120") {
        return `
          <html>
            <body>
              <main>
                <h1>Tischfußball</h1>
                <div>
                  <h2>Beschreibung</h2>
                  <p>Offenes Spielangebot fuer alle Levels.</p>
                </div>
                <div>
                  <h2>Termine</h2>
                  <p>Dienstag, 18:00 - 20:00 Uhr</p>
                </div>
                <div>
                  <h2>Ort</h2>
                  <p>Campus Center Kiel</p>
                </div>
                <div>
                  <h2>Leitung</h2>
                  <p>Alex Coach</p>
                </div>
                <div>
                  <h2>Kategorien</h2>
                  <ul><li>Ballsportarten</li></ul>
                </div>
              </main>
            </body>
          </html>
        `;
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    const workouts = await scraper.parseWorkouts(`
      <table>
        <tbody>
          <tr>
            <td class="hidden p-0"><a href="/events/120">120</a></td>
            <td class="p-0"><a href="/events/120"><span title="Tischfußball">Tischfußball</span></a></td>
            <td class="p-0"><a href="/events/120">So. 01.03.2026 - Mo. 31.08.2026</a></td>
            <td class="p-0"><a href="/events/120">Kostenlos</a></td>
            <td class="p-0"><a href="/events/120">0 - 99+ Jahre</a></td>
            <td class="p-0"><a href="/events/120"><span class="text-success">(0 / ∞)</span></a></td>
            <td class="p-0"><a href="/events/120"><div class="badge whitespace-nowrap badge-info">Buchbar</div></a></td>
          </tr>
        </tbody>
      </table>
    `, "https://haw-kiel.venuzle.com/search/events?v=table");

    expect(workouts).toHaveLength(1);
    expect(workouts[0]).toEqual(expect.objectContaining({
      source: "HAW Kiel Hochschulsport",
      provider: "HAW Kiel Hochschulsport",
      courseCode: "haw-kiel-120",
      category: "Ballsportarten",
      title: "Tischfußball",
      instructor: "Alex Coach",
      location: ["Campus Center Kiel"],
      startDate: "2026-03-01",
      endDate: "2026-08-31",
      bookingStatus: "available",
      bookingUrl: "https://haw-kiel.venuzle.com/events/120",
      url: "https://haw-kiel.venuzle.com/events/120",
    }));
    expect(workouts[0]?.schedule).toEqual([
      { day: "Dienstag", time: "18:00-20:00", location: "Campus Center Kiel" },
    ]);
    expect(workouts[0]?.description).toEqual({
      general: "Offenes Spielangebot fuer alle Levels.",
      price: "Kostenlos",
    });
    expect(workouts[0]?.details).toEqual(expect.objectContaining({
      ageRange: "0 - 99+ Jahre",
      places: {
        booked: 0,
        capacity: null,
        raw: "0 / ∞",
      },
      listingStatusLabel: "Buchbar",
    }));
  });

  test("uses Appointments and Instructor sections from the detail page and only maps student/external prices", async () => {
    const scraper = new HAWKielSport();
    vi.spyOn(scraper, "fetchPage").mockImplementation(async (url: string) => {
      if (url === "https://haw-kiel.venuzle.com/events/220") {
        return `
          <html>
            <body>
              <main>
                <section aria-label="Description">
                  <h2>Description</h2>
                  <div class="bg-base-100">
                    <p>Technique-focused training block.<br />Bring indoor shoes.</p>
                  </div>
                </section>
                <section aria-label="Prices">
                  <h2>Prices</h2>
                  <div class="bg-base-100">
                    <p>Student 15,00 €</p>
                    <p>External 35,00 €</p>
                  </div>
                </section>
                <section aria-label="Appointments">
                  <h2>Appointments</h2>
                  <table>
                    <tbody>
                      <tr>
                        <td>1</td>
                        <td>Monday, 07.04.2026</td>
                        <td>18:00</td>
                        <td>19:30</td>
                        <td> Hall A </td>
                        <td>  Grenzstrasse 3, Kiel  </td>
                      </tr>
                      <tr>
                        <td>2</td>
                        <td>Monday, 14.04.2026</td>
                        <td>18:00</td>
                        <td>19:30</td>
                        <td> Hall A </td>
                        <td>  Grenzstrasse 3, Kiel  </td>
                      </tr>
                    </tbody>
                  </table>
                </section>
                <section aria-label="Instructor">
                  <h2>Instructor</h2>
                  <div class="bg-base-100">
                    <p>Jamie Trainer</p>
                  </div>
                </section>
                <section aria-label="Categories">
                  <h2>Categories</h2>
                  <div class="bg-base-100">
                    <ul><li>Martial Arts</li></ul>
                  </div>
                </section>
              </main>
            </body>
          </html>
        `;
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    const workouts = await scraper.parseWorkouts(`
      <table>
        <tbody>
          <tr>
            <td class="hidden p-0"><a href="/events/220">220</a></td>
            <td class="p-0"><a href="/events/220"><span title="Self Defense">Self Defense</span></a></td>
            <td class="p-0"><a href="/events/220">Mo. 07.04.2026 - Mo. 14.04.2026</a></td>
            <td class="p-0"><a href="/events/220">Student 15,00 € / External 35,00 €</a></td>
            <td class="p-0"><a href="/events/220">18 - 99 Jahre</a></td>
            <td class="p-0"><a href="/events/220"><span class="text-success">(2 / 12)</span></a></td>
            <td class="p-0"><a href="/events/220"><div class="badge whitespace-nowrap badge-info">Buchbar</div></a></td>
          </tr>
        </tbody>
      </table>
    `, "https://haw-kiel.venuzle.com/search/events?v=table");

    expect(workouts).toHaveLength(1);
    expect(workouts[0]).toEqual(expect.objectContaining({
      category: "Martial Arts",
      instructor: "Jamie Trainer",
      location: ["Hall A, Grenzstrasse 3, Kiel"],
      dayOfWeek: "Monday",
      startTime: "18:00",
      endTime: "19:30",
      sessionCount: 2,
      price: {
        student: 15,
        staff: null,
        external: 35,
        externalReduced: null,
      },
    }));
    expect(workouts[0]?.schedule).toEqual([
      { day: "Monday", time: "18:00-19:30", location: "Hall A, Grenzstrasse 3, Kiel" },
    ]);
    expect(workouts[0]?.description).toEqual({
      general: "Technique-focused training block.\n\nBring indoor shoes.",
      price: "Student 15,00 €.\n\nExternal 35,00 €.",
    });
    expect(workouts[0]?.details).toEqual(expect.objectContaining({
      rawPrice: "Student 15,00 € / External 35,00 €",
    }));
  });

  test("reads booking status from the badge inside the listing link", async () => {
    const scraper = new HAWKielSport();
    vi.spyOn(scraper, "fetchPage").mockResolvedValue(`
      <html>
        <body>
          <main>
            <div>
              <h2>Ort</h2>
              <p>Campus Center Kiel</p>
            </div>
          </main>
        </body>
      </html>
    `);

    const workouts = await scraper.parseWorkouts(`
      <table>
        <tbody>
          <tr>
            <td class="hidden p-0"><a href="/events/103">103</a></td>
            <td class="p-0"><a href="/events/103"><span title="Lauftreff">Lauftreff</span></a></td>
            <td class="p-0"><a href="/events/103">So. 01.03.2026 - Mo. 31.08.2026</a></td>
            <td class="p-0"><a href="/events/103">Kostenlos</a></td>
            <td class="p-0"><a href="/events/103">18 - 99 Jahre</a></td>
            <td class="p-0"><a href="/events/103"><span class="text-success">(0 / ∞)</span></a></td>
            <td class="p-0">
              <a href="/events/103" wire:navigate="" class="block py-3 px-4">
                <div class="badge whitespace-nowrap badge-info">
                  Bookable
                </div>
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    `, "https://haw-kiel.venuzle.com/search/events?v=table");

    expect(workouts).toHaveLength(1);
    expect(workouts[0]?.bookingStatus).toBe("available");
    expect(workouts[0]?.details).toEqual(expect.objectContaining({
      listingStatusLabel: "Bookable",
    }));
  });

  test("collapses repeated appointment rows with the same weekday time and venue into one schedule", async () => {
    const scraper = new HAWKielSport();

    const detail = scraper.parseDetailPage(`
      <html>
        <body>
          <section aria-label="Appointments">
            <h2>Appointments</h2>
            <div class="bg-base-100">
              <table>
                <tbody>
                  <tr>
                    <td>Tuesday, 02.06.2026</td>
                    <td>18:40</td>
                    <td>19:25</td>
                    <td>Wing Tsun Akademie<br />Knooper Weg 51, 24103 Kiel</td>
                  </tr>
                  <tr>
                    <td>Tuesday, 26.05.2026</td>
                    <td>18:40</td>
                    <td>19:25</td>
                    <td>Wing Tsun Akademie<br />Knooper Weg 51, 24103 Kiel</td>
                  </tr>
                  <tr>
                    <td>Tuesday, 19.05.2026</td>
                    <td>18:40</td>
                    <td>19:25</td>
                    <td>Wing Tsun Akademie<br />Knooper Weg 51, 24103 Kiel</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </body>
      </html>
    `);

    expect(detail.schedule).toEqual([
      {
        day: "Tuesday",
        time: "18:40-19:25",
        location: "Wing Tsun Akademie, Knooper Weg 51, 24103 Kiel",
      },
    ]);
    expect(detail.location).toEqual([
      "Wing Tsun Akademie, Knooper Weg 51, 24103 Kiel",
    ]);
    expect(detail.sessionCount).toBe(3);
  });

  test("uses the English Appointments section when the widget response is in English", async () => {
    const scraper = new HAWKielSport();

    const detail = scraper.parseDetailPage(`
      <html>
        <body>
          <section aria-label="Appointments">
            <h2>Appointments</h2>
            <div class="bg-base-100">
              <table>
                <tbody>
                  <tr>
                    <td>1457</td>
                    <td>Thursday, 27.08.2026</td>
                    <td>00:00</td>
                    <td>00:01</td>
                    <td>Nicht bekannt</td>
                    <td>, 24103 unbekannt</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </body>
      </html>
    `);

    expect(detail.schedule).toEqual([
      {
        day: "Thursday",
        time: "00:00-00:01",
        location: "Nicht bekannt, 24103 unbekannt",
      },
    ]);
    expect(detail.location).toEqual([
      "Nicht bekannt, 24103 unbekannt",
    ]);
    expect(detail.sessionCount).toBe(1);
  });

  test("prefers the real Appointments section over overview text labels", async () => {
    const scraper = new HAWKielSport();

    const detail = scraper.parseDetailPage(`
      <html>
        <body>
          <div>
            <p class="font-medium my-2">Termine</p>
            <p class="text-xl">1</p>
          </div>
          <section aria-label="Appointments">
            <h2>Appointments</h2>
            <div class="bg-base-100">
              <table>
                <tbody>
                  <tr>
                    <td>1457</td>
                    <td>Thursday, 27.08.2026</td>
                    <td>00:00</td>
                    <td>00:01</td>
                    <td>Wing Tsun Akademie</td>
                    <td>Knooper Weg 51, 24103 Kiel</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </body>
      </html>
    `);

    expect(detail.schedule).toEqual([
      {
        day: "Thursday",
        time: "00:00-00:01",
        location: "Wing Tsun Akademie, Knooper Weg 51, 24103 Kiel",
      },
    ]);
    expect(detail.sessionCount).toBe(1);
  });

  test("uses Appointments pagination total before falling back to visible row count", async () => {
    const scraper = new HAWKielSport();

    const detail = scraper.parseDetailPage(`
      <html>
        <body>
          <section aria-label="Appointments">
            <h2>Appointments</h2>
            <div class="bg-base-100">
              <p class="text-sm text-base-content/75 leading-5">
                <span class="font-bold">1</span>
                <span>to</span>
                <span class="font-bold">10</span>
                <span>of</span>
                <span class="font-bold">12</span>
                <span>results</span>
              </p>
              <table>
                <tbody>
                  <tr>
                    <td>1</td>
                    <td>Tuesday, 01.04.2026</td>
                    <td>18:00</td>
                    <td>19:30</td>
                    <td>Hall A</td>
                    <td>Grenzstrasse 3, Kiel</td>
                  </tr>
                  <tr>
                    <td>2</td>
                    <td>Tuesday, 08.04.2026</td>
                    <td>18:00</td>
                    <td>19:30</td>
                    <td>Hall A</td>
                    <td>Grenzstrasse 3, Kiel</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </body>
      </html>
    `);

    expect(detail.schedule).toEqual([
      {
        day: "Tuesday",
        time: "18:00-19:30",
        location: "Hall A, Grenzstrasse 3, Kiel",
      },
    ]);
    expect(detail.sessionCount).toBe(12);
  });

  test("retrieves additional listing pages through Livewire pagination", async () => {
    const scraper = new HAWKielSport();
    const originalFetch = global.fetch;

    const pageOneHtml = `
      <html>
        <head>
          <meta name="csrf-token" content="csrf-token-value">
        </head>
        <body>
          <div wire:snapshot="{&quot;data&quot;:{&quot;paginators&quot;:[{&quot;page&quot;:1},{&quot;s&quot;:&quot;arr&quot;}]},&quot;memo&quot;:{&quot;id&quot;:&quot;cmp-1&quot;,&quot;name&quot;:&quot;search.events.search-events&quot;},&quot;checksum&quot;:&quot;checksum-1&quot;}" wire:id="cmp-1" wire:name="search.events.search-events"></div>
          <section id="results">
            <table>
              <tbody>
                <tr>
                  <td class="hidden p-0"><a href="/events/120">120</a></td>
                  <td class="p-0"><a href="/events/120"><span>Tischfußball</span></a></td>
                  <td class="p-0"><a href="/events/120">So. 01.03.2026 - Mo. 31.08.2026</a></td>
                  <td class="p-0"><a href="/events/120">Kostenlos</a></td>
                  <td class="p-0"><a href="/events/120">0 - 99+ Jahre</a></td>
                  <td class="p-0"><a href="/events/120"><span>(0 / ∞)</span></a></td>
                  <td class="p-0"><a href="/events/120"><div>Buchbar</div></a></td>
                </tr>
              </tbody>
            </table>
            <button type="button" wire:click="gotoPage(2, 'page')">2</button>
          </section>
          <script data-navigate-once="true">window.livewireScriptConfig = {"csrf":"csrf-token-value","uri":"https:\\/\\/haw-kiel.venuzle.com\\/livewire-abc123\\/update","moduleUrl":"https:\\/\\/haw-kiel.venuzle.com\\/livewire-abc123","progressBar":"","nonce":""};</script>
        </body>
      </html>
    `;

    const pageTwoResponse = {
      components: [
        {
          snapshot: "{\"data\":{\"paginators\":[{\"page\":2},{\"s\":\"arr\"}]},\"memo\":{\"id\":\"cmp-2\",\"name\":\"search.events.search-events\"},\"checksum\":\"checksum-2\"}",
          effects: {
            html: `
              <div wire:id="cmp-2" wire:name="search.events.search-events">
                <table>
                  <tbody>
                    <tr>
                      <td class="hidden p-0"><a href="/events/121">121</a></td>
                      <td class="p-0"><a href="/events/121"><span>Jugger</span></a></td>
                      <td class="p-0"><a href="/events/121">So. 01.03.2026 - Mo. 31.08.2026</a></td>
                      <td class="p-0"><a href="/events/121">Kostenlos</a></td>
                      <td class="p-0"><a href="/events/121">0 - 99+ Jahre</a></td>
                      <td class="p-0"><a href="/events/121"><span>(0 / ∞)</span></a></td>
                      <td class="p-0"><a href="/events/121"><div>Buchbar</div></a></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            `,
          },
        },
      ],
    };

    const detailByUrl = new Map([
      ["https://haw-kiel.venuzle.com/events/120", `<html><body><h2>Ort</h2><p>Campus Center Kiel</p></body></html>`],
      ["https://haw-kiel.venuzle.com/events/121", `<html><body><h2>Ort</h2><p>Campus Center Kiel</p></body></html>`],
    ]);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://haw-kiel.venuzle.com/search/events?v=table") {
        return new Response(pageOneHtml, {
          status: 200,
          headers: {
            "content-type": "text/html",
            "set-cookie": "laravel_session=session-cookie; path=/; HttpOnly",
          },
        });
      }

      if (url === "https://haw-kiel.venuzle.com/livewire-abc123/update") {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual(expect.objectContaining({
          "Content-Type": "application/json",
          "X-Livewire": "true",
          "X-CSRF-TOKEN": "csrf-token-value",
        }));
        return new Response(JSON.stringify(pageTwoResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      const detailHtml = detailByUrl.get(url);
      if (detailHtml) {
        return new Response(detailHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    try {
      const workouts = await scraper.retrieveWorkouts();
      expect(workouts.map((workout) => workout.courseCode)).toEqual([
        "haw-kiel-120",
        "haw-kiel-121",
      ]);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://haw-kiel.venuzle.com/livewire-abc123/update",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });
});
