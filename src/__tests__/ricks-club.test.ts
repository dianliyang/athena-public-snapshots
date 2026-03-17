import { describe, expect, test } from "vitest";
import type { WorkoutCourse } from "../lib/scrapers/cau-sport";
import { RicksClub } from "../lib/scrapers/ricks-club";

describe("RicksClub.parseWorkouts", () => {
  test("uses opening hours for schedules and stores pricing details in description.price", () => {
    const scraper = new RicksClub();
    const html = `
      <html>
        <head>
          <title>Ricks Club | Bowling Club Kiel | Holtenauer Straße 279, Kiel, Germany</title>
        </head>
        <body>
          <div data-testid="richTextElement"><h6>Rick's Club</h6></div>
          <div data-testid="richTextElement"><h6>Closed</h6></div>
          <div data-testid="richTextElement"><h6>17:00 - 22:00</h6></div>
          <div data-testid="richTextElement"><h6>17:00 - 23:00</h6></div>
          <div data-testid="richTextElement"><h6>17:00 - 23:00</h6></div>
          <div data-testid="richTextElement"><h6>17:00 - 00:00</h6></div>
          <div data-testid="richTextElement"><h6>14:00 - 00:00</h6></div>
          <div data-testid="richTextElement"><h6>Closed</h6></div>

          <div data-testid="richTextElement"><h6>Billard</h6></div>
          <div data-testid="richTextElement"><h6>Geschlossen</h6></div>
          <div data-testid="richTextElement"><h6>je 30 Min. pro Tisch</h6></div>
          <div data-testid="richTextElement"><h6>7,00€</h6></div>
          <div data-testid="richTextElement"><h6>je 30 Min. pro Tisch</h6></div>
          <div data-testid="richTextElement"><h6>7,00€</h6></div>
          <div data-testid="richTextElement"><h6>je 30 Min. pro Tisch</h6></div>
          <div data-testid="richTextElement"><h6>7,00€</h6></div>
          <div data-testid="richTextElement"><h6>Geschlossen</h6></div>
          <div data-testid="richTextElement"><h6>je 30 Min. pro Tisch</h6></div>
          <div data-testid="richTextElement"><h6>7,50€</h6></div>
          <div data-testid="richTextElement"><h6>je 30 Min. pro Tisch</h6></div>
          <div data-testid="richTextElement"><h6>7,50€</h6></div>

          <div data-testid="richTextElement"><h6>Steeldart</h6></div>
          <div data-testid="richTextElement"><h6>gegen</h6></div>
          <div data-testid="richTextElement"><h6>Getränke frei</h6></div>
          <div data-testid="richTextElement"><h6>Geschlossen</h6></div>
          <div data-testid="richTextElement"><h6>gegen</h6></div>
          <div data-testid="richTextElement"><h6>Getränke frei</h6></div>
          <div data-testid="richTextElement"><h6>gegen</h6></div>
          <div data-testid="richTextElement"><h6>Getränke frei</h6></div>
          <div data-testid="richTextElement"><h6>Geschlossen</h6></div>
          <div data-testid="richTextElement"><h6>gegen</h6></div>
          <div data-testid="richTextElement"><h6>Getränke frei</h6></div>
          <div data-testid="richTextElement"><h6>gegen</h6></div>
          <div data-testid="richTextElement"><h6>Getränke frei</h6></div>

          <div data-testid="richTextElement"><h6>Bowling</h6></div>
          <div data-testid="richTextElement"><h6>je 30 Min. pro Bahn</h6></div>
          <div data-testid="richTextElement"><h6>12,50€</h6></div>
          <div data-testid="richTextElement"><h6>Geschlossen</h6></div>
          <div data-testid="richTextElement"><h6>je 30 Min. pro Bahn</h6></div>
          <div data-testid="richTextElement"><h6>12,50€</h6></div>
          <div data-testid="richTextElement"><h6>je 30 Min. pro Bahn</h6></div>
          <div data-testid="richTextElement"><h6>12,50€</h6></div>
          <div data-testid="richTextElement"><h6>Geschlossen</h6></div>
          <div data-testid="richTextElement"><h6>je 30 Min. pro Bahn</h6></div>
          <div data-testid="richTextElement"><h6>15,00€</h6></div>
          <div data-testid="richTextElement"><h6>je 30 Min. pro Bahn</h6></div>
          <div data-testid="richTextElement"><h6>15,00€</h6></div>

          <div data-testid="richTextElement"><h6>Montag</h6></div>
          <div data-testid="richTextElement"><h6>Dienstag</h6></div>
          <div data-testid="richTextElement"><h6>Mittwoch</h6></div>
          <div data-testid="richTextElement"><h6>Donnerstag</h6></div>
          <div data-testid="richTextElement"><h6>Freitag</h6></div>
          <div data-testid="richTextElement"><h6>Samstag</h6></div>
          <div data-testid="richTextElement"><h6>Sonntag</h6></div>

          <div data-testid="richTextElement">
            <h6>Bowling spielen ist im Ricks Club möglich. Der Ricks Club besitzt insgesamt 12 Bowlingbahnen.</h6>
          </div>
          <div data-testid="richTextElement">
            <h6>Im Ricks Club könnt ihr an 12 Billardtischen in gemütlicher Atmosphäre spielen.</h6>
          </div>
          <div data-testid="richTextElement">
            <h6>Im Ricks Club freuen wir uns immer über Darts-Spieler an 4 Steeldartscheiben.</h6>
          </div>
          <div data-testid="richTextElement"><h6>Leihschuhe: 2,50€ pro Person;</h6></div>
          <div data-testid="richTextElement"><h6>Die Mindestbuchungsdauer beträgt 1,5 Stunden;</h6></div>
          <div data-testid="richTextElement"><h6>*Feiertags gesonderte Preise wie Wochenende</h6></div>
        </body>
      </html>
    `;

    const workouts = scraper.parseWorkouts(html, "https://www.ricksclub.de/");

    expect(workouts.find((workout) => workout.title === "Billard")?.schedule).toEqual([
      { day: "Montag", time: "Closed", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Dienstag", time: "17:00 - 22:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Mittwoch", time: "17:00 - 23:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Donnerstag", time: "17:00 - 23:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Freitag", time: "17:00 - 00:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Samstag", time: "14:00 - 00:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Sonntag", time: "Closed", location: "Holtenauer Straße 279, Kiel, Germany" },
    ]);

    expect(workouts.find((workout) => workout.title === "Steeldart")?.schedule).toEqual([
      { day: "Montag", time: "Closed", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Dienstag", time: "17:00 - 22:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Mittwoch", time: "17:00 - 23:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Donnerstag", time: "17:00 - 23:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Freitag", time: "17:00 - 00:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Samstag", time: "14:00 - 00:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Sonntag", time: "Closed", location: "Holtenauer Straße 279, Kiel, Germany" },
    ]);

    expect(workouts.find((workout) => workout.title === "Bowling")?.schedule).toEqual([
      { day: "Montag", time: "Closed", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Dienstag", time: "17:00 - 22:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Mittwoch", time: "17:00 - 23:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Donnerstag", time: "17:00 - 23:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Freitag", time: "17:00 - 00:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Samstag", time: "14:00 - 00:00", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Sonntag", time: "Closed", location: "Holtenauer Straße 279, Kiel, Germany" },
    ]);

    expect(workouts.find((workout) => workout.title === "Billard")?.description?.price).toBe(
      "7,00€ - 7,50€ pro 30 Min. pro Tisch",
    );
    expect(workouts.find((workout) => workout.title === "Steeldart")?.description?.price).toBe(
      "gegen Getränke frei",
    );
    expect(workouts.find((workout) => workout.title === "Bowling")?.description?.price).toBe(
      "12,50€ - 15,00€ pro 30 Min. pro Bahn\nLeihschuhe: 2,50€ pro Person\nDie Mindestbuchungsdauer beträgt 1,5 Stunden\nFeiertags gesonderte Preise wie Wochenende",
    );
  });

  test("uses the scoped pricing container when activity titles repeat elsewhere on the page", () => {
    const scraper = new RicksClub();
    const html = `
      <html>
        <head>
          <title>Ricks Club | Bowling Club Kiel | Holtenauer Straße 279, Kiel, Germany</title>
        </head>
        <body>
          <div id="marketing-copy">
            <div data-testid="richTextElement"><h5>Bowling</h5></div>
            <div data-testid="richTextElement"><h6>Teaser text that should not be read as schedule data.</h6></div>
          </div>

          <div id="pricing-grid">
            <div class="activity-card">
              <div data-testid="richTextElement"><h6>Billard</h6></div>
              <div data-testid="richTextElement"><h6>Geschlossen</h6></div>
              <div class="slot">
                <div data-testid="richTextElement"><h6>je 30 Min. pro Tisch</h6></div>
                <div data-testid="richTextElement"><h6>7,00€</h6></div>
              </div>
              <div class="slot">
                <div data-testid="richTextElement"><h6>je 30 Min. pro Tisch</h6></div>
                <div data-testid="richTextElement"><h6>7,00€</h6></div>
              </div>
              <div class="slot">
                <div data-testid="richTextElement"><h6>je 30 Min. pro Tisch</h6></div>
                <div data-testid="richTextElement"><h6>7,00€</h6></div>
              </div>
              <div data-testid="richTextElement"><h6>Geschlossen</h6></div>
              <div class="slot">
                <div data-testid="richTextElement"><h6>je 30 Min. pro Tisch</h6></div>
                <div data-testid="richTextElement"><h6>7,50€</h6></div>
              </div>
              <div class="slot">
                <div data-testid="richTextElement"><h6>je 30 Min. pro Tisch</h6></div>
                <div data-testid="richTextElement"><h6>7,50€</h6></div>
              </div>
            </div>

            <div class="activity-card">
              <div data-testid="richTextElement"><h6>Steeldart</h6></div>
              <div data-testid="richTextElement"><h6>gegen<br />Getränke frei</h6></div>
              <div data-testid="richTextElement"><h6>Geschlossen</h6></div>
              <div data-testid="richTextElement"><h6>gegen<br />Getränke frei</h6></div>
              <div data-testid="richTextElement"><h6>gegen<br />Getränke frei</h6></div>
              <div data-testid="richTextElement"><h6>Geschlossen</h6></div>
              <div data-testid="richTextElement"><h6>gegen<br />Getränke frei</h6></div>
              <div data-testid="richTextElement"><h6>gegen<br />Getränke frei</h6></div>
            </div>

            <div class="activity-card">
              <div data-testid="richTextElement"><h6>Bowling</h6></div>
              <div class="slot">
                <div data-testid="richTextElement"><h6>je 30 Min. pro Bahn</h6></div>
                <div data-testid="richTextElement"><h6>12,50€</h6></div>
              </div>
              <div data-testid="richTextElement"><h6>Geschlossen</h6></div>
              <div class="slot">
                <div data-testid="richTextElement"><h6>je 30 Min. pro Bahn</h6></div>
                <div data-testid="richTextElement"><h6>12,50€</h6></div>
              </div>
              <div class="slot">
                <div data-testid="richTextElement"><h6>je 30 Min. pro Bahn</h6></div>
                <div data-testid="richTextElement"><h6>12,50€</h6></div>
              </div>
              <div data-testid="richTextElement"><h6>Geschlossen</h6></div>
              <div class="slot">
                <div data-testid="richTextElement"><h6>je 30 Min. pro Bahn</h6></div>
                <div data-testid="richTextElement"><h6>15,00€</h6></div>
              </div>
              <div class="slot">
                <div data-testid="richTextElement"><h6>je 30 Min. pro Bahn</h6></div>
                <div data-testid="richTextElement"><h6>15,00€</h6></div>
              </div>
            </div>

            <div class="weekday-row">
              <div data-testid="richTextElement"><h6>Montag</h6></div>
              <div data-testid="richTextElement"><h6>Dienstag</h6></div>
              <div data-testid="richTextElement"><h6>Mittwoch</h6></div>
              <div data-testid="richTextElement"><h6>Donnerstag</h6></div>
              <div data-testid="richTextElement"><h6>Freitag</h6></div>
              <div data-testid="richTextElement"><h6>Samstag</h6></div>
              <div data-testid="richTextElement"><h6>Sonntag</h6></div>
            </div>
          </div>

          <div data-testid="richTextElement"><h6>Bowling spielen ist im Ricks Club möglich. Der Ricks Club besitzt insgesamt 12 Bowlingbahnen.</h6></div>
          <div data-testid="richTextElement"><h6>Im Ricks Club könnt ihr an 12 Billardtischen in gemütlicher Atmosphäre spielen.</h6></div>
          <div data-testid="richTextElement"><h6>Im Ricks Club freuen wir uns immer über Darts-Spieler an 4 Steeldartscheiben.</h6></div>
        </body>
      </html>
    `;

    const workouts = scraper.parseWorkouts(html, "https://www.ricksclub.de/");
    const bowling = workouts.find((workout) => workout.title === "Bowling");

    expect(bowling?.schedule).toEqual([
      { day: "Montag", time: "je 30 Min. pro Bahn: 12,50€", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Dienstag", time: "Geschlossen", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Mittwoch", time: "je 30 Min. pro Bahn: 12,50€", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Donnerstag", time: "je 30 Min. pro Bahn: 12,50€", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Freitag", time: "Geschlossen", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Samstag", time: "je 30 Min. pro Bahn: 15,00€", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Sonntag", time: "je 30 Min. pro Bahn: 15,00€", location: "Holtenauer Straße 279, Kiel, Germany" },
    ]);
  });

  test("orders shared-grid steeldart slots by left position", () => {
    const scraper = new RicksClub();
    const html = `
      <html>
        <head>
          <title>Ricks Club | Bowling Club Kiel | Holtenauer Straße 279, Kiel, Germany</title>
          <style>
            [id="steeldart-title"] { left: 5px; }
            [id="steeldart-mon"] { left: 142px; }
            [id="steeldart-tue"] { left: 239px; }
            [id="steeldart-wed"] { left: 340px; }
            [id="steeldart-thu"] { left: 445px; }
            [id="steeldart-fri"] { left: 547px; }
            [id="steeldart-sat"] { left: 637px; }
            [id="steeldart-sun"] { left: 727px; }
          </style>
        </head>
        <body>
          <div data-testid="mesh-container-content">
            <div id="steeldart-title" data-testid="richTextElement"><h6>Steeldart</h6></div>
            <div id="steeldart-mon" data-testid="richTextElement"><h6>Geschlossen</h6></div>
            <div id="steeldart-tue" data-testid="richTextElement"><h6>gegen<br />Getränke frei</h6></div>
            <div id="steeldart-wed" data-testid="richTextElement"><h6>gegen<br />Getränke frei</h6></div>
            <div id="steeldart-thu" data-testid="richTextElement"><h6>gegen<br />Getränke frei</h6></div>
            <div id="steeldart-fri" data-testid="richTextElement"><h6>gegen<br />Getränke frei</h6></div>
            <div id="steeldart-sat" data-testid="richTextElement"><h6>gegen<br />Getränke frei</h6></div>
            <div id="steeldart-sun" data-testid="richTextElement"><h6>Geschlossen</h6></div>
          </div>

          <div data-testid="richTextElement"><h6>Montag</h6></div>
          <div data-testid="richTextElement"><h6>Dienstag</h6></div>
          <div data-testid="richTextElement"><h6>Mittwoch</h6></div>
          <div data-testid="richTextElement"><h6>Donnerstag</h6></div>
          <div data-testid="richTextElement"><h6>Freitag</h6></div>
          <div data-testid="richTextElement"><h6>Samstag</h6></div>
          <div data-testid="richTextElement"><h6>Sonntag</h6></div>

          <div data-testid="richTextElement"><h6>Bowling spielen ist im Ricks Club möglich. Der Ricks Club besitzt insgesamt 12 Bowlingbahnen.</h6></div>
          <div data-testid="richTextElement"><h6>Im Ricks Club könnt ihr an 12 Billardtischen in gemütlicher Atmosphäre spielen.</h6></div>
          <div data-testid="richTextElement"><h6>Im Ricks Club freuen wir uns immer über Darts-Spieler an 4 Steeldartscheiben.</h6></div>
        </body>
      </html>
    `;

    const workouts = scraper.parseWorkouts(html, "https://www.ricksclub.de/");

    expect(workouts.find((workout) => workout.title === "Steeldart")?.schedule).toEqual([
      { day: "Montag", time: "Geschlossen", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Dienstag", time: "gegen Getränke frei", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Mittwoch", time: "gegen Getränke frei", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Donnerstag", time: "gegen Getränke frei", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Freitag", time: "gegen Getränke frei", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Samstag", time: "gegen Getränke frei", location: "Holtenauer Straße 279, Kiel, Germany" },
      { day: "Sonntag", time: "Geschlossen", location: "Holtenauer Straße 279, Kiel, Germany" },
    ]);
  });

  test("extracts three activities from the live wix rich-text structure", () => {
    const scraper = new RicksClub();
    const sharedLocation = "Holtenauer Straße 279, Kiel, Germany";
    const html = `
      <html>
        <head>
          <title>Ricks Club | Bowling Club Kiel | ${sharedLocation}</title>
          <meta
            name="description"
            content="Taucht ein in unsere aufregende Welt des Sports und der Unterhaltung! Ob groß oder klein, ob ein geübter Spieler oder ein Neuling, wenn du einfach Spaß haben willst, ist der Ricks Club die erste Adresse in Kiel für alle Liebhaber von Bowling, Billard, Darts und vielem mehr."
          />
        </head>
        <body>
          <a href="https://www.ricksclub.de/jetzt-buchen">Termin buchen</a>

          <div data-testid="richTextElement"><h1>Ricks Club</h1></div>
          <div data-testid="richTextElement"><h5>Unsere Öffnungszeiten</h5></div>

          <div data-testid="richTextElement"><h6>Billard</h6></div>
          <div data-testid="richTextElement"><h6>je 30 Min. pro Tisch</h6></div>
          <div data-testid="richTextElement"><h6>7,00€</h6></div>
          <div data-testid="richTextElement"><h6>je 30 Min. pro Tisch</h6></div>
          <div data-testid="richTextElement"><h6>7,50€</h6></div>

          <div data-testid="richTextElement"><h5>BOWLING</h5></div>
          <div data-testid="richTextElement"><h5>Für klein und GROSS</h5></div>
          <div data-testid="richTextElement">
            <h6>
              Bowling spielen ist im Ricks Club - dank der vollautomatischen Computersteuerung -
              ohne jegliche Vorkenntnisse möglich. Durch unser Scoringsystem können bis zu 6
              Personen auf einer Bowlingbahn miteinander spielen. Der Ricks Club besitzt insgesamt
              12 Bowlingbahnen.
            </h6>
          </div>

          <div data-testid="richTextElement"><h5>Dartprofi</h5></div>
          <div data-testid="richTextElement"><h5>Mit uns zum</h5></div>
          <div data-testid="richTextElement">
            <h6>
              Im Ricks Club freuen wir uns immer über Darts-Spieler, ganz egal ob als Anfänger,
              als Profi, im Verein, in der Gruppe, mit Freunden oder der Familie. An 9
              E-Dartautomaten und 4 Steeldartscheiben bieten wir dir Dartspielen in einer
              gemütlichen und geselligen Atmosphäre.
            </h6>
          </div>

          <div data-testid="richTextElement"><h5>...Los!</h5></div>
          <div data-testid="richTextElement"><h5>...Auf die Bälle, ...Fertig,</h5></div>
          <div data-testid="richTextElement">
            <h6>
              Im Ricks Club könnt ihr an 12 Billardtischen in gemütlicher Atmosphäre erste
              Erfahrungen sammeln, eure bereits vorhandenen Fähigkeiten ausbauen und die Zeit mit
              euren Freunden und der Familie genießen.
            </h6>
          </div>
        </body>
      </html>
    `;

    const workouts = scraper.parseWorkouts(html, "https://www.ricksclub.de/") as Array<
      WorkoutCourse & { provider: string }
    >;

    expect(workouts).toHaveLength(3);
    expect(workouts.map((workout) => workout.title)).toEqual(["Bowling", "Billard", "Steeldart"]);

    workouts.forEach((workout) => {
      expect(workout.provider).toBe("Ricks Club");
      expect(workout.location).toEqual([sharedLocation]);
    });

    const expectations = new Map(
      [
        {
          title: "Bowling",
          description:
            "Bowling spielen ist im Ricks Club - dank der vollautomatischen Computersteuerung - ohne jegliche Vorkenntnisse möglich. Durch unser Scoringsystem können bis zu 6 Personen auf einer Bowlingbahn miteinander spielen. Der Ricks Club besitzt insgesamt 12 Bowlingbahnen.",
          pricing: undefined,
        },
        {
          title: "Billard",
          description:
            "Im Ricks Club könnt ihr an 12 Billardtischen in gemütlicher Atmosphäre erste Erfahrungen sammeln, eure bereits vorhandenen Fähigkeiten ausbauen und die Zeit mit euren Freunden und der Familie genießen.",
          pricing: "7,00€ - 7,50€ pro 30 Min. pro Tisch",
        },
        {
          title: "Steeldart",
          description:
            "Im Ricks Club freuen wir uns immer über Darts-Spieler, ganz egal ob als Anfänger, als Profi, im Verein, in der Gruppe, mit Freunden oder der Familie. An 9 E-Dartautomaten und 4 Steeldartscheiben bieten wir dir Dartspielen in einer gemütlichen und geselligen Atmosphäre.",
          pricing: undefined,
        },
      ].map((entry) => [entry.title, entry] as const),
    );

    workouts.forEach((workout) => {
      const expected = expectations.get(workout.title);
      expect(expected).toBeDefined();
      expect(workout.description?.general).toBe(expected?.description);
      expect(workout.description?.price).toBe(expected?.pricing);
    });

    expect(workouts.find((workout) => workout.title === "Billard")?.price).toMatchObject({
      adults: 7,
    });
  });
});
