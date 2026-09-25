import { BIMElement, FootingElement, ColumnElement, BeamElement, SlabElement, Point2D } from '../types/bim';

function dist2D(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

export interface StructuralLinkResult {
  elements: BIMElement[];
  summary: {
    linkedColumns: number;
    linkedBeams: number;
    linkedSlabs: number;
  };
}

/**
 * Automatically detects spatial relationships and links:
 * 1. Columns above Footings (aligns base elevation to footing top: elevation + depth)
 * 2. Beams between Columns (snaps start/end points to column centers and aligns elevation to column top)
 * 3. Slabs above Beams / Column tops
 */
export function autoLinkStructuralHierarchy(
  elements: BIMElement[],
  snapPositions: boolean = true
): StructuralLinkResult {
  const footings = elements.filter((e): e is FootingElement => e.type === 'footing');
  let columns = elements.filter((e): e is ColumnElement => e.type === 'column');
  let beams = elements.filter((e): e is BeamElement => e.type === 'beam');
  let slabs = elements.filter((e): e is SlabElement => e.type === 'slab');
  const others = elements.filter((e) => e.type !== 'column' && e.type !== 'beam' && e.type !== 'slab');

  let linkedColumns = 0;
  let linkedBeams = 0;
  let linkedSlabs = 0;

  // 1. Link Columns above Footings
  columns = columns.map((col) => {
    // Find closest footing within reasonable radius or footprint
    let bestFooting: FootingElement | null = null;
    let minDist = Infinity;

    for (const f of footings) {
      const d = dist2D({ x: col.x, y: col.y }, { x: f.x, y: f.y });
      const maxFootprint = Math.max(f.width, f.length) / 2 + 0.3;
      if (d <= maxFootprint && d < minDist) {
        minDist = d;
        bestFooting = f;
      }
    }

    if (bestFooting) {
      linkedColumns++;
      const footingTop = (bestFooting.elevation || 0) + (bestFooting.depth || 0.6);
      return {
        ...col,
        footingId: bestFooting.id,
        baseElevation: Math.round(footingTop * 100) / 100,
        // Optionally center column on footing if very close (< 0.4m)
        x: snapPositions && minDist < 0.45 ? bestFooting.x : col.x,
        y: snapPositions && minDist < 0.45 ? bestFooting.y : col.y,
      };
    }

    return col;
  });

  // 2. Link Beams between Columns
  beams = beams.map((beam) => {
    let startCol: ColumnElement | null = null;
    let endCol: ColumnElement | null = null;
    let minStartDist = Infinity;
    let minEndDist = Infinity;

    for (const col of columns) {
      const dStart = dist2D(beam.startPoint, { x: col.x, y: col.y });
      if (dStart < 0.9 && dStart < minStartDist) {
        minStartDist = dStart;
        startCol = col;
      }
      const dEnd = dist2D(beam.endPoint, { x: col.x, y: col.y });
      if (dEnd < 0.9 && dEnd < minEndDist) {
        minEndDist = dEnd;
        endCol = col;
      }
    }

    if (startCol || endCol) {
      linkedBeams++;
      const topColElev = Math.max(
        startCol ? (startCol.baseElevation || 0) + (startCol.height || 3.0) : 3.2,
        endCol ? (endCol.baseElevation || 0) + (endCol.height || 3.0) : 3.2
      );

      return {
        ...beam,
        startColumnId: startCol ? startCol.id : beam.startColumnId,
        endColumnId: endCol ? endCol.id : beam.endColumnId,
        startPoint: snapPositions && startCol ? { x: startCol.x, y: startCol.y } : beam.startPoint,
        endPoint: snapPositions && endCol ? { x: endCol.x, y: endCol.y } : beam.endPoint,
        elevation: Math.round(topColElev * 100) / 100,
      };
    }

    return beam;
  });

  // 3. Link Slabs above Beams & Column Tops
  slabs = slabs.map((slab) => {
    // Find supporting beams or columns that fall within the slab bounding box or perimeter
    const supportingBeams = beams.filter((b) => {
      const midX = (b.startPoint.x + b.endPoint.x) / 2;
      const midY = (b.startPoint.y + b.endPoint.y) / 2;
      return isPointInPolygon({ x: midX, y: midY }, slab.points);
    });

    if (supportingBeams.length > 0) {
      linkedSlabs++;
      const maxBeamElev = Math.max(...supportingBeams.map((b) => b.elevation || 3.2));
      return {
        ...slab,
        supportingBeamIds: supportingBeams.map((b) => b.id),
        elevation: Math.round(maxBeamElev * 100) / 100,
      };
    }

    return slab;
  });

  return {
    elements: [...others, ...footings, ...columns, ...beams, ...slabs],
    summary: {
      linkedColumns,
      linkedBeams,
      linkedSlabs,
    },
  };
}

/**
 * Propagates changes (e.g. footing moved or resized, column moved or height changed)
 * to downstream linked elements.
 */
export function propagateStructuralLinkChanges(
  elements: BIMElement[],
  changedElement: BIMElement,
  previousElement?: BIMElement
): BIMElement[] {
  // If a footing changed elevation, depth, or position
  if (changedElement.type === 'footing') {
    const fTop = (changedElement.elevation || 0) + (changedElement.depth || 0.6);
    const dx = previousElement && 'x' in previousElement ? changedElement.x - previousElement.x : 0;
    const dy = previousElement && 'y' in previousElement ? changedElement.y - previousElement.y : 0;

    return elements.map((el) => {
      if (el.id === changedElement.id) return changedElement;
      if (el.type === 'column' && el.footingId === changedElement.id) {
        return {
          ...el,
          baseElevation: Math.round(fTop * 100) / 100,
          x: dx !== 0 ? el.x + dx : el.x,
          y: dy !== 0 ? el.y + dy : el.y,
        };
      }
      return el;
    });
  }

  // If a column changed position, height, or baseElevation
  if (changedElement.type === 'column') {
    const colTop = (changedElement.baseElevation || 0) + (changedElement.height || 3.0);

    return elements.map((el) => {
      if (el.id === changedElement.id) return changedElement;
      if (el.type === 'beam') {
        let updated = false;
        let newStart = el.startPoint;
        let newEnd = el.endPoint;
        let newElev = el.elevation;

        if (el.startColumnId === changedElement.id) {
          newStart = { x: changedElement.x, y: changedElement.y };
          newElev = colTop;
          updated = true;
        }
        if (el.endColumnId === changedElement.id) {
          newEnd = { x: changedElement.x, y: changedElement.y };
          newElev = colTop;
          updated = true;
        }

        if (updated) {
          return {
            ...el,
            startPoint: newStart,
            endPoint: newEnd,
            elevation: Math.round(newElev * 100) / 100,
          };
        }
      }
      return el;
    });
  }

  return elements.map((el) => (el.id === changedElement.id ? changedElement : el));
}

function isPointInPolygon(point: Point2D, vs: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x,
      yi = vs[i].y;
    const xj = vs[j].x,
      yj = vs[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
