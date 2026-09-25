export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export type ToolMode =
  | 'select'
  | 'selectBox'
  | 'move'
  | 'footing'
  | 'column'
  | 'beam'
  | 'wall'
  | 'slab'
  | 'slab_opening'
  | 'door'
  | 'window'
  | 'measure'
  | 'calibrate'
  | 'text'
  | 'resize';

export interface ProjectLevel {
  id: string;
  name: string;        // e.g. "Foundation", "Ground Floor", "First Floor", "Second Floor", "Roof"
  elevation: number;   // floor level elevation in meters (e.g. -1.50, 0.00, +3.20, +4.00, +5.00)
  height: number;      // floor-to-floor height in meters (e.g. 3.20)
  dxfFileName?: string;
  dxfEntities?: DXFEntity[];
  dxfBounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
}

export interface DXFEntity {
  id: string;
  type: 'LINE' | 'LWPOLYLINE' | 'POLYLINE' | 'CIRCLE' | 'ARC' | 'TEXT' | 'MTEXT' | 'SOLID';
  layer: string;
  color?: string;
  points: Point2D[];
  radius?: number;
  center?: Point2D;
  text?: string;
  height?: number;
  selected?: boolean;
}

export interface DXFLayer {
  name: string;
  color: string;
  visible: boolean;
}

export interface FootingElement {
  id: string;
  type: 'footing';
  mark: string;
  x: number;
  y: number;
  width: number;    // meters (along X or local width)
  length: number;   // meters (along Y or local length)
  depth: number;    // meters (thickness/height)
  elevation: number;
  rotation?: number; // angle in degrees (for inclined/rotated footings)
  points?: Point2D[]; // for irregular/polygon footings traced on DXF
  isPolygon?: boolean;
  concreteGrade: string;
  color?: string;
  selected?: boolean;
  levelId?: string;
}

export interface ColumnElement {
  id: string;
  type: 'column';
  mark: string;
  x: number;
  y: number;
  width: number;    // meters (along local width)
  depth: number;    // meters (along local depth)
  height: number;   // meters
  baseElevation: number;
  rotation?: number; // angle in degrees (for inclined/rotated columns)
  points?: Point2D[]; // for irregular/polygon columns traced on DXF
  isPolygon?: boolean;
  footingId?: string;
  concreteGrade: string;
  color?: string;
  selected?: boolean;
  levelId?: string;
}

export interface WallOpening {
  id: string;
  mark: string;       // e.g. "D1", "W1"
  type: 'door' | 'window';
  offset: number;     // meters along wall centerline from startPoint
  width: number;      // meters (e.g. 0.90 for door, 1.20 for window)
  height: number;     // meters (e.g. 2.10 for door, 1.40 for window)
  sillHeight: number; // meters from wall base (0.00 for door, 0.90 for window)
}

export interface SlabOpening {
  id: string;
  mark: string;       // e.g. "STAIR-1", "VOID-1"
  type: 'stair' | 'shaft' | 'rect' | 'polygon';
  points: Point2D[];  // vertices of opening in world coordinates
  width?: number;     // meters (if rectangular)
  length?: number;    // meters
  x?: number;         // center x
  y?: number;         // center y
  rotation?: number;  // degrees
}

export interface BeamElement {
  id: string;
  type: 'beam';
  mark: string;
  startPoint: Point2D;
  endPoint: Point2D;
  width: number;    // meters
  depth: number;    // meters
  elevation: number;
  startColumnId?: string;
  endColumnId?: string;
  concreteGrade: string;
  color?: string;
  selected?: boolean;
  levelId?: string;
}

export interface WallElement {
  id: string;
  type: 'wall';
  mark: string;
  startPoint: Point2D;
  endPoint: Point2D;
  thickness: number; // meters
  height: number;    // meters
  baseElevation: number;
  openings?: WallOpening[];
  material?: string;
  concreteGrade?: string;
  color?: string;
  selected?: boolean;
  levelId?: string;
}

export interface SlabElement {
  id: string;
  type: 'slab';
  mark: string;
  points: Point2D[];
  thickness: number; // meters
  elevation: number;
  openings?: SlabOpening[];
  supportingBeamIds?: string[];
  supportingColumnIds?: string[];
  concreteGrade: string;
  color?: string;
  selected?: boolean;
  levelId?: string;
}

export interface DimensionAnnotation {
  id: string;
  type: 'annotation';
  points: Point2D[];
  totalDistance: number; // in meters
  segments: number[];    // distances in meters
  offset: number;
  color?: string;
  selected?: boolean;
  levelId?: string;
}

export interface TextAnnotation {
  id: string;
  type: 'text';
  text: string;
  x: number;
  y: number;
  fontSize: number; // in meters (default ~0.35m)
  color?: string;
  selected?: boolean;
  levelId?: string;
}

export type BIMElement =
  | FootingElement
  | ColumnElement
  | BeamElement
  | WallElement
  | SlabElement
  | DimensionAnnotation
  | TextAnnotation;

export interface ScaleCalibration {
  active: boolean;
  step: 'point1' | 'point2' | 'input' | 'completed';
  point1: Point2D | null;
  point2: Point2D | null;
  pixelDistance: number;
  realDistanceMeters: number;
  metersPerUnit: number;
  calibrated: boolean;
}

export interface SnapResult {
  point: Point2D;
  type: 'endpoint' | 'midpoint' | 'center' | 'footing_center' | 'column_center' | 'grid';
  label: string;
  sourceElementId?: string;
}

export interface ColorSettings {
  dxfLines: string;
  footing: string;
  column: string;
  beam: string;
  wall: string;
  slab: string;
  annotation: string;
  snapMarker: string;
}

export interface UnitRates {
  concreteC25: number;   // $/m3
  concreteC30: number;   // $/m3
  concreteC35: number;   // $/m3
  formwork: number;      // $/m2
  rebar: number;         // $/ton
  excavation: number;    // $/m3
  masonryWall: number;   // $/m2
}

export interface BOQSummaryItem {
  id: string;
  category: 'Footing' | 'Column' | 'Beam' | 'Wall' | 'Slab';
  mark: string;
  description: string;
  count: number;
  dimensions: string;
  concreteVol: number;   // m3
  formworkArea: number;  // m2
  rebarKg: number;       // kg
  unitCost: number;      // estimated total
  currency: string;
}
