import { describe, it, expect } from "vitest";
import { applyPositions, type PointLike, type CollectionLike } from "../src/globe/satellites";

class FakePoint implements PointLike {
  position: unknown = { x: 0, y: 0, z: 0 };
  show = true;
}
class FakeCollection implements CollectionLike {
  points: FakePoint[] = [];
  get(i: number) { return this.points[i]; }
  get length() { return this.points.length; }
}

describe("applyPositions", () => {
  it("writes ECEF positions onto points and hides NaN ones", () => {
    const col = new FakeCollection();
    col.points.push(new FakePoint(), new FakePoint());
    const positions = new Float64Array([100, 200, 300, NaN, NaN, NaN]);

    applyPositions(col, positions, (x, y, z) => ({ x, y, z }));

    expect(col.points[0].position).toEqual({ x: 100, y: 200, z: 300 });
    expect(col.points[0].show).toBe(true);
    expect(col.points[1].show).toBe(false);
  });

  it("hides points whose category is disabled via the enabled predicate", () => {
    const col = new FakeCollection();
    col.points.push(new FakePoint(), new FakePoint());
    const positions = new Float64Array([1, 2, 3, 4, 5, 6]);

    applyPositions(col, positions, (x, y, z) => ({ x, y, z }), (i) => i === 0);

    expect(col.points[0].show).toBe(true);
    expect(col.points[1].show).toBe(false);
  });
});
