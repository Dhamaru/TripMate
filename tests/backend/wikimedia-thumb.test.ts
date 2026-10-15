/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TripModel } from "../../shared/schema";
import { fixWikimediaThumbWidths } from "../../server/migrations";
import { connectDB, closeDB } from "../helpers/db";
import { snapWikimediaThumb } from "../../shared/wikimediaThumb";

const thumb = (w: number) =>
  `https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/BeachFun.jpg/${w}px-BeachFun.jpg`;

describe("snapWikimediaThumb", () => {
  it("snaps non-standard widths down to one Wikimedia still serves", () => {
    expect(snapWikimediaThumb(thumb(1200))).toBe(thumb(960));
    expect(snapWikimediaThumb(thumb(800))).toBe(thumb(500));
    expect(snapWikimediaThumb(thumb(400))).toBe(thumb(330));
  });

  it("keeps standard widths, query strings and other hosts unchanged", () => {
    expect(snapWikimediaThumb(thumb(960))).toBe(thumb(960));
    const withQuery = thumb(1200).replace("upload.", "thumb.") + "?utm_source=en.wikipedia.org";
    expect(snapWikimediaThumb(withQuery)).toBe(
      thumb(960).replace("upload.", "thumb.") + "?utm_source=en.wikipedia.org",
    );
    const google = "https://maps.googleapis.com/maps/api/place/photo/800px-x.jpg";
    expect(snapWikimediaThumb(google)).toBe(google);
    expect(snapWikimediaThumb("/api/v1/places/photo?ref=abc")).toBe("/api/v1/places/photo?ref=abc");
  });
});

describe("fixWikimediaThumbWidths migration", () => {
  beforeAll(connectDB);
  afterAll(closeDB);

  it("rewrites only broken Wikimedia covers on existing trips", async () => {
    // Raw insert: legacy documents predate today's schema defaults.
    await TripModel.collection.insertMany([
      { userId: "u1", destination: "Goa", days: 3, groupSize: 1, imageUrl: thumb(1200) },
      { userId: "u1", destination: "Ise", days: 2, groupSize: 1, imageUrl: thumb(960) },
      {
        userId: "u1",
        destination: "Pune",
        days: 2,
        groupSize: 1,
        imageUrl: "/api/v1/places/photo?ref=x",
      },
    ]);
    expect(await fixWikimediaThumbWidths()).toBe("rewrote 1 of 2 Wikimedia trip images");
    const urls = (await TripModel.collection.find({}).toArray()).map((t) => t.imageUrl);
    expect(urls).toEqual([thumb(960), thumb(960), "/api/v1/places/photo?ref=x"]);
  });
});
