import DxfParser from 'dxf-parser';
import { DXFEntity, DXFLayer, Point2D } from '../types/bim';

export interface ParsedDXFData {
  entities: DXFEntity[];
  layers: DXFLayer[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
  suggestedScaleUnit: 'm' | 'mm' | 'cm' | 'in';
}

const LAYER_COLORS: Record<string, string> = {
  GRID: '#38bdf8',       // cyan
  AXIS: '#38bdf8',
  FOOTING: '#fb923c',    // orange
  FOUNDATION: '#fb923c',
  COLUMN: '#f87171',     // red
  COLUMNS: '#f87171',
  WALL: '#94a3b8',       // slate
  WALLS: '#94a3b8',
  BEAM: '#818cf8',       // indigo
  BEAMS: '#818cf8',
  SLAB: '#34d399',       // emerald
  DIM: '#fbbf24',        // amber
  DIMENSION: '#fbbf24',
  TEXT: '#e2e8f0',       // white
  DEFAULT: '#64748b',
};

export function parseDXFString(dxfText: string): ParsedDXFData {
  const parser = new DxfParser();
  let parsed: any;

  try {
    parsed = parser.parseSync(dxfText);
  } catch (err) {
    console.error('DXF Parser Error, attempting fallback line-by-line:', err);
    return parseSimpleDXFFallback(dxfText);
  }

  const entities: DXFEntity[] = [];
  const layerMap: Record<string, DXFLayer> = {};

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function updateBounds(pt: Point2D) {
    if (!isFinite(pt.x) || !isFinite(pt.y)) return;
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x);
    maxY = Math.max(maxY, pt.y);
  }

  if (parsed && parsed.entities) {
    parsed.entities.forEach((ent: any, idx: number) => {
      const layerName = (ent.layer || '0').toUpperCase();
      if (!layerMap[layerName]) {
        const color = LAYER_COLORS[layerName] || LAYER_COLORS.DEFAULT;
        layerMap[layerName] = { name: layerName, color, visible: true };
      }

      if (ent.type === 'LINE' && ent.vertices && ent.vertices.length >= 2) {
        const p1 = { x: ent.vertices[0].x, y: ent.vertices[0].y };
        const p2 = { x: ent.vertices[1].x, y: ent.vertices[1].y };
        updateBounds(p1);
        updateBounds(p2);
        entities.push({
          id: `dxf-${idx}`,
          type: 'LINE',
          layer: layerName,
          points: [p1, p2],
          color: layerMap[layerName].color,
        });
      } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices) {
        const pts: Point2D[] = ent.vertices.map((v: any) => {
          const pt = { x: v.x, y: v.y };
          updateBounds(pt);
          return pt;
        });
        if (ent.shape || ent.isClosed) {
          if (pts.length > 2) {
            pts.push({ ...pts[0] });
          }
        }
        entities.push({
          id: `dxf-${idx}`,
          type: 'LWPOLYLINE',
          layer: layerName,
          points: pts,
          color: layerMap[layerName].color,
        });
      } else if (ent.type === 'CIRCLE' && ent.center) {
        const c = { x: ent.center.x, y: ent.center.y };
        const r = ent.radius || 1;
        updateBounds({ x: c.x - r, y: c.y - r });
        updateBounds({ x: c.x + r, y: c.y + r });
        entities.push({
          id: `dxf-${idx}`,
          type: 'CIRCLE',
          layer: layerName,
          center: c,
          radius: r,
          points: [],
          color: layerMap[layerName].color,
        });
      } else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
        const pos = ent.startPoint || ent.position || { x: 0, y: 0 };
        const pt = { x: pos.x, y: pos.y };
        updateBounds(pt);
        entities.push({
          id: `dxf-${idx}`,
          type: 'TEXT',
          layer: layerName,
          points: [pt],
          text: ent.text || ent.string || '',
          color: layerMap[layerName].color,
        });
      }
    });
  }

  // Handle empty bounds edge case
  if (!isFinite(minX) || !isFinite(maxX)) {
    minX = 0;
    minY = 0;
    maxX = 20;
    maxY = 20;
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Determine probable scale unit: if drawing width > 500, it's likely millimeters!
  let suggestedScaleUnit: 'm' | 'mm' | 'cm' | 'in' = 'm';
  if (width > 500) {
    suggestedScaleUnit = 'mm';
  } else if (width > 50) {
    suggestedScaleUnit = 'cm';
  }

  return {
    entities,
    layers: Object.values(layerMap),
    bounds: { minX, minY, maxX, maxY, width, height, centerX, centerY },
    suggestedScaleUnit,
  };
}

function parseSimpleDXFFallback(text: string): ParsedDXFData {
  // Simple fallback if dxf-parser throws on malformed entities
  const lines = text.split(/\r?\n/);
  const entities: DXFEntity[] = [];
  let currentLayer = '0';
  let minX = 0, minY = 0, maxX = 20, maxY = 20;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '8') {
      currentLayer = (lines[i + 1] || '0').trim().toUpperCase();
      i++;
    }
  }

  return {
    entities,
    layers: [{ name: '0', color: '#64748b', visible: true }],
    bounds: { minX: 0, minY: 0, maxX: 20, maxY: 20, width: 20, height: 20, centerX: 10, centerY: 10 },
    suggestedScaleUnit: 'm',
  };
}

/**
 * Creates a professional, realistic structural engineering foundation & grid DXF plan
 * (in standard meters scale, with 4x3 grid bays, 12 isolated footings, column center points,
 * tie beams, shear walls, and dimension lines).
 */
export function generateSampleStructuralDXF(): ParsedDXFData {
  const entities: DXFEntity[] = [];
  const layers: DXFLayer[] = [
    { name: 'GRID', color: '#0284c7', visible: true },
    { name: 'FOOTINGS', color: '#ea580c', visible: true },
    { name: 'COLUMNS', color: '#dc2626', visible: true },
    { name: 'WALLS', color: '#64748b', visible: true },
    { name: 'BEAMS', color: '#4f46e5', visible: true },
    { name: 'DIMENSIONS', color: '#d97706', visible: true },
    { name: 'TEXT', color: '#f8fafc', visible: true },
  ];

  let idCounter = 1;
  const nextId = () => `sample-${idCounter++}`;

  // Grid coordinates (in meters: 0 to 18m along X, 0 to 12m along Y)
  const xGrids = [0, 6, 12, 18];
  const yGrids = [0, 6, 12];
  const xLabels = ['A', 'B', 'C', 'D'];
  const yLabels = ['1', '2', '3'];

  // 1. Grid Lines (Vertical & Horizontal with extension bubbles)
  const ext = 2.0;
  xGrids.forEach((x, i) => {
    // Vertical grid line
    entities.push({
      id: nextId(),
      type: 'LINE',
      layer: 'GRID',
      color: '#0284c7',
      points: [{ x, y: -ext }, { x, y: 12 + ext }],
    });
    // Top bubble
    entities.push({
      id: nextId(),
      type: 'CIRCLE',
      layer: 'GRID',
      color: '#0284c7',
      center: { x, y: 12 + ext + 0.6 },
      radius: 0.6,
      points: [],
    });
    entities.push({
      id: nextId(),
      type: 'TEXT',
      layer: 'TEXT',
      color: '#f8fafc',
      points: [{ x: x - 0.2, y: 12 + ext + 0.5 }],
      text: xLabels[i],
    });
  });

  yGrids.forEach((y, i) => {
    // Horizontal grid line
    entities.push({
      id: nextId(),
      type: 'LINE',
      layer: 'GRID',
      color: '#0284c7',
      points: [{ x: -ext, y }, { x: 18 + ext, y }],
    });
    // Left bubble
    entities.push({
      id: nextId(),
      type: 'CIRCLE',
      layer: 'GRID',
      color: '#0284c7',
      center: { x: -ext - 0.6, y },
      radius: 0.6,
      points: [],
    });
    entities.push({
      id: nextId(),
      type: 'TEXT',
      layer: 'TEXT',
      color: '#f8fafc',
      points: [{ x: -ext - 0.8, y: y - 0.2 }],
      text: yLabels[i],
    });
  });

  // 2. Footings outline (2.0m x 2.0m at each grid intersection)
  const fw = 2.0;
  const fl = 2.0;
  xGrids.forEach((x, xi) => {
    yGrids.forEach((y, yi) => {
      // Footing box
      const p1 = { x: x - fw / 2, y: y - fl / 2 };
      const p2 = { x: x + fw / 2, y: y - fl / 2 };
      const p3 = { x: x + fw / 2, y: y + fl / 2 };
      const p4 = { x: x - fw / 2, y: y + fl / 2 };
      entities.push({
        id: nextId(),
        type: 'LWPOLYLINE',
        layer: 'FOOTINGS',
        color: '#ea580c',
        points: [p1, p2, p3, p4, { ...p1 }],
      });

      // Footing center mark crosshair
      entities.push({
        id: nextId(),
        type: 'LINE',
        layer: 'FOOTINGS',
        color: '#ea580c',
        points: [{ x: x - 0.3, y }, { x: x + 0.3, y }],
      });
      entities.push({
        id: nextId(),
        type: 'LINE',
        layer: 'FOOTINGS',
        color: '#ea580c',
        points: [{ x, y: y - 0.3 }, { x, y: y + 0.3 }],
      });

      // Footing Label
      entities.push({
        id: nextId(),
        type: 'TEXT',
        layer: 'TEXT',
        color: '#fb923c',
        points: [{ x: x - 0.7, y: y - 1.2 }],
        text: `F${xi * 3 + yi + 1} (2.0x2.0)`,
      });

      // Column outline in DXF (0.40m x 0.40m)
      const cw = 0.40;
      const cl = 0.40;
      entities.push({
        id: nextId(),
        type: 'LWPOLYLINE',
        layer: 'COLUMNS',
        color: '#dc2626',
        points: [
          { x: x - cw / 2, y: y - cl / 2 },
          { x: x + cw / 2, y: y - cl / 2 },
          { x: x + cw / 2, y: y + cl / 2 },
          { x: x - cw / 2, y: y + cl / 2 },
          { x: x - cw / 2, y: y - cl / 2 },
        ],
      });
      entities.push({
        id: nextId(),
        type: 'TEXT',
        layer: 'TEXT',
        color: '#f87171',
        points: [{ x: x + 0.3, y: y + 0.3 }],
        text: `C${xi * 3 + yi + 1}`,
      });
    });
  });

  // 3. Foundation Tie Beams along perimeter and interior
  // Horizontal beams
  yGrids.forEach(y => {
    entities.push({
      id: nextId(),
      type: 'LINE',
      layer: 'BEAMS',
      color: '#4f46e5',
      points: [{ x: 0, y: y - 0.15 }, { x: 18, y: y - 0.15 }],
    });
    entities.push({
      id: nextId(),
      type: 'LINE',
      layer: 'BEAMS',
      color: '#4f46e5',
      points: [{ x: 0, y: y + 0.15 }, { x: 18, y: y + 0.15 }],
    });
  });
  // Vertical beams
  xGrids.forEach(x => {
    entities.push({
      id: nextId(),
      type: 'LINE',
      layer: 'BEAMS',
      color: '#4f46e5',
      points: [{ x: x - 0.15, y: 0 }, { x: x - 0.15, y: 12 }],
    });
    entities.push({
      id: nextId(),
      type: 'LINE',
      layer: 'BEAMS',
      color: '#4f46e5',
      points: [{ x: x + 0.15, y: 0 }, { x: x + 0.15, y: 12 }],
    });
  });

  // 4. Perimeter Wall / Boundary line
  entities.push({
    id: nextId(),
    type: 'LWPOLYLINE',
    layer: 'WALLS',
    color: '#64748b',
    points: [
      { x: -1.2, y: -1.2 },
      { x: 19.2, y: -1.2 },
      { x: 19.2, y: 13.2 },
      { x: -1.2, y: 13.2 },
      { x: -1.2, y: -1.2 },
    ],
  });

  // 5. Dimension Lines (6.00 m between grid bays)
  for (let i = 0; i < xGrids.length - 1; i++) {
    const x1 = xGrids[i];
    const x2 = xGrids[i + 1];
    const dimY = -ext - 1.0;
    // Dim line
    entities.push({
      id: nextId(),
      type: 'LINE',
      layer: 'DIMENSIONS',
      color: '#d97706',
      points: [{ x: x1, y: dimY }, { x: x2, y: dimY }],
    });
    // Ticks
    entities.push({
      id: nextId(),
      type: 'LINE',
      layer: 'DIMENSIONS',
      color: '#d97706',
      points: [{ x: x1 - 0.2, y: dimY - 0.2 }, { x: x1 + 0.2, y: dimY + 0.2 }],
    });
    entities.push({
      id: nextId(),
      type: 'LINE',
      layer: 'DIMENSIONS',
      color: '#d97706',
      points: [{ x: x2 - 0.2, y: dimY - 0.2 }, { x: x2 + 0.2, y: dimY + 0.2 }],
    });
    entities.push({
      id: nextId(),
      type: 'TEXT',
      layer: 'DIMENSIONS',
      color: '#fbbf24',
      points: [{ x: (x1 + x2) / 2 - 0.7, y: dimY + 0.3 }],
      text: '6.00 m',
    });
  }

  return {
    entities,
    layers,
    bounds: {
      minX: -4,
      minY: -4,
      maxX: 22,
      maxY: 16,
      width: 26,
      height: 20,
      centerX: 9,
      centerY: 6,
    },
    suggestedScaleUnit: 'm',
  };
}

/**
 * Strips AutoCAD MTEXT formatting codes (e.g. \FROMANC.SHX;\W0.9000000000;\T1.0000000000;\o\l42 -> 42)
 */
export function cleanDxfText(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    // Remove font specifications: \F...; or \f...;
    .replace(/\\[Ff][^;]*;/g, '')
    // Remove width factor: \W...;
    .replace(/\\[Ww][^;]*;/g, '')
    // Remove tracking: \T...;
    .replace(/\\[Tt][^;]*;/g, '')
    // Remove height: \H...;
    .replace(/\\[Hh][^;]*;/g, '')
    // Remove color: \C...;
    .replace(/\\[Cc][^;]*;/g, '')
    // Remove alignment: \A...;
    .replace(/\\[Aa][^;]*;/g, '')
    // Remove slant: \Q...;
    .replace(/\\[Qq][^;]*;/g, '')
    // Remove paragraph style: \p[^;]*;
    .replace(/\\[Pp][^;]*;/g, '')
    // Remove stack formatting: \S...;
    .replace(/\\[Ss]([^;]*);/g, '$1')
    // Remove formatting toggles like \o, \O, \l, \L, \k, \K, \P, \X, \~
    .replace(/\\[oOlLkKpPxX~]/g, ' ')
    // Remove curly braces used for formatting blocks { }
    .replace(/[{}]/g, '')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if two DXF or annotation text strings match:
 * either exact raw match or clean decoded text match (e.g. both resolve to "42")
 */
export function isMatchingDxfText(textA: string | undefined, textB: string | undefined): boolean {
  if (!textA || !textB) return false;
  // 1. Exact raw match (including exact AutoCAD formatting string)
  if (textA.trim() === textB.trim()) return true;

  // 2. Clean decoded text match
  const cleanA = cleanDxfText(textA);
  const cleanB = cleanDxfText(textB);
  if (cleanA && cleanB && cleanA.toLowerCase() === cleanB.toLowerCase()) {
    return true;
  }

  return false;
}

/**
 * Extracts AutoCAD formatting signature (e.g. \FROMANC.SHX;\W0.9000000000;\T1.0000000000;)
 */
export function getDxfFormatSignature(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/^(\\[FfWwTtHhCcAaQq][^;]*;)+/);
  return match ? match[0] : null;
}
