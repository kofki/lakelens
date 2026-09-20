import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Score } from "./RatingStars";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("Score", () => {
  it("shows a star and a dash when nobody has reviewed the park", () => {
    const out = html(<Score average={null} count={0} />);
    expect(out).toContain("svg");
    expect(out).toContain("\u2013");
    expect(out).toContain("No reviews yet");
  });

  it("treats a rating with no reviews behind it as unrated", () => {
    expect(html(<Score average={4.2} count={0} />)).toContain("No reviews yet");
  });

  it("shows the number once there is a review", () => {
    const out = html(<Score average={4.25} count={3} />);
    expect(out).toContain("4.3");
    expect(out).toContain("(3)");
    expect(out).not.toContain("No reviews yet");
  });

  it("says when sample data is included, for screen readers only", () => {
    expect(html(<Score average={4} count={2} sampleCount={1} />)).toContain("includes sample data");
  });
});
