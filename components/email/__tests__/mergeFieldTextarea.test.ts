import { describe, it, expect } from "vitest";
import { activeQuery } from "../MergeFieldTextarea";

// caret defaults to end-of-string for these cases
const at = (s: string) => activeQuery(s, s.length);

describe("activeQuery — slash trigger boundary", () => {
  it("fires on a bare slash at start of input", () => {
    expect(at("/")).toEqual({ query: "", start: 0 });
  });

  it("fires after a space", () => {
    expect(at("Hi /")).toEqual({ query: "", start: 3 });
    expect(at("Hi /fir")).toEqual({ query: "fir", start: 3 });
  });

  it("fires at the start of a new line", () => {
    expect(at("line one\n/first")).toEqual({ query: "first", start: 9 });
  });

  it("does NOT fire inside an HTML closing tag", () => {
    expect(at("<td></td>")).toBeNull();
  });

  it("does NOT fire in a URL scheme", () => {
    expect(at("https://")).toBeNull();
  });

  it("does NOT fire in a self-closing tag", () => {
    expect(at("<br/>")).toBeNull();
  });

  it("does NOT fire mid-word", () => {
    expect(at("a/b")).toBeNull();
  });

  it("stops the query at a non-letter so it doesn't span the whole line", () => {
    // caret right after the slash-word, before the space
    expect(activeQuery("say /first then", 10)).toEqual({ query: "first", start: 4 });
  });
});
