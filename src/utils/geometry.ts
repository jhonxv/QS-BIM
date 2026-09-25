import { Point2D, SnapResult, BIMElement, DXFEntity } from '../types/bim';

export function distance(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

export function midpoint(p1: Point2D, p2: Point2D): Point2D {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

export function polygonArea(points: Point2D[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

export function polygonPerimeter(points: Point2D[]): number {
  if (points.length < 2) return 0;
  let perim = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    perim += distance(points[i], points[j]);
  }
  return perim;
}

/**
 * Checks if a point is inside a rectangle defined by two corners (any order)
 */
export function isPointInRect(pt: Point2D, p1: Point2D, p2: Point2D): boolean {
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  return pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY;
}

/**
 * Checks if a line segment intersects or is enclosed by a rectangle
 */
export function isLineInRect(lp1: Point2D, lp2: Point2D, rp1: Point2D, rp2: Point2D): boolean {
  const minX = Math.min(rp1.x, rp2.x);
  const maxX = Math.max(rp1.x, rp2.x);
  const minY = Math.min(rp1.y, rp2.y);
  const maxY = Math.max(rp1.y, rp2.y);

  // If both endpoints inside
  if (isPointInRect(lp1, rp1, rp2) || isPointInRect(lp2, rp1, rp2)) return true;

  // Segment bounding box overlaps rect?
  const lMinX = Math.min(lp1.x, lp2.x);
  const lMaxX = Math.max(lp1.x, lp2.x);
  const lMinY = Math.min(lp1.y, lp2.y);
  const lMaxY = Math.max(lp1.y, lp2.y);

  if (lMaxX < minX || lMinX > maxX || lMaxY < minY || lMinY > maxY) return false;

  // Check line intersection with 4 sides of rectangle
  const rectCorners: [Point2D, Point2D][] = [
    [{ x: minX, y: minY }, { x: maxX, y: minY }],
    [{ x: maxX, y: minY }, { x: maxX, y: maxY }],
    [{ x: maxX, y: maxY }, { x: minX, y: maxY }],
    [{ x: minX, y: maxY }, { x: minX, y: minY }],
  ];

  for (const [s1, s2] of rectCorners) {
    if (linesIntersect(lp1, lp2, s1, s2)) return true;
  }

  return false;
}

function linesIntersect(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): boolean {
  function ccw(A: Point2D, B: Point2D, C: Point2D) {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  }
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

/**
 * Finds closest snap target within pixel tolerance
 */
export function findSnapPoint(
  mouseWorld: Point2D,
  pixelTolerance: number,
  scale: number, // world-to-screen scale factor
  elements: BIMElement[],
  dxfEntities: DXFEntity[]
): SnapResult | null {
  const worldTolerance = pixelTolerance / scale;
  let closest: SnapResult | null = null;
  let minDist = worldTolerance;

  // 1. Check BIM Elements
  for (const el of elements) {
    if (el.type === 'footing' || el.type === 'column') {
      // Center snap
      const centerDist = distance(mouseWorld, { x: el.x, y: el.y });
      if (centerDist < minDist) {
        minDist = centerDist;
        closest = {
          point: { x: el.x, y: el.y },
          type: el.type === 'footing' ? 'footing_center' : 'column_center',
          label: `${el.mark} Center`,
          sourceElementId: el.id,
        };
      }

      // Corner snaps for footing/column
      const hw = (el.type === 'footing' ? el.width : el.width) / 2;
      const hl = (el.type === 'footing' ? el.length : el.depth) / 2;
      const corners: Point2D[] = [
        { x: el.x - hw, y: el.y - hl },
        { x: el.x + hw, y: el.y - hl },
        { x: el.x + hw, y: el.y + hl },
        { x: el.x - hw, y: el.y + hl },
      ];
      for (const corner of corners) {
        const d = distance(mouseWorld, corner);
        if (d < minDist) {
          minDist = d;
          closest = {
            point: corner,
            type: 'endpoint',
            label: `${el.mark} Corner`,
            sourceElementId: el.id,
          };
        }
      }
    } else if (el.type === 'beam' || el.type === 'wall') {
      // Start & End points
      const d1 = distance(mouseWorld, el.startPoint);
      if (d1 < minDist) {
        minDist = d1;
        closest = {
          point: el.startPoint,
          type: 'endpoint',
          label: `${el.mark} End`,
          sourceElementId: el.id,
        };
      }
      const d2 = distance(mouseWorld, el.endPoint);
      if (d2 < minDist) {
        minDist = d2;
        closest = {
          point: el.endPoint,
          type: 'endpoint',
          label: `${el.mark} End`,
          sourceElementId: el.id,
        };
      }
      // Midpoint
      const mid = midpoint(el.startPoint, el.endPoint);
      const dm = distance(mouseWorld, mid);
      if (dm < minDist) {
        minDist = dm;
        closest = {
          point: mid,
          type: 'midpoint',
          label: `${el.mark} Midpoint`,
          sourceElementId: el.id,
        };
      }
    } else if (el.type === 'slab') {
      for (let i = 0; i < el.points.length; i++) {
        const pt = el.points[i];
        const d = distance(mouseWorld, pt);
        if (d < minDist) {
          minDist = d;
          closest = {
            point: pt,
            type: 'endpoint',
            label: `Slab Corner ${i + 1}`,
            sourceElementId: el.id,
          };
        }
      }
    }
  }

  // 2. Check DXF Entities
  // Keep it fast: scan points
  for (const ent of dxfEntities) {
    if (ent.points && ent.points.length > 0) {
      for (const pt of ent.points) {
        const d = distance(mouseWorld, pt);
        if (d < minDist) {
          minDist = d;
          closest = {
            point: pt,
            type: 'endpoint',
            label: `DXF Vertex (${ent.layer})`,
          };
        }
      }
      // If segment, check midpoint
      if (ent.points.length === 2) {
        const mid = midpoint(ent.points[0], ent.points[1]);
        const d = distance(mouseWorld, mid);
        if (d < minDist) {
          minDist = d;
          closest = {
            point: mid,
            type: 'midpoint',
            label: 'DXF Midpoint',
          };
        }
      }
    }
    if (ent.center) {
      const d = distance(mouseWorld, ent.center);
      if (d < minDist) {
        minDist = d;
        closest = {
          point: ent.center,
          type: 'center',
          label: 'DXF Center',
        };
      }
    }
  }

  return closest;
}

export function polygonCentroid(points: Point2D[]): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  points.forEach((p) => {
    cx += p.x;
    cy += p.y;
  });
  return { x: cx / points.length, y: cy / points.length };
}

export function scalePolygon(points: Point2D[], factor: number): Point2D[] {
  if (points.length === 0) return [];
  const c = polygonCentroid(points);
  return points.map((p) => ({
    x: c.x + (p.x - c.x) * factor,
    y: c.y + (p.y - c.y) * factor,
  }));
}

/**
 * Standard Ray-casting algorithm to test if a point is inside a polygon
 */
export function isPointInPolygon(point: Point2D, polygon?: Point2D[]): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

