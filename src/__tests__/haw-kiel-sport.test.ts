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
