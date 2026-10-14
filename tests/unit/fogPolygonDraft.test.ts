import { describe, expect, it } from 'vitest';
import { FogPolygonDraft, fogPolygonHasArea } from '../../src/app/tools/fogPolygonDraft';

describe('fogPolygonHasArea', () => {
  it('rejects three collinear points', () => {
    expect(fogPolygonHasArea([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ])).toBe(false);
  });

  it('accepts a triangle', () => {
    expect(fogPolygonHasArea([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ])).toBe(true);
  });
});

describe('FogPolygonDraft', () => {
  it('places corners and finishes an area as points', () => {
    const draft = new FogPolygonDraft();
    draft.place({ x: 0, y: 0 });
    draft.place({ x: 70, y: 0 });
    draft.place({ x: 0, y: 70 });
    expect(draft.active).toBe(true);
    expect(draft.finish()).toEqual([
      { x: 0, y: 0 },
      { x: 70, y: 0 },
      { x: 0, y: 70 },
    ]);
    expect(draft.active).toBe(false);
  });

  it('does not finish with fewer than three corners or no area', () => {
    const draft = new FogPolygonDraft();
    draft.place({ x: 0, y: 0 });
    draft.place({ x: 10, y: 0 });
    expect(draft.finish()).toBeNull();
    expect(draft.active).toBe(true);

    draft.place({ x: 20, y: 0 });
    expect(draft.finish()).toBeNull();
    expect(draft.points).toHaveLength(3);
  });

  it('closes on a click near the first corner once three corners exist', () => {
    const draft = new FogPolygonDraft();
    draft.place({ x: 0, y: 0 });
    draft.place({ x: 100, y: 0 });
    draft.place({ x: 0, y: 100 });
    expect(draft.closesOn({ x: 2, y: 2 }, 1)).toBe(true);
    expect(draft.closesOn({ x: 50, y: 50 }, 1)).toBe(false);
  });

  it('cancel clears the draft', () => {
    const draft = new FogPolygonDraft();
    draft.place({ x: 0, y: 0 });
    draft.place({ x: 10, y: 0 });
    draft.cancel();
    expect(draft.active).toBe(false);
    expect(draft.outline()).toEqual([]);
  });

  it('outline includes the rubber-band cursor', () => {
    const draft = new FogPolygonDraft();
    draft.place({ x: 0, y: 0 });
    draft.moveCursor({ x: 40, y: 10 });
    expect(draft.outline()).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 10 },
    ]);
  });
});
