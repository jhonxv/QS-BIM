import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Point2D,
  ToolMode,
  BIMElement,
  DXFEntity,
  ColorSettings,
  ScaleCalibration,
  SnapResult,
  FootingElement,
  ColumnElement,
  BeamElement,
  WallElement,
  SlabElement,
  DimensionAnnotation,
  TextAnnotation,
  ProjectLevel,
} from '../types/bim';
import {
  distance,
  findSnapPoint,
  isLineInRect,
  isPointInRect,
  polygonArea,
  scalePolygon,
  isPointInPolygon,
} from '../utils/geometry';
import { cleanDxfText, isMatchingDxfText, getDxfFormatSignature } from '../utils/dxfParser';

// Helper to compute next sequential element mark (e.g. F1, F2, F3... C1, C2, C3... W1, B1, S1)
export const getNextElementMark = (
  type: 'footing' | 'column' | 'beam' | 'wall' | 'slab',
  prefix: string,
  existingElements: BIMElement[]
): string => {
  const matching = existingElements.filter((el) => el.type === type);
  const nums = matching
    .map((el) => {
      const markStr = 'mark' in el && typeof el.mark === 'string' ? el.mark : '';
      const m = markStr.match(/\d+/);
      return m ? parseInt(m[0], 10) : 0;
    })
    .filter((n) => !isNaN(n) && n > 0);
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `${prefix}${max + 1}`;
};
import {
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Square,
  Pentagon,
  RotateCw,
  CornerDownLeft,
  X,
  Type,
  Scaling,
  Trash2,
  Sliders,
  Check,
  Move,
  Ruler,
} from 'lucide-react';

interface CadCanvas2DProps {
  toolMode: ToolMode;
  setToolMode: (mode: ToolMode) => void;
  elements: BIMElement[];
  onAddElement: (element: BIMElement) => void;
  onUpdateElements: (elements: BIMElement[]) => void;
  onDeleteSelected: () => void;
  dxfEntities: DXFEntity[];
  onUpdateDxfEntities: (entities: DXFEntity[]) => void;
  dxfBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
  colors: ColorSettings;
  scaleCalibration: ScaleCalibration;
  onUpdateCalibration: (cal: Partial<ScaleCalibration>) => void;
  snapEnabled: boolean;
  onOpenColumnModal: (footing: FootingElement | null) => void;
  onStatusMessage: (msg: string) => void;
  activeLevel?: ProjectLevel;
  savedViewState?: { panX: number; panY: number; zoom: number } | null;
  onSaveViewState?: (viewState: { panX: number; panY: number; zoom: number }) => void;
}

interface ActiveGrip {
  elementId: string;
  elementType: 'slab' | 'wall' | 'beam' | 'column' | 'footing' | 'text';
  gripType: 'vertex' | 'start' | 'end' | 'midpoint' | 'corner' | 'rotation' | 'position';
  vertexIndex?: number;
  cornerIndex?: number;
  initialWorld: Point2D;
  initialElement: BIMElement;
}

const MIN_ZOOM = 0.00001;
const MAX_ZOOM = 100000;

export const CadCanvas2D: React.FC<CadCanvas2DProps> = ({
  toolMode,
  setToolMode,
  elements,
  onAddElement,
  onUpdateElements,
  onDeleteSelected,
  dxfEntities,
  onUpdateDxfEntities,
  dxfBounds,
  colors,
  scaleCalibration,
  onUpdateCalibration,
  snapEnabled,
  onOpenColumnModal,
  onStatusMessage,
  activeLevel,
  savedViewState,
  onSaveViewState,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // View transform state: Pan and Zoom (initialized from savedViewState if available)
  const [viewState, setViewState] = useState<{ panX: number; panY: number; zoom: number }>(() => {
    if (savedViewState && savedViewState.zoom > 0) {
      return savedViewState;
    }
    return {
      panX: 0,
      panY: 0,
      zoom: 25,
    };
  });

  const viewStateRef = useRef<{ panX: number; panY: number; zoom: number }>(viewState);
  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  // Track if initial fit was performed or if a new file was loaded
  const hasAutoFittedRef = useRef<boolean>(!!(savedViewState && savedViewState.zoom > 0));
  const lastBoundsKeyRef = useRef<string>('');
  const wheelSaveTimerRef = useRef<number | null>(null);

  // Active interaction states
  const [cursorWorld, setCursorWorld] = useState<Point2D>({ x: 0, y: 0 });
  const [activeSnap, setActiveSnap] = useState<SnapResult | null>(null);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<Point2D>({ x: 0, y: 0 });

  // In-progress tool states
  const [lineStartPoint, setLineStartPoint] = useState<Point2D | null>(null);
  const [slabPoints, setSlabPoints] = useState<Point2D[]>([]);
  const [measurePoints, setMeasurePoints] = useState<Point2D[]>([]);
  const [moveBasePoint, setMoveBasePoint] = useState<Point2D | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ start: Point2D; current: Point2D; active: boolean } | null>(null);

  // Sub-modes for Footing & Column creation (Rectangle vs Multi-point DXF trace vs 2-Point Inclined)
  const [footingSubMode, setFootingSubMode] = useState<'rectangle' | 'multipoint' | 'inclined'>('rectangle');
  const [footingPoints, setFootingPoints] = useState<Point2D[]>([]);
  const [footingStartPoint, setFootingStartPoint] = useState<Point2D | null>(null);

  const [columnSubMode, setColumnSubMode] = useState<'rectangle' | 'multipoint' | 'inclined'>('rectangle');
  const [columnPoints, setColumnPoints] = useState<Point2D[]>([]);
  const [columnStartPoint, setColumnStartPoint] = useState<Point2D | null>(null);

  // Active Grip Dragging state for mouse resizing
  const [activeGrip, setActiveGrip] = useState<ActiveGrip | null>(null);

  // Text Editor modal state
  const [textModalState, setTextModalState] = useState<{
    isOpen: boolean;
    worldPos: Point2D;
    existingElementId?: string;
    existingDxfId?: string;
    text: string;
    fontSize: number;
    color: string;
  } | null>(null);

  // Initial fit to bounds
  const fitToExtents = useCallback(() => {
    if (!canvasRef.current || !dxfBounds || dxfBounds.width <= 0 || dxfBounds.height <= 0) return;
    const canvas = canvasRef.current;
    const padding = 70;
    const availWidth = Math.max(100, canvas.clientWidth - padding * 2);
    const availHeight = Math.max(100, canvas.clientHeight - padding * 2);

    const scaleX = availWidth / Math.max(0.01, dxfBounds.width);
    const scaleY = availHeight / Math.max(0.01, dxfBounds.height);
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), MIN_ZOOM), MAX_ZOOM);

    const panX = canvas.clientWidth / 2 - dxfBounds.centerX * newZoom;
    const panY = canvas.clientHeight / 2 + dxfBounds.centerY * newZoom;

    const nextView = { panX, panY, zoom: newZoom };
    viewStateRef.current = nextView;
    setViewState(nextView);
    onSaveViewState?.(nextView);
    onStatusMessage(`Fitted to drawing • Zoom: ${newZoom.toFixed(3)} px/unit`);
  }, [dxfBounds, onStatusMessage, onSaveViewState]);

  useEffect(() => {
    if (dxfBounds.width <= 0 || dxfBounds.height <= 0) return;
    const boundsKey = `${dxfBounds.width.toFixed(2)}_${dxfBounds.height.toFixed(2)}_${dxfBounds.centerX.toFixed(2)}`;

    const isNewFile = lastBoundsKeyRef.current !== '' && lastBoundsKeyRef.current !== boundsKey;
    if (!hasAutoFittedRef.current && (!savedViewState || savedViewState.zoom <= 0)) {
      hasAutoFittedRef.current = true;
      lastBoundsKeyRef.current = boundsKey;
      fitToExtents();
    } else if (isNewFile) {
      lastBoundsKeyRef.current = boundsKey;
      fitToExtents();
    }
  }, [dxfBounds.width, dxfBounds.height, dxfBounds.centerX, fitToExtents, savedViewState]);

  // Cleanup on unmount & sync viewState to parent
  useEffect(() => {
    return () => {
      if (wheelSaveTimerRef.current) {
        window.clearTimeout(wheelSaveTimerRef.current);
      }
      onSaveViewState?.(viewStateRef.current);
    };
  }, [onSaveViewState]);

  // Global mouseup to cancel any stuck panning
  useEffect(() => {
    const handleGlobalUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        setIsPanning(false);
        onSaveViewState?.(viewStateRef.current);
      }
    };
    window.addEventListener('mouseup', handleGlobalUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalUp);
    };
  }, [onSaveViewState]);

  // Coordinate transformations
  const screenToWorld = useCallback(
    (screenX: number, screenY: number): Point2D => {
      return {
        x: (screenX - viewState.panX) / viewState.zoom,
        y: -(screenY - viewState.panY) / viewState.zoom,
      };
    },
    [viewState]
  );

  const worldToScreen = useCallback(
    (worldX: number, worldY: number): Point2D => {
      return {
        x: worldX * viewState.zoom + viewState.panX,
        y: -worldY * viewState.zoom + viewState.panY,
      };
    },
    [viewState]
  );

  // Keyboard shortcut handler (ESC, C, Del, Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept delete or typing if user is in an input or textarea
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') {
        return;
      }

      // 1. ESC: Deselect all items, restore original colors, and stop any active drawing command
      if (e.key === 'Escape') {
        setLineStartPoint(null);
        setSlabPoints([]);
        setFootingPoints([]);
        setFootingStartPoint(null);
        setColumnPoints([]);
        setColumnStartPoint(null);
        setMeasurePoints([]);
        setMoveBasePoint(null);
        setSelectionBox(null);
        setActiveGrip(null);
        setTextModalState(null);

        // Cancel selection on all BIM elements and DXF entities -> restores original colors!
        const deselectBim = elements.map((el) => (el.selected ? { ...el, selected: false } : el));
        onUpdateElements(deselectBim);

        const deselectDxf = dxfEntities.map((ent) => (ent.selected ? { ...ent, selected: false } : ent));
        onUpdateDxfEntities(deselectDxf);

        if (scaleCalibration.active) {
          onUpdateCalibration({ active: false, step: 'point1', point1: null, point2: null });
        }
        setToolMode('select');
        onStatusMessage('Selection and active command cancelled (ESC) • Colors restored');
        return;
      }

      // 1b. Select All: Ctrl+A / Cmd+A
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const selectAllBim = elements.map((el) => ({ ...el, selected: true }));
        const selectAllDxf = dxfEntities.map((ent) => ({ ...ent, selected: true }));
        onUpdateElements(selectAllBim);
        onUpdateDxfEntities(selectAllDxf);
        onStatusMessage(`Selected all ${elements.length} BIM elements and ${dxfEntities.length} DXF entities (Ctrl+A).`);
        return;
      }

      // 2. C / c: Close polygon for slab, footing, or column
      if (e.key === 'c' || e.key === 'C') {
        if (toolMode === 'slab') {
          if (slabPoints.length >= 3) {
            const newSlab: SlabElement = {
              id: `slab-${Date.now()}`,
              type: 'slab',
              mark: getNextElementMark('slab', 'S', elements),
              points: [...slabPoints],
              thickness: 0.20,
              elevation: activeLevel ? activeLevel.elevation + activeLevel.height : 3.20,
              concreteGrade: 'C30/37',
              color: colors.slab,
              levelId: activeLevel?.id,
            };
            onAddElement(newSlab);
            setSlabPoints([]);
            onStatusMessage(`Slab ${newSlab.mark} created (${polygonArea(newSlab.points).toFixed(2)} m²)`);
          } else {
            onStatusMessage('Slab requires at least 3 points before pressing C to close.');
          }
        } else if (toolMode === 'footing' && footingPoints.length >= 3) {
          const newFooting: FootingElement = {
            id: `footing-${Date.now()}`,
            type: 'footing',
            mark: getNextElementMark('footing', 'F', elements),
            x: footingPoints[0].x,
            y: footingPoints[0].y,
            width: 2.0,
            length: 2.0,
            depth: 0.60,
            elevation: activeLevel ? activeLevel.elevation : -1.50,
            points: [...footingPoints],
            isPolygon: true,
            concreteGrade: 'C30/37',
            color: colors.footing,
            levelId: activeLevel?.id,
          };
          onAddElement(newFooting);
          setFootingPoints([]);
          onStatusMessage(`Polygon Footing ${newFooting.mark} created (${polygonArea(newFooting.points!).toFixed(2)} m²)`);
        } else if (toolMode === 'column' && columnPoints.length >= 3) {
          const newCol: ColumnElement = {
            id: `col-${Date.now()}`,
            type: 'column',
            mark: getNextElementMark('column', 'C', elements),
            x: columnPoints[0].x,
            y: columnPoints[0].y,
            width: 0.40,
            depth: 0.40,
            height: activeLevel ? activeLevel.height : 3.00,
            baseElevation: activeLevel ? activeLevel.elevation : 0,
            points: [...columnPoints],
            isPolygon: true,
            concreteGrade: 'C35/45',
            color: colors.column,
            levelId: activeLevel?.id,
          };
          onAddElement(newCol);
          setColumnPoints([]);
          onStatusMessage(`Polygon Column ${newCol.mark} created (${polygonArea(newCol.points!).toFixed(2)} m²)`);
        }
      }

      // 3. Delete / Backspace: Remove selected elements and DXF lines/text, or measurements
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const anySelectedBim = elements.some((el) => el.selected);
        const anySelectedDxf = dxfEntities.some((ent) => ent.selected);
        if (anySelectedBim || anySelectedDxf) {
          onDeleteSelected();
        } else if (measurePoints.length > 0) {
          setMeasurePoints((prev) => prev.slice(0, -1));
          onStatusMessage('Removed last measurement point');
        } else if (toolMode === 'measure') {
          const annotations = elements.filter((el) => el.type === 'annotation');
          if (annotations.length > 0) {
            const last = annotations[annotations.length - 1];
            onUpdateElements(elements.filter((el) => el.id !== last.id));
            onStatusMessage('Measurement dimension removed (Delete key).');
          }
        }
      }

      // 4. Enter: Finalize continuous chains or cancel move
      if (e.key === 'Enter') {
        if (toolMode === 'move') {
          setMoveBasePoint(null);
          setToolMode('select');
          onStatusMessage('Move operation cancelled (ENTER).');
          return;
        } else if (toolMode === 'wall' || toolMode === 'beam') {
          setLineStartPoint(null);
          onStatusMessage(`Continuous ${toolMode} chain completed (ENTER).`);
        } else if (toolMode === 'footing' && footingPoints.length >= 3) {
          const newFooting: FootingElement = {
            id: `footing-${Date.now()}`,
            type: 'footing',
            mark: getNextElementMark('footing', 'F', elements),
            x: footingPoints[0].x,
            y: footingPoints[0].y,
            width: 2.0,
            length: 2.0,
            depth: 0.60,
            elevation: activeLevel ? activeLevel.elevation : -1.50,
            points: [...footingPoints],
            isPolygon: true,
            concreteGrade: 'C30/37',
            color: colors.footing,
            levelId: activeLevel?.id,
          };
          onAddElement(newFooting);
          setFootingPoints([]);
          onStatusMessage(`Polygon Footing ${newFooting.mark} created (${polygonArea(newFooting.points!).toFixed(2)} m²)`);
        } else if (toolMode === 'column' && columnPoints.length >= 3) {
          const newCol: ColumnElement = {
            id: `col-${Date.now()}`,
            type: 'column',
            mark: getNextElementMark('column', 'C', elements),
            x: columnPoints[0].x,
            y: columnPoints[0].y,
            width: 0.40,
            depth: 0.40,
            height: activeLevel ? activeLevel.height : 3.00,
            baseElevation: activeLevel ? activeLevel.elevation : 0,
            points: [...columnPoints],
            isPolygon: true,
            concreteGrade: 'C35/45',
            color: colors.column,
            levelId: activeLevel?.id,
          };
          onAddElement(newCol);
          setColumnPoints([]);
          onStatusMessage(`Polygon Column ${newCol.mark} created`);
        } else if (toolMode === 'measure' && measurePoints.length >= 2) {
          let total = 0;
          const segs: number[] = [];
          for (let i = 0; i < measurePoints.length - 1; i++) {
            const d = distance(measurePoints[i], measurePoints[i + 1]) * scaleCalibration.metersPerUnit;
            segs.push(d);
            total += d;
          }
          const newAnnotation: DimensionAnnotation = {
            id: `dim-${Date.now()}`,
            type: 'annotation',
            points: [...measurePoints],
            totalDistance: total,
            segments: segs,
            offset: 0.8,
            color: colors.annotation,
            levelId: activeLevel?.id,
          };
          onAddElement(newAnnotation);
          setMeasurePoints([]);
          onStatusMessage(`Dimension recorded: ${total.toFixed(2)} m (placed outside line)`);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    toolMode,
    slabPoints,
    footingPoints,
    columnPoints,
    measurePoints,
    elements,
    dxfEntities,
    colors,
    scaleCalibration,
    activeLevel,
    onAddElement,
    onDeleteSelected,
    onStatusMessage,
    onUpdateCalibration,
    onUpdateElements,
    onUpdateDxfEntities,
    setToolMode,
  ]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width <= 0 || height <= 0) return;

    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // 1. Engineering Background Grid
    const { zoom } = viewState;
    const rawGridSize = 50 / zoom;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawGridSize)));
    const baseGrid = rawGridSize / magnitude;
    const stepMultiple = baseGrid < 2 ? 1 : baseGrid < 5 ? 2 : 5;
    const gridSize = stepMultiple * magnitude;

    const startWorld = screenToWorld(0, height);
    const endWorld = screenToWorld(width, 0);

    ctx.lineWidth = 1;
    ctx.strokeStyle = '#0f172a';
    const minGridX = Math.floor(startWorld.x / gridSize) * gridSize;
    const maxGridX = Math.ceil(endWorld.x / gridSize) * gridSize;
    const minGridY = Math.floor(startWorld.y / gridSize) * gridSize;
    const maxGridY = Math.ceil(endWorld.y / gridSize) * gridSize;

    for (let gx = minGridX; gx <= maxGridX; gx += gridSize) {
      const scr = worldToScreen(gx, 0);
      ctx.beginPath();
      ctx.moveTo(scr.x, 0);
      ctx.lineTo(scr.x, height);
      ctx.stroke();
    }
    for (let gy = minGridY; gy <= maxGridY; gy += gridSize) {
      const scr = worldToScreen(0, gy);
      ctx.beginPath();
      ctx.moveTo(0, scr.y);
      ctx.lineTo(width, scr.y);
      ctx.stroke();
    }

    // Origin Axes
    const origin = worldToScreen(0, 0);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, height);
    ctx.moveTo(0, origin.y);
    ctx.lineTo(width, origin.y);
    ctx.stroke();

    // 2. Draw DXF CAD Entities (Lines, Polylines, Circles, Text)
    dxfEntities.forEach((ent) => {
      ctx.save();
      const isSelected = ent.selected;
      ctx.strokeStyle = isSelected ? '#f59e0b' : ent.color || colors.dxfLines;
      ctx.lineWidth = isSelected ? 3.0 : 1.2;
      if (isSelected) {
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 8;
        ctx.setLineDash([6, 4]);
      }

      if (ent.type === 'LINE' && ent.points.length >= 2) {
        const p1 = worldToScreen(ent.points[0].x, ent.points[0].y);
        const p2 = worldToScreen(ent.points[1].x, ent.points[1].y);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      } else if (
        (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') &&
        ent.points.length >= 2
      ) {
        ctx.beginPath();
        const first = worldToScreen(ent.points[0].x, ent.points[0].y);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < ent.points.length; i++) {
          const pt = worldToScreen(ent.points[i].x, ent.points[i].y);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      } else if (ent.type === 'CIRCLE' && ent.center && ent.radius) {
        const c = worldToScreen(ent.center.x, ent.center.y);
        ctx.beginPath();
        ctx.arc(c.x, c.y, ent.radius * zoom, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
        if (ent.points.length > 0 && ent.text) {
          const p = worldToScreen(ent.points[0].x, ent.points[0].y);
          // Fixed screen font size so text never grows huge when zooming in
          const fontSizePx = 11;
          ctx.font = `${fontSizePx}px "JetBrains Mono", monospace`;
          const displayText = cleanDxfText(ent.text) || ent.text;
          const textMetrics = ctx.measureText(displayText);

          if (isSelected) {
            ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.5;
            ctx.fillRect(p.x - 2, p.y - fontSizePx - 2, textMetrics.width + 4, fontSizePx + 4);
            ctx.strokeRect(p.x - 2, p.y - fontSizePx - 2, textMetrics.width + 4, fontSizePx + 4);
            ctx.fillStyle = '#f59e0b';
          } else {
            ctx.fillStyle = ent.color || '#94a3b8';
          }
          ctx.fillText(displayText, p.x, p.y);
        }
      }
      ctx.restore();
    });

    // Helper: Draw grip handles
    const drawSquareGrip = (worldPt: Point2D, size = 8, color = '#38bdf8') => {
      const scr = worldToScreen(worldPt.x, worldPt.y);
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.fillRect(scr.x - size / 2, scr.y - size / 2, size, size);
      ctx.strokeRect(scr.x - size / 2, scr.y - size / 2, size, size);
      ctx.restore();
    };

    const drawRoundGrip = (worldPt: Point2D, radius = 5, color = '#f59e0b') => {
      const scr = worldToScreen(worldPt.x, worldPt.y);
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    // 3. Draw Slabs
    elements
      .filter((e): e is SlabElement => e.type === 'slab')
      .forEach((slab) => {
        if (slab.points.length < 3) return;
        ctx.save();
        const isSelected = slab.selected;
        ctx.beginPath();
        const start = worldToScreen(slab.points[0].x, slab.points[0].y);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < slab.points.length; i++) {
          const pt = worldToScreen(slab.points[i].x, slab.points[i].y);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();

        ctx.fillStyle = isSelected
          ? 'rgba(245, 158, 11, 0.28)'
          : colors.slab
          ? `${colors.slab}33`
          : 'rgba(16, 185, 129, 0.22)';
        ctx.fill();

        ctx.strokeStyle = isSelected ? '#f59e0b' : colors.slab || '#10b981';
        ctx.lineWidth = isSelected ? 3 : 1.8;
        if (isSelected) {
          ctx.setLineDash([8, 4]);
        }
        ctx.stroke();

        // Label in centroid
        const cx = slab.points.reduce((sum, p) => sum + p.x, 0) / slab.points.length;
        const cy = slab.points.reduce((sum, p) => sum + p.y, 0) / slab.points.length;
        const scrC = worldToScreen(cx, cy);
        const area = polygonArea(slab.points);

        ctx.fillStyle = isSelected ? '#f59e0b' : '#34d399';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${slab.mark} (${area.toFixed(1)}m²)`, scrC.x, scrC.y);

        // Interactive vertex grips when selected or in resize mode
        if (isSelected || toolMode === 'resize') {
          slab.points.forEach((pt) => {
            drawSquareGrip(pt, 8, isSelected ? '#f59e0b' : '#10b981');
          });
        }
        ctx.restore();
      });

    // 4. Draw Footings
    elements
      .filter((e): e is FootingElement => e.type === 'footing')
      .forEach((footing) => {
        ctx.save();
        const isSelected = footing.selected;

        if (footing.points && footing.points.length >= 3) {
          // Polygon Footing
          ctx.beginPath();
          const start = worldToScreen(footing.points[0].x, footing.points[0].y);
          ctx.moveTo(start.x, start.y);
          for (let i = 1; i < footing.points.length; i++) {
            const pt = worldToScreen(footing.points[i].x, footing.points[i].y);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.closePath();

          ctx.fillStyle = isSelected
            ? 'rgba(245, 158, 11, 0.35)'
            : `${colors.footing || '#ea580c'}40`;
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#f59e0b' : colors.footing || '#ea580c';
          ctx.lineWidth = isSelected ? 3 : 2;
          ctx.stroke();

          // Vertex grips
          if (isSelected || toolMode === 'resize') {
            footing.points.forEach((pt) => {
              drawSquareGrip(pt, 8, isSelected ? '#f59e0b' : '#ea580c');
            });
          }

          // Centroid Label for Polygon Footing (2D only)
          const cx = footing.points.reduce((sum, p) => sum + p.x, 0) / footing.points.length;
          const cy = footing.points.reduce((sum, p) => sum + p.y, 0) / footing.points.length;
          const scrC = worldToScreen(cx, cy);
          ctx.fillStyle = isSelected ? '#f59e0b' : '#fed7aa';
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(footing.mark, scrC.x, scrC.y);
        } else {
          // Rectangular / Inclined Footing
          const scrCenter = worldToScreen(footing.x, footing.y);
          ctx.translate(scrCenter.x, scrCenter.y);
          if (footing.rotation) {
            ctx.rotate((-footing.rotation * Math.PI) / 180);
          }

          const wPx = footing.width * zoom;
          const lPx = footing.length * zoom;

          ctx.fillStyle = isSelected
            ? 'rgba(245, 158, 11, 0.35)'
            : `${colors.footing || '#ea580c'}40`;
          ctx.fillRect(-wPx / 2, -lPx / 2, wPx, lPx);

          ctx.strokeStyle = isSelected ? '#f59e0b' : colors.footing || '#ea580c';
          ctx.lineWidth = isSelected ? 3 : 2;
          ctx.strokeRect(-wPx / 2, -lPx / 2, wPx, lPx);

          // Center cross mark
          ctx.strokeStyle = isSelected ? '#f59e0b' : '#fed7aa';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-wPx * 0.25, 0);
          ctx.lineTo(wPx * 0.25, 0);
          ctx.moveTo(0, -lPx * 0.25);
          ctx.lineTo(0, lPx * 0.25);
          ctx.stroke();

          // Label
          ctx.fillStyle = isSelected ? '#f59e0b' : '#fed7aa';
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(footing.mark, 0, -lPx / 2 - 4);
        }
        ctx.restore();

        // Corner resizing grips for rectangular footing
        if ((isSelected || toolMode === 'resize') && !footing.points) {
          const hw = footing.width / 2;
          const hl = footing.length / 2;
          const rotRad = ((footing.rotation || 0) * Math.PI) / 180;
          const cosR = Math.cos(rotRad);
          const sinR = Math.sin(rotRad);

          const localCorners = [
            { x: hw, y: hl },
            { x: hw, y: -hl },
            { x: -hw, y: -hl },
            { x: -hw, y: hl },
          ];

          localCorners.forEach((c) => {
            const rotX = footing.x + (c.x * cosR - c.y * sinR);
            const rotY = footing.y + (c.x * sinR + c.y * cosR);
            drawSquareGrip({ x: rotX, y: rotY }, 8, isSelected ? '#f59e0b' : '#ea580c');
          });

          // Rotation handle above top
          const topHandleLocal = { x: 0, y: hl + 22 / zoom };
          const topRotX = footing.x + (topHandleLocal.x * cosR - topHandleLocal.y * sinR);
          const topRotY = footing.y + (topHandleLocal.x * sinR + topHandleLocal.y * cosR);
          drawRoundGrip({ x: topRotX, y: topRotY }, 5.5, '#f59e0b');
        }
      });

    // 5. Draw Columns
    elements
      .filter((e): e is ColumnElement => e.type === 'column')
      .forEach((col) => {
        ctx.save();
        const isSelected = col.selected;

        if (col.points && col.points.length >= 3) {
          // Polygon Column
          ctx.beginPath();
          const start = worldToScreen(col.points[0].x, col.points[0].y);
          ctx.moveTo(start.x, start.y);
          for (let i = 1; i < col.points.length; i++) {
            const pt = worldToScreen(col.points[i].x, col.points[i].y);
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.closePath();

          ctx.fillStyle = isSelected ? '#f59e0b' : colors.column || '#dc2626';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          if (isSelected || toolMode === 'resize') {
            col.points.forEach((pt) => {
              drawSquareGrip(pt, 7, isSelected ? '#f59e0b' : '#dc2626');
            });
          }

          // Centroid Label for Polygon Column (2D only)
          const cx = col.points.reduce((sum, p) => sum + p.x, 0) / col.points.length;
          const cy = col.points.reduce((sum, p) => sum + p.y, 0) / col.points.length;
          const scrC = worldToScreen(cx, cy);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(col.mark, scrC.x, scrC.y);
        } else {
          // Rectangular / Inclined Column
          const scrCenter = worldToScreen(col.x, col.y);
          ctx.translate(scrCenter.x, scrCenter.y);
          if (col.rotation) {
            ctx.rotate((-col.rotation * Math.PI) / 180);
          }

          const wPx = col.width * zoom;
          const dPx = col.depth * zoom;

          ctx.fillStyle = isSelected ? '#f59e0b' : colors.column || '#dc2626';
          ctx.fillRect(-wPx / 2, -dPx / 2, wPx, dPx);

          ctx.strokeStyle = isSelected ? '#ffffff' : '#fca5a5';
          ctx.lineWidth = isSelected ? 2.5 : 1.5;
          ctx.strokeRect(-wPx / 2, -dPx / 2, wPx, dPx);

          // Diagonal hatch for reinforced concrete column
          ctx.beginPath();
          ctx.moveTo(-wPx / 2, -dPx / 2);
          ctx.lineTo(wPx / 2, dPx / 2);
          ctx.moveTo(-wPx / 2, dPx / 2);
          ctx.lineTo(wPx / 2, -dPx / 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Label
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(col.mark, 0, 0);
        }
        ctx.restore();

        // Corner resizing grips for rectangular column
        if ((isSelected || toolMode === 'resize') && !col.points) {
          const hw = col.width / 2;
          const hd = col.depth / 2;
          const rotRad = ((col.rotation || 0) * Math.PI) / 180;
          const cosR = Math.cos(rotRad);
          const sinR = Math.sin(rotRad);

          const localCorners = [
            { x: hw, y: hd },
            { x: hw, y: -hd },
            { x: -hw, y: -hd },
            { x: -hw, y: hd },
          ];

          localCorners.forEach((c) => {
            const rotX = col.x + (c.x * cosR - c.y * sinR);
            const rotY = col.y + (c.x * sinR + c.y * cosR);
            drawSquareGrip({ x: rotX, y: rotY }, 7, isSelected ? '#f59e0b' : '#dc2626');
          });

          // Rotation handle
          const topHandleLocal = { x: 0, y: hd + 18 / zoom };
          const topRotX = col.x + (topHandleLocal.x * cosR - topHandleLocal.y * sinR);
          const topRotY = col.y + (topHandleLocal.x * sinR + topHandleLocal.y * cosR);
          drawRoundGrip({ x: topRotX, y: topRotY }, 5, '#f59e0b');
        }
      });

    // 6. Draw Walls
    elements
      .filter((e): e is WallElement => e.type === 'wall')
      .forEach((wall) => {
        ctx.save();
        const isSelected = wall.selected;
        const p1 = worldToScreen(wall.startPoint.x, wall.startPoint.y);
        const p2 = worldToScreen(wall.endPoint.x, wall.endPoint.y);
        const thicknessPx = Math.max(3, wall.thickness * zoom);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isSelected ? '#f59e0b' : colors.wall || '#94a3b8';
        ctx.lineWidth = thicknessPx;
        ctx.lineCap = 'butt';
        ctx.stroke();

        // Outline borders
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isSelected ? '#ffffff' : '#334155';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Midpoint Label
        const midWorld = {
          x: (wall.startPoint.x + wall.endPoint.x) / 2,
          y: (wall.startPoint.y + wall.endPoint.y) / 2,
        };
        const midScr = worldToScreen(midWorld.x, midWorld.y);
        ctx.fillStyle = isSelected ? '#f59e0b' : '#e2e8f0';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${wall.mark} (${wall.thickness * 1000}mm)`, midScr.x, midScr.y - 6);

        if (isSelected || toolMode === 'resize') {
          drawSquareGrip(wall.startPoint, 8, isSelected ? '#f59e0b' : '#94a3b8');
          drawSquareGrip(wall.endPoint, 8, isSelected ? '#f59e0b' : '#94a3b8');
          drawRoundGrip(midWorld, 4.5, '#38bdf8');
        }
        ctx.restore();
      });

    // 7. Draw Beams
    elements
      .filter((e): e is BeamElement => e.type === 'beam')
      .forEach((beam) => {
        ctx.save();
        const isSelected = beam.selected;
        const p1 = worldToScreen(beam.startPoint.x, beam.startPoint.y);
        const p2 = worldToScreen(beam.endPoint.x, beam.endPoint.y);
        const widthPx = Math.max(3, beam.width * zoom);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isSelected ? '#f59e0b' : colors.beam || '#6366f1';
        ctx.lineWidth = widthPx;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Midpoint Label
        const midWorld = {
          x: (beam.startPoint.x + beam.endPoint.x) / 2,
          y: (beam.startPoint.y + beam.endPoint.y) / 2,
        };
        const midScr = worldToScreen(midWorld.x, midWorld.y);
        const span = distance(beam.startPoint, beam.endPoint);

        ctx.fillStyle = isSelected ? '#f59e0b' : '#a5b4fc';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${beam.mark} • L=${span.toFixed(2)}m`, midScr.x, midScr.y - 6);

        if (isSelected || toolMode === 'resize') {
          drawSquareGrip(beam.startPoint, 8, isSelected ? '#f59e0b' : '#6366f1');
          drawSquareGrip(beam.endPoint, 8, isSelected ? '#f59e0b' : '#6366f1');
          drawRoundGrip(midWorld, 4.5, '#38bdf8');
        }
        ctx.restore();
      });

    // 8. Draw Text Annotations (Constant screen size - does not inflate when zooming)
    elements
      .filter((e): e is TextAnnotation => e.type === 'text')
      .forEach((txt) => {
        ctx.save();
        const isSelected = txt.selected;
        const p = worldToScreen(txt.x, txt.y);
        const fontSizePx = 12;
        ctx.font = `600 ${fontSizePx}px "JetBrains Mono", system-ui, sans-serif`;
        const textMetrics = ctx.measureText(txt.text);
        const w = textMetrics.width + 10;
        const h = fontSizePx + 8;

        ctx.fillStyle = isSelected ? 'rgba(245, 158, 11, 0.25)' : 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = isSelected ? '#f59e0b' : '#334155';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.fillRect(p.x - 5, p.y - fontSizePx - 3, w, h);
        ctx.strokeRect(p.x - 5, p.y - fontSizePx - 3, w, h);

        ctx.fillStyle = isSelected ? '#f59e0b' : txt.color || '#e2e8f0';
        ctx.fillText(txt.text, p.x, p.y);

        if (isSelected || toolMode === 'text') {
          drawSquareGrip({ x: txt.x, y: txt.y }, 7, '#f59e0b');
        }
        ctx.restore();
      });

    // 9. Draw Dimension Annotations (Constant screen offset and font size - does not scale with zoom)
    elements
      .filter((e): e is DimensionAnnotation => e.type === 'annotation')
      .forEach((ann) => {
        if (ann.points.length < 2) return;
        const isSelected = !!ann.selected;
        ctx.save();
        ctx.strokeStyle = isSelected ? '#f59e0b' : ann.color || colors.annotation || '#f59e0b';
        ctx.fillStyle = isSelected ? '#f59e0b' : ann.color || colors.annotation || '#f59e0b';
        ctx.lineWidth = isSelected ? 2.5 : 1.2;
        if (isSelected) {
          ctx.setLineDash([5, 4]);
        }

        for (let i = 0; i < ann.points.length - 1; i++) {
          const p1 = ann.points[i];
          const p2 = ann.points[i + 1];

          const sP1 = worldToScreen(p1.x, p1.y);
          const sP2 = worldToScreen(p2.x, p2.y);

          const sDx = sP2.x - sP1.x;
          const sDy = sP2.y - sP1.y;
          const sLen = Math.hypot(sDx, sDy);
          if (sLen === 0) continue;

          // Normal in screen space so offset is strictly in screen pixels (never scales with zoom)
          const snx = -sDy / sLen;
          const sny = sDx / sLen;
          const screenOffset = 22; // exactly 22px offset from measured line

          const sOffP1 = { x: sP1.x + snx * screenOffset, y: sP1.y + sny * screenOffset };
          const sOffP2 = { x: sP2.x + snx * screenOffset, y: sP2.y + sny * screenOffset };

          // Extension lines (extending 4px past dimension line)
          ctx.beginPath();
          ctx.moveTo(sP1.x, sP1.y);
          ctx.lineTo(sP1.x + snx * (screenOffset + 4), sP1.y + sny * (screenOffset + 4));
          ctx.moveTo(sP2.x, sP2.y);
          ctx.lineTo(sP2.x + snx * (screenOffset + 4), sP2.y + sny * (screenOffset + 4));
          ctx.stroke();

          // Dimension line
          ctx.beginPath();
          ctx.moveTo(sOffP1.x, sOffP1.y);
          ctx.lineTo(sOffP2.x, sOffP2.y);
          ctx.stroke();

          // 45-degree architectural tick marks (5px)
          const tickLen = 5;
          const tx = (sDx / sLen) * tickLen;
          const ty = (sDy / sLen) * tickLen;
          const tnx = snx * tickLen;
          const tny = sny * tickLen;
          ctx.beginPath();
          ctx.moveTo(sOffP1.x - tx - tnx, sOffP1.y - ty - tny);
          ctx.lineTo(sOffP1.x + tx + tnx, sOffP1.y + ty + tny);
          ctx.moveTo(sOffP2.x - tx - tnx, sOffP2.y - ty - tny);
          ctx.lineTo(sOffP2.x + tx + tnx, sOffP2.y + ty + tny);
          ctx.stroke();

          // Text label outside line (fixed font size: 11px)
          const segDist = ann.segments ? ann.segments[i] : distance(p1, p2);
          const midOff = {
            x: (sOffP1.x + sOffP2.x) / 2,
            y: (sOffP1.y + sOffP2.y) / 2,
          };

          const labelText = `${segDist.toFixed(2)}m`;
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          const textWidth = ctx.measureText(labelText).width;

          // Background box for label readability (fixed 16px high)
          ctx.save();
          ctx.fillStyle = isSelected ? 'rgba(245, 158, 11, 0.35)' : 'rgba(15, 23, 42, 0.88)';
          ctx.strokeStyle = isSelected ? '#f59e0b' : '#334155';
          ctx.lineWidth = isSelected ? 1.5 : 1;
          ctx.setLineDash([]);
          ctx.fillRect(midOff.x - textWidth / 2 - 4, midOff.y - 8, textWidth + 8, 16);
          ctx.strokeRect(midOff.x - textWidth / 2 - 4, midOff.y - 8, textWidth + 8, 16);
          ctx.restore();

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = isSelected ? '#fef08a' : '#f8fafc';
          ctx.fillText(labelText, midOff.x, midOff.y);

          if (isSelected) {
            drawSquareGrip(p1, 6, '#f59e0b');
            drawSquareGrip(p2, 6, '#f59e0b');
          }
        }
        ctx.restore();
      });

    // 10. Live Preview of Active Drawing Commands
    // Move Tool displacement vector & preview
    if (toolMode === 'move') {
      const snapOrMouse = activeSnap ? activeSnap.point : cursorWorld;
      if (moveBasePoint) {
        const p1 = worldToScreen(moveBasePoint.x, moveBasePoint.y);
        const p2 = worldToScreen(snapOrMouse.x, snapOrMouse.y);
        const dx = (snapOrMouse.x - moveBasePoint.x) * scaleCalibration.metersPerUnit;
        const dy = (snapOrMouse.y - moveBasePoint.y) * scaleCalibration.metersPerUnit;
        const curDist = Math.hypot(dx, dy);

        ctx.save();
        // Line connecting base point to cursor
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();

        // Draw Base point circle & Destination crosshair
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 8, 0, Math.PI * 2);
        ctx.moveTo(p2.x - 12, p2.y);
        ctx.lineTo(p2.x + 12, p2.y);
        ctx.moveTo(p2.x, p2.y - 12);
        ctx.lineTo(p2.x, p2.y + 12);
        ctx.stroke();

        // Displacement Badge
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const badgeText = `ΔX: ${dx >= 0 ? '+' : ''}${dx.toFixed(2)}m  ΔY: ${dy >= 0 ? '+' : ''}${dy.toFixed(2)}m (${curDist.toFixed(2)}m)`;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        const tw = ctx.measureText(badgeText).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1;
        ctx.fillRect(mid.x - tw / 2 - 6, mid.y - 20, tw + 12, 18);
        ctx.strokeRect(mid.x - tw / 2 - 6, mid.y - 20, tw + 12, 18);
        ctx.fillStyle = '#67e8f9';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, mid.x, mid.y - 7);
        ctx.restore();
      } else {
        // Show cursor indicator in move mode
        const p = worldToScreen(snapOrMouse.x, snapOrMouse.y);
        ctx.save();
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Continuous Wall/Beam rubber-band line
    if ((toolMode === 'wall' || toolMode === 'beam') && lineStartPoint) {
      const snapOrMouse = activeSnap ? activeSnap.point : cursorWorld;
      const p1 = worldToScreen(lineStartPoint.x, lineStartPoint.y);
      const p2 = worldToScreen(snapOrMouse.x, snapOrMouse.y);
      const curDist = distance(lineStartPoint, snapOrMouse) * scaleCalibration.metersPerUnit;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = toolMode === 'beam' ? '#6366f1' : '#94a3b8';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      // Dimension badge tooltip
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(mid.x - 30, mid.y - 20, 60, 16);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${curDist.toFixed(2)}m`, mid.x, mid.y - 8);
      ctx.restore();
    }

    // Measure Tool in-progress live preview (fixed 11px font badge)
    if (toolMode === 'measure' && measurePoints.length > 0) {
      const snapOrMouse = activeSnap ? activeSnap.point : cursorWorld;
      ctx.save();
      ctx.beginPath();
      const s0 = worldToScreen(measurePoints[0].x, measurePoints[0].y);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < measurePoints.length; i++) {
        const pt = worldToScreen(measurePoints[i].x, measurePoints[i].y);
        ctx.lineTo(pt.x, pt.y);
      }
      const curScr = worldToScreen(snapOrMouse.x, snapOrMouse.y);
      ctx.lineTo(curScr.x, curScr.y);

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      measurePoints.forEach((pt) => drawSquareGrip(pt, 6, '#f59e0b'));

      // Live distance badge from last point to cursor
      const lastPt = measurePoints[measurePoints.length - 1];
      const curDist = distance(lastPt, snapOrMouse) * scaleCalibration.metersPerUnit;
      const lastScr = worldToScreen(lastPt.x, lastPt.y);
      const mid = { x: (lastScr.x + curScr.x) / 2, y: (lastScr.y + curScr.y) / 2 };

      const badgeText = `${curDist.toFixed(2)}m`;
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      const tw = ctx.measureText(badgeText).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.fillRect(mid.x - tw / 2 - 4, mid.y - 10, tw + 8, 18);
      ctx.strokeRect(mid.x - tw / 2 - 4, mid.y - 10, tw + 8, 18);
      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, mid.x, mid.y - 1);
      ctx.restore();
    }

    // Slab polygon in-progress trace
    if (toolMode === 'slab' && slabPoints.length > 0) {
      ctx.save();
      ctx.beginPath();
      const s0 = worldToScreen(slabPoints[0].x, slabPoints[0].y);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < slabPoints.length; i++) {
        const pt = worldToScreen(slabPoints[i].x, slabPoints[i].y);
        ctx.lineTo(pt.x, pt.y);
      }
      const curScr = worldToScreen(cursorWorld.x, cursorWorld.y);
      ctx.lineTo(curScr.x, curScr.y);

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      slabPoints.forEach((pt) => drawSquareGrip(pt, 6, '#10b981'));
      ctx.restore();
    }

    // Footing trace in-progress
    if (toolMode === 'footing' && footingSubMode === 'multipoint' && footingPoints.length > 0) {
      ctx.save();
      ctx.beginPath();
      const s0 = worldToScreen(footingPoints[0].x, footingPoints[0].y);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < footingPoints.length; i++) {
        const pt = worldToScreen(footingPoints[i].x, footingPoints[i].y);
        ctx.lineTo(pt.x, pt.y);
      }
      const curScr = worldToScreen(cursorWorld.x, cursorWorld.y);
      ctx.lineTo(curScr.x, curScr.y);

      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      footingPoints.forEach((pt) => drawSquareGrip(pt, 6, '#ea580c'));
      ctx.restore();
    }

    // Column trace in-progress
    if (toolMode === 'column' && columnSubMode === 'multipoint' && columnPoints.length > 0) {
      ctx.save();
      ctx.beginPath();
      const s0 = worldToScreen(columnPoints[0].x, columnPoints[0].y);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < columnPoints.length; i++) {
        const pt = worldToScreen(columnPoints[i].x, columnPoints[i].y);
        ctx.lineTo(pt.x, pt.y);
      }
      const curScr = worldToScreen(cursorWorld.x, cursorWorld.y);
      ctx.lineTo(curScr.x, curScr.y);

      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      columnPoints.forEach((pt) => drawSquareGrip(pt, 6, '#dc2626'));
      ctx.restore();
    }

    // Move Tool Live Translation Preview
    if (toolMode === 'move' && moveBasePoint) {
      const snapOrMouse = activeSnap ? activeSnap.point : cursorWorld;
      const p1 = worldToScreen(moveBasePoint.x, moveBasePoint.y);
      const p2 = worldToScreen(snapOrMouse.x, snapOrMouse.y);
      const dxM = (snapOrMouse.x - moveBasePoint.x) * scaleCalibration.metersPerUnit;
      const dyM = (snapOrMouse.y - moveBasePoint.y) * scaleCalibration.metersPerUnit;
      const totalDist = Math.hypot(dxM, dyM);

      ctx.save();
      // 1. Dashed displacement vector line
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([6, 4]);
      ctx.stroke();

      // 2. Base point marker (crosshair & circle)
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p1.x - 14, p1.y);
      ctx.lineTo(p1.x + 14, p1.y);
      ctx.moveTo(p1.x, p1.y - 14);
      ctx.lineTo(p1.x, p1.y + 14);
      ctx.stroke();

      // Base Point Label
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BASE POINT', p1.x, p1.y - 16);

      // 3. Destination crosshair & circle
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p2.x - 12, p2.y);
      ctx.lineTo(p2.x + 12, p2.y);
      ctx.moveTo(p2.x, p2.y - 12);
      ctx.lineTo(p2.x, p2.y + 12);
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.fillText('DESTINATION', p2.x, p2.y + 20);

      // 4. Live Displacement Badge at midpoint
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const badgeText = `ΔX: ${dxM >= 0 ? '+' : ''}${dxM.toFixed(2)}m  ΔY: ${dyM >= 0 ? '+' : ''}${dyM.toFixed(2)}m  (Dist: ${totalDist.toFixed(2)}m)`;
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      const tw = ctx.measureText(badgeText).width;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([]);
      ctx.fillRect(mid.x - tw / 2 - 8, mid.y - 18, tw + 16, 26);
      ctx.strokeRect(mid.x - tw / 2 - 8, mid.y - 18, tw + 16, 26);

      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, mid.x, mid.y - 5);

      ctx.restore();
    }

    // Selection Marquee Box
    if (selectionBox && selectionBox.active) {
      const p1 = worldToScreen(selectionBox.start.x, selectionBox.start.y);
      const p2 = worldToScreen(selectionBox.current.x, selectionBox.current.y);
      const x = Math.min(p1.x, p2.x);
      const y = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x);
      const h = Math.abs(p2.y - p1.y);

      ctx.save();
      // Green crossing window if dragged left-to-right or right-to-left
      ctx.fillStyle = selectionBox.current.x < selectionBox.start.x ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = selectionBox.current.x < selectionBox.start.x ? '#22c55e' : '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    // Object Snap Indicator
    if (activeSnap) {
      const sp = worldToScreen(activeSnap.point.x, activeSnap.point.y);
      ctx.save();
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2;
      ctx.strokeRect(sp.x - 7, sp.y - 7, 14, 14);
      ctx.fillStyle = '#eab308';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(activeSnap.label || activeSnap.type, sp.x + 10, sp.y - 8);
      ctx.restore();
    }

    ctx.restore();
  }, [
    viewState,
    elements,
    dxfEntities,
    colors,
    activeSnap,
    lineStartPoint,
    slabPoints,
    measurePoints,
    footingPoints,
    columnPoints,
    footingSubMode,
    columnSubMode,
    selectionBox,
    toolMode,
    moveBasePoint,
    scaleCalibration,
    cursorWorld,
    screenToWorld,
    worldToScreen,
  ]);

  // Mouse Move: Track cursor, pan, marquee selection, drag grips, snap detection
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // 1. Pan
    if (isPanningRef.current) {
      const dx = screenX - panStartRef.current.x;
      const dy = screenY - panStartRef.current.y;
      panStartRef.current = { x: screenX, y: screenY };
      setViewState((prev) => {
        const next = {
          ...prev,
          panX: prev.panX + dx,
          panY: prev.panY + dy,
        };
        viewStateRef.current = next;
        return next;
      });
      return;
    }

    const worldPos = screenToWorld(screenX, screenY);
    setCursorWorld(worldPos);

    // 2. Active Grip Dragging (Live Resizing via Mouse)
    if (activeGrip) {
      const targetPos = activeSnap ? activeSnap.point : worldPos;
      const updatedElements = elements.map((el) => {
        if (el.id !== activeGrip.elementId) return el;

        // Slab vertex dragging
        if (el.type === 'slab' && activeGrip.vertexIndex !== undefined) {
          const newPts = [...el.points];
          newPts[activeGrip.vertexIndex] = targetPos;
          return { ...el, points: newPts };
        }

        // Footing polygon vertex dragging
        if (el.type === 'footing' && el.points && activeGrip.vertexIndex !== undefined) {
          const newPts = [...el.points];
          newPts[activeGrip.vertexIndex] = targetPos;
          return { ...el, points: newPts };
        }

        // Column polygon vertex dragging
        if (el.type === 'column' && el.points && activeGrip.vertexIndex !== undefined) {
          const newPts = [...el.points];
          newPts[activeGrip.vertexIndex] = targetPos;
          return { ...el, points: newPts };
        }

        // Wall & Beam endpoints dragging
        if (el.type === 'wall' || el.type === 'beam') {
          if (activeGrip.gripType === 'start') {
            return { ...el, startPoint: targetPos };
          }
          if (activeGrip.gripType === 'end') {
            return { ...el, endPoint: targetPos };
          }
          if (activeGrip.gripType === 'midpoint') {
            const dx = targetPos.x - (el.startPoint.x + el.endPoint.x) / 2;
            const dy = targetPos.y - (el.startPoint.y + el.endPoint.y) / 2;
            return {
              ...el,
              startPoint: { x: el.startPoint.x + dx, y: el.startPoint.y + dy },
              endPoint: { x: el.endPoint.x + dx, y: el.endPoint.y + dy },
            };
          }
        }

        // Rectangular Column resizing or rotating
        if (el.type === 'column' && !el.points) {
          if (activeGrip.gripType === 'corner') {
            const hw = Math.max(0.1, Math.abs(targetPos.x - el.x));
            const hd = Math.max(0.1, Math.abs(targetPos.y - el.y));
            return { ...el, width: hw * 2, depth: hd * 2 };
          }
          if (activeGrip.gripType === 'rotation') {
            const angleRad = Math.atan2(targetPos.y - el.y, targetPos.x - el.x);
            const rot = ((angleRad * 180) / Math.PI - 90 + 360) % 360;
            return { ...el, rotation: rot };
          }
        }

        // Rectangular Footing resizing or rotating
        if (el.type === 'footing' && !el.points) {
          if (activeGrip.gripType === 'corner') {
            const hw = Math.max(0.2, Math.abs(targetPos.x - el.x));
            const hl = Math.max(0.2, Math.abs(targetPos.y - el.y));
            return { ...el, width: hw * 2, length: hl * 2 };
          }
          if (activeGrip.gripType === 'rotation') {
            const angleRad = Math.atan2(targetPos.y - el.y, targetPos.x - el.x);
            const rot = ((angleRad * 180) / Math.PI - 90 + 360) % 360;
            return { ...el, rotation: rot };
          }
        }

        // Text Position dragging
        if (el.type === 'text') {
          return { ...el, x: targetPos.x, y: targetPos.y };
        }

        return el;
      });
      onUpdateElements(updatedElements);
      return;
    }

    // 3. Marquee Selection Box
    if (selectionBox && selectionBox.active) {
      setSelectionBox((prev) => (prev ? { ...prev, current: worldPos } : null));

      const minCorner: Point2D = {
        x: Math.min(selectionBox.start.x, worldPos.x),
        y: Math.min(selectionBox.start.y, worldPos.y),
      };
      const maxCorner: Point2D = {
        x: Math.max(selectionBox.start.x, worldPos.x),
        y: Math.max(selectionBox.start.y, worldPos.y),
      };

      // Select BIM elements (including text)
      const updatedElements = elements.map((el) => {
        let isInside = false;
        if (el.type === 'footing') {
          if (el.points) {
            isInside = el.points.some((p) => isPointInRect(p, minCorner, maxCorner));
          } else {
            isInside = isPointInRect({ x: el.x, y: el.y }, minCorner, maxCorner);
          }
        } else if (el.type === 'column') {
          if (el.points) {
            isInside = el.points.some((p) => isPointInRect(p, minCorner, maxCorner));
          } else {
            isInside = isPointInRect({ x: el.x, y: el.y }, minCorner, maxCorner);
          }
        } else if (el.type === 'beam' || el.type === 'wall') {
          isInside = isLineInRect(el.startPoint, el.endPoint, minCorner, maxCorner);
        } else if (el.type === 'slab') {
          isInside = el.points.some((p) => isPointInRect(p, minCorner, maxCorner));
        } else if (el.type === 'annotation') {
          isInside = el.points.some((p) => isPointInRect(p, minCorner, maxCorner));
        } else if (el.type === 'text') {
          isInside = isPointInRect({ x: el.x, y: el.y }, minCorner, maxCorner);
        }
        return { ...el, selected: isInside };
      });
      onUpdateElements(updatedElements);

      // Select DXF lines, polylines, circles, and text!
      const updatedDxf = dxfEntities.map((ent) => {
        let isInside = false;
        if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
          if (ent.points.length > 0) {
            isInside = isPointInRect(ent.points[0], minCorner, maxCorner);
          }
        } else if (ent.type === 'CIRCLE' && ent.center) {
          isInside = isPointInRect(ent.center, minCorner, maxCorner);
        } else if (ent.points.length >= 2) {
          for (let i = 0; i < ent.points.length - 1; i++) {
            if (isLineInRect(ent.points[i], ent.points[i + 1], minCorner, maxCorner)) {
              isInside = true;
              break;
            }
          }
        }
        return { ...ent, selected: isInside };
      });
      onUpdateDxfEntities(updatedDxf);
      return;
    }

    // 4. Snapping calculation
    if (snapEnabled) {
      const snap = findSnapPoint(worldPos, 16, viewState.zoom, elements, dxfEntities);
      setActiveSnap(snap);
    } else {
      setActiveSnap(null);
    }
  };

  // Mouse Down: Check grip clicks, start pan, marquee, text editing, or execute drawing
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Middle button or right button or Alt key initiates PAN
    if (e.button === 1 || e.button === 2 || e.altKey) {
      isPanningRef.current = true;
      panStartRef.current = { x: screenX, y: screenY };
      setIsPanning(true);
      return;
    }

    if (e.button !== 0) return;

    const clickWorld = activeSnap ? activeSnap.point : screenToWorld(screenX, screenY);
    const worldTolerance = 14 / viewState.zoom;

    // 0. TEXT TOOL: Open editor to place new text or edit clicked text
    if (toolMode === 'text') {
      // Check if user clicked an existing TextAnnotation
      const clickedTxt = elements.find(
        (el): el is TextAnnotation =>
          el.type === 'text' && distance({ x: el.x, y: el.y }, clickWorld) <= 1.2
      );
      if (clickedTxt) {
        setTextModalState({
          isOpen: true,
          worldPos: { x: clickedTxt.x, y: clickedTxt.y },
          existingElementId: clickedTxt.id,
          text: clickedTxt.text,
          fontSize: clickedTxt.fontSize || 0.35,
          color: clickedTxt.color || '#ffffff',
        });
        return;
      }

      // Check if user clicked an existing DXF text
      const clickedDxfText = dxfEntities.find(
        (ent) =>
          (ent.type === 'TEXT' || ent.type === 'MTEXT') &&
          ent.points.length > 0 &&
          distance(ent.points[0], clickWorld) <= 1.2
      );
      if (clickedDxfText) {
        setTextModalState({
          isOpen: true,
          worldPos: clickedDxfText.points[0],
          existingDxfId: clickedDxfText.id,
          text: clickedDxfText.text || '',
          fontSize: clickedDxfText.height || 0.35,
          color: '#38bdf8',
        });
        return;
      }

      // Place new text annotation
      setTextModalState({
        isOpen: true,
        worldPos: clickWorld,
        text: '',
        fontSize: 0.35,
        color: '#ffffff',
      });
      return;
    }

    // 1. Check if user clicked an interactive grip on a SELECTED element (in 'select' or 'resize' mode)
    if (toolMode === 'select' || toolMode === 'resize') {
      const selectedEl = elements.find((el) => el.selected);
      if (selectedEl) {
        // Check Slab vertices
        if (selectedEl.type === 'slab') {
          for (let i = 0; i < selectedEl.points.length; i++) {
            if (distance(clickWorld, selectedEl.points[i]) <= worldTolerance) {
              setActiveGrip({
                elementId: selectedEl.id,
                elementType: 'slab',
                gripType: 'vertex',
                vertexIndex: i,
                initialWorld: clickWorld,
                initialElement: selectedEl,
              });
              onStatusMessage(`Resizing Slab ${selectedEl.mark} • Drag vertex to adjust area`);
              return;
            }
          }
        }

        // Check Wall or Beam start, end, midpoint grips
        if (selectedEl.type === 'wall' || selectedEl.type === 'beam') {
          if (distance(clickWorld, selectedEl.startPoint) <= worldTolerance) {
            setActiveGrip({
              elementId: selectedEl.id,
              elementType: selectedEl.type,
              gripType: 'start',
              initialWorld: clickWorld,
              initialElement: selectedEl,
            });
            onStatusMessage(`Dragging ${selectedEl.type} start node`);
            return;
          }
          if (distance(clickWorld, selectedEl.endPoint) <= worldTolerance) {
            setActiveGrip({
              elementId: selectedEl.id,
              elementType: selectedEl.type,
              gripType: 'end',
              initialWorld: clickWorld,
              initialElement: selectedEl,
            });
            onStatusMessage(`Dragging ${selectedEl.type} end node`);
            return;
          }
          const midWorld = {
            x: (selectedEl.startPoint.x + selectedEl.endPoint.x) / 2,
            y: (selectedEl.startPoint.y + selectedEl.endPoint.y) / 2,
          };
          if (distance(clickWorld, midWorld) <= worldTolerance) {
            setActiveGrip({
              elementId: selectedEl.id,
              elementType: selectedEl.type,
              gripType: 'midpoint',
              initialWorld: clickWorld,
              initialElement: selectedEl,
            });
            onStatusMessage(`Moving ${selectedEl.type} baseline`);
            return;
          }
        }

        // Check Column corner or rotation grips
        if (selectedEl.type === 'column') {
          if (selectedEl.points) {
            for (let i = 0; i < selectedEl.points.length; i++) {
              if (distance(clickWorld, selectedEl.points[i]) <= worldTolerance) {
                setActiveGrip({
                  elementId: selectedEl.id,
                  elementType: 'column',
                  gripType: 'vertex',
                  vertexIndex: i,
                  initialWorld: clickWorld,
                  initialElement: selectedEl,
                });
                return;
              }
            }
          } else {
            const hw = selectedEl.width / 2;
            const hd = selectedEl.depth / 2;
            const corners = [
              { x: selectedEl.x + hw, y: selectedEl.y + hd },
              { x: selectedEl.x + hw, y: selectedEl.y - hd },
              { x: selectedEl.x - hw, y: selectedEl.y - hd },
              { x: selectedEl.x - hw, y: selectedEl.y + hd },
            ];
            for (let i = 0; i < corners.length; i++) {
              if (distance(clickWorld, corners[i]) <= worldTolerance) {
                setActiveGrip({
                  elementId: selectedEl.id,
                  elementType: 'column',
                  gripType: 'corner',
                  cornerIndex: i,
                  initialWorld: clickWorld,
                  initialElement: selectedEl,
                });
                onStatusMessage(`Resizing Column ${selectedEl.mark} cross-section`);
                return;
              }
            }
            // Check rotation handle
            const rotHandle = { x: selectedEl.x, y: selectedEl.y + hd + 18 / viewState.zoom };
            if (distance(clickWorld, rotHandle) <= worldTolerance * 1.5) {
              setActiveGrip({
                elementId: selectedEl.id,
                elementType: 'column',
                gripType: 'rotation',
                initialWorld: clickWorld,
                initialElement: selectedEl,
              });
              onStatusMessage(`Rotating Column ${selectedEl.mark}`);
              return;
            }
          }
        }

        // Check Footing corner or rotation grips
        if (selectedEl.type === 'footing') {
          if (selectedEl.points) {
            for (let i = 0; i < selectedEl.points.length; i++) {
              if (distance(clickWorld, selectedEl.points[i]) <= worldTolerance) {
                setActiveGrip({
                  elementId: selectedEl.id,
                  elementType: 'footing',
                  gripType: 'vertex',
                  vertexIndex: i,
                  initialWorld: clickWorld,
                  initialElement: selectedEl,
                });
                return;
              }
            }
          } else {
            const hw = selectedEl.width / 2;
            const hl = selectedEl.length / 2;
            const corners = [
              { x: selectedEl.x + hw, y: selectedEl.y + hl },
              { x: selectedEl.x + hw, y: selectedEl.y - hl },
              { x: selectedEl.x - hw, y: selectedEl.y - hl },
              { x: selectedEl.x - hw, y: selectedEl.y + hl },
            ];
            for (let i = 0; i < corners.length; i++) {
              if (distance(clickWorld, corners[i]) <= worldTolerance) {
                setActiveGrip({
                  elementId: selectedEl.id,
                  elementType: 'footing',
                  gripType: 'corner',
                  cornerIndex: i,
                  initialWorld: clickWorld,
                  initialElement: selectedEl,
                });
                onStatusMessage(`Resizing Footing ${selectedEl.mark} width & length`);
                return;
              }
            }
            // Check rotation handle
            const rotHandle = { x: selectedEl.x, y: selectedEl.y + hl + 18 / viewState.zoom };
            if (distance(clickWorld, rotHandle) <= worldTolerance * 1.5) {
              setActiveGrip({
                elementId: selectedEl.id,
                elementType: 'footing',
                gripType: 'rotation',
                initialWorld: clickWorld,
                initialElement: selectedEl,
              });
              onStatusMessage(`Rotating Footing ${selectedEl.mark}`);
              return;
            }
          }
        }
      }
    }

    // 1b. MOVE TOOL Mode: Step 1 Base Point -> Step 2 Destination (Enter to cancel)
    if (toolMode === 'move') {
      const snapOrClick = activeSnap ? activeSnap.point : clickWorld;
      const anySelected = elements.some((el) => el.selected) || dxfEntities.some((ent) => ent.selected);

      if (!moveBasePoint) {
        // Step 1: Set base reference point
        setMoveBasePoint(snapOrClick);
        const selCount = anySelected
          ? elements.filter((e) => e.selected).length + dxfEntities.filter((e) => e.selected).length
          : elements.length + dxfEntities.length;
        onStatusMessage(
          `Base point set at (${snapOrClick.x.toFixed(2)}, ${snapOrClick.y.toFixed(2)}) for ${selCount} item(s). Click Destination Point to complete move, or press ENTER to cancel.`
        );
      } else {
        // Step 2: Compute translation delta and translate all selected elements (or all elements if none explicitly selected)
        const dx = snapOrClick.x - moveBasePoint.x;
        const dy = snapOrClick.y - moveBasePoint.y;

        const updatedElements = elements.map((el) => {
          if (anySelected && !el.selected) return el;
          if (el.type === 'footing') {
            return {
              ...el,
              x: el.x + dx,
              y: el.y + dy,
              points: el.points ? el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) : undefined,
            };
          }
          if (el.type === 'column') {
            return {
              ...el,
              x: el.x + dx,
              y: el.y + dy,
              points: el.points ? el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) : undefined,
            };
          }
          if (el.type === 'beam' || el.type === 'wall') {
            return {
              ...el,
              startPoint: { x: el.startPoint.x + dx, y: el.startPoint.y + dy },
              endPoint: { x: el.endPoint.x + dx, y: el.endPoint.y + dy },
            };
          }
          if (el.type === 'slab') {
            return {
              ...el,
              points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            };
          }
          if (el.type === 'annotation') {
            return {
              ...el,
              points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
            };
          }
          if (el.type === 'text') {
            return {
              ...el,
              x: el.x + dx,
              y: el.y + dy,
            };
          }
          return el;
        });

        const updatedDxf = dxfEntities.map((ent) => {
          if (anySelected && !ent.selected) return ent;
          return {
            ...ent,
            points: ent.points ? ent.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) : [],
            center: ent.center ? { x: ent.center.x + dx, y: ent.center.y + dy } : undefined,
          };
        });

        onUpdateElements(updatedElements);
        onUpdateDxfEntities(updatedDxf);
        setMoveBasePoint(null);
        setToolMode('select');
        onStatusMessage(
          `Moved drawing items successfully by dx=${dx >= 0 ? '+' : ''}${(dx * scaleCalibration.metersPerUnit).toFixed(2)}m, dy=${dy >= 0 ? '+' : ''}${(dy * scaleCalibration.metersPerUnit).toFixed(2)}m.`
        );
      }
      return;
    }

    // 2. SELECT BOX (Marquee) Mode
    if (toolMode === 'selectBox') {
      setSelectionBox({
        start: clickWorld,
        current: clickWorld,
        active: true,
      });
      return;
    }

    // 3. SCALE CALIBRATION WIZARD
    if (scaleCalibration.active) {
      if (scaleCalibration.step === 'point1') {
        onUpdateCalibration({
          point1: clickWorld,
          step: 'point2',
        });
        onStatusMessage('Point 1 marked. Click Point 2 to set reference dimension.');
      } else if (scaleCalibration.step === 'point2' && scaleCalibration.point1) {
        const d = distance(scaleCalibration.point1, clickWorld);
        onUpdateCalibration({
          point2: clickWorld,
          pixelDistance: d,
          step: 'input',
        });
        onStatusMessage(`Reference distance: ${d.toFixed(2)} units. Enter real-world meters in modal.`);
      }
      return;
    }

    // 4. SELECT or RESIZE Mode: Pick individual BIM element or DXF entity
    if (toolMode === 'select' || toolMode === 'resize') {
      let clickedBimId: string | null = null;

      // Check annotations first
      for (const el of elements) {
        if (el.type === 'annotation') {
          let hit = false;
          for (let i = 0; i < el.points.length - 1; i++) {
            const p1 = el.points[i];
            const p2 = el.points[i + 1];

            const sP1 = worldToScreen(p1.x, p1.y);
            const sP2 = worldToScreen(p2.x, p2.y);

            // Check endpoint grips in screen pixels
            if (Math.hypot(sP1.x - screenX, sP1.y - screenY) <= 18 || Math.hypot(sP2.x - screenX, sP2.y - screenY) <= 18) {
              hit = true;
              break;
            }

            const sDx = sP2.x - sP1.x;
            const sDy = sP2.y - sP1.y;
            const sLen = Math.hypot(sDx, sDy);
            if (sLen > 0) {
              const snx = -sDy / sLen;
              const sny = sDx / sLen;
              const sOffP1 = { x: sP1.x + snx * 22, y: sP1.y + sny * 22 };
              const sOffP2 = { x: sP2.x + snx * 22, y: sP2.y + sny * 22 };
              const midOff = { x: (sOffP1.x + sOffP2.x) / 2, y: (sOffP1.y + sOffP2.y) / 2 };

              // Check dimension text badge in screen pixels
              if (Math.hypot(midOff.x - screenX, midOff.y - screenY) <= 24) {
                hit = true;
                break;
              }

              // Check offset dimension line
              const l2Off = (sOffP2.x - sOffP1.x) ** 2 + (sOffP2.y - sOffP1.y) ** 2;
              if (l2Off > 0) {
                let t = ((screenX - sOffP1.x) * (sOffP2.x - sOffP1.x) + (screenY - sOffP1.y) * (sOffP2.y - sOffP1.y)) / l2Off;
                t = Math.max(0, Math.min(1, t));
                const closeX = sOffP1.x + t * (sOffP2.x - sOffP1.x);
                const closeY = sOffP1.y + t * (sOffP2.y - sOffP1.y);
                if (Math.hypot(screenX - closeX, screenY - closeY) <= 14) {
                  hit = true;
                  break;
                }
              }

              // Check base line segment
              const l2Base = sDx ** 2 + sDy ** 2;
              if (l2Base > 0) {
                let t = ((screenX - sP1.x) * sDx + (screenY - sP1.y) * sDy) / l2Base;
                t = Math.max(0, Math.min(1, t));
                const closeX = sP1.x + t * sDx;
                const closeY = sP1.y + t * sDy;
                if (Math.hypot(screenX - closeX, screenY - closeY) <= 14) {
                  hit = true;
                  break;
                }
              }
            }
          }
          if (hit) {
            clickedBimId = el.id;
            break;
          }
        }
      }

      // Check columns next (higher specificity than footings/slabs)
      if (!clickedBimId) {
        for (const el of elements) {
          if (el.type === 'column') {
            if (el.points && el.points.length >= 3) {
              if (isPointInPolygon(clickWorld, el.points) || el.points.some((p) => distance(p, clickWorld) <= 0.4)) {
                clickedBimId = el.id;
                break;
              }
            } else {
              const rotRad = -((el.rotation || 0) * Math.PI) / 180;
              const dx = clickWorld.x - el.x;
              const dy = clickWorld.y - el.y;
              const localX = dx * Math.cos(rotRad) - dy * Math.sin(rotRad);
              const localY = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);
              if (Math.abs(localX) <= el.width / 2 + 0.15 && Math.abs(localY) <= el.depth / 2 + 0.15) {
                clickedBimId = el.id;
                break;
              }
            }
          }
        }
      }

      // Check text annotations next
      if (!clickedBimId) {
        for (const el of elements) {
          if (el.type === 'text') {
            if (distance({ x: el.x, y: el.y }, clickWorld) <= 1.0) {
              clickedBimId = el.id;
              break;
            }
          }
        }
      }

      // Check beams and walls next
      if (!clickedBimId) {
        for (const el of elements) {
          if (el.type === 'beam' || el.type === 'wall') {
            const d1 = distance(el.startPoint, clickWorld);
            const d2 = distance(clickWorld, el.endPoint);
            const lineLen = distance(el.startPoint, el.endPoint);
            const tol = (el.type === 'beam' ? el.width : el.thickness) / 2 + 0.25;
            if (Math.abs(d1 + d2 - lineLen) <= tol) {
              clickedBimId = el.id;
              break;
            }
          }
        }
      }

      // Check footings next
      if (!clickedBimId) {
        for (const el of elements) {
          if (el.type === 'footing') {
            if (el.points && el.points.length >= 3) {
              if (isPointInPolygon(clickWorld, el.points) || el.points.some((p) => distance(p, clickWorld) <= 0.6)) {
                clickedBimId = el.id;
                break;
              }
            } else {
              const rotRad = -((el.rotation || 0) * Math.PI) / 180;
              const dx = clickWorld.x - el.x;
              const dy = clickWorld.y - el.y;
              const localX = dx * Math.cos(rotRad) - dy * Math.sin(rotRad);
              const localY = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);
              if (Math.abs(localX) <= el.width / 2 + 0.2 && Math.abs(localY) <= el.length / 2 + 0.2) {
                clickedBimId = el.id;
                break;
              }
            }
          }
        }
      }

      // Check slabs last (broadest area)
      if (!clickedBimId) {
        for (const el of elements) {
          if (el.type === 'slab') {
            if (isPointInPolygon(clickWorld, el.points) || el.points.some((p) => distance(p, clickWorld) <= 0.5)) {
              clickedBimId = el.id;
              break;
            }
          }
        }
      }

      if (clickedBimId) {
        const found = elements.find((el) => el.id === clickedBimId);
        if (found && found.type === 'annotation') {
          const updated = elements.map((el) => ({
            ...el,
            selected: e.shiftKey ? (el.id === clickedBimId ? !el.selected : el.selected) : el.id === clickedBimId,
          }));
          onUpdateElements(updated);
          if (!e.shiftKey) {
            onUpdateDxfEntities(dxfEntities.map((ent) => (ent.selected ? { ...ent, selected: false } : ent)));
          }
          onStatusMessage('Selected Measure / Dimension Annotation • Press Delete or Remove button to delete');
          return;
        }
        if (found && found.type === 'text') {
          const targetText = found.text;
          const updated = elements.map((el) => ({
            ...el,
            selected:
              el.type === 'text' && isMatchingDxfText(el.text, targetText)
                ? true
                : e.shiftKey
                ? el.selected
                : false,
          }));
          onUpdateElements(updated);
          if (!e.shiftKey) {
            onUpdateDxfEntities(dxfEntities.map((ent) => (ent.selected ? { ...ent, selected: false } : ent)));
          }
          const matchedCount = updated.filter((el) => el.selected).length;
          onStatusMessage(
            `Auto-selected all ${matchedCount} matching annotations: "${targetText}" • Press Delete to remove all`
          );
          return;
        }

        const updated = elements.map((el) => ({
          ...el,
          selected: e.shiftKey ? (el.id === clickedBimId ? !el.selected : el.selected) : el.id === clickedBimId,
        }));
        onUpdateElements(updated);
        if (!e.shiftKey) {
          onUpdateDxfEntities(dxfEntities.map((ent) => (ent.selected ? { ...ent, selected: false } : ent)));
        }

        const markStr = found && 'mark' in found ? found.mark : '';
        onStatusMessage(`Selected ${found?.type.toUpperCase()} ${markStr} • Dimensions shown in Properties panel`);
      } else {
        // First check if clicked a DXF TEXT / MTEXT entity (e.g. \FROMANC.SHX;\W0.9000000000;\T1.0000000000;\o\l42)
        const clickedDxfText = dxfEntities.find((ent) => {
          if (ent.type !== 'TEXT' && ent.type !== 'MTEXT') return false;
          if (!ent.points || ent.points.length === 0 || !ent.text) return false;
          const p = ent.points[0];
          const h = ent.height || 0.35;
          const displayText = cleanDxfText(ent.text) || ent.text;
          const w = Math.max(displayText.length * h * 0.6, 1.0);
          return (
            distance(p, clickWorld) <= 1.2 ||
            (clickWorld.x >= p.x - 0.4 &&
              clickWorld.x <= p.x + w + 0.4 &&
              Math.abs(clickWorld.y - p.y) <= h + 0.4)
          );
        });

        if (clickedDxfText) {
          const targetRaw = clickedDxfText.text || '';
          const cleanTarget = cleanDxfText(targetRaw);

          // AUTO-SELECT ALL matching text entities!
          const updatedDxf = dxfEntities.map((ent) => {
            if (ent.type !== 'TEXT' && ent.type !== 'MTEXT') {
              return e.shiftKey ? ent : { ...ent, selected: false };
            }
            const isMatch = isMatchingDxfText(ent.text, targetRaw);
            return {
              ...ent,
              selected: e.shiftKey ? (isMatch ? !ent.selected : ent.selected) : isMatch,
            };
          });

          if (!e.shiftKey) {
            onUpdateElements(elements.map((el) => (el.selected ? { ...el, selected: false } : el)));
          }

          onUpdateDxfEntities(updatedDxf);

          const matchedCount = updatedDxf.filter(
            (ent) => (ent.type === 'TEXT' || ent.type === 'MTEXT') && ent.selected
          ).length;

          const label = cleanTarget || targetRaw.slice(0, 30);
          onStatusMessage(
            `Auto-selected all ${matchedCount} matching texts: "${label}" • Press Delete to remove all`
          );
          return;
        }

        // Check if clicked other DXF entities (lines, polylines, circles)
        const updatedDxf = dxfEntities.map((ent) => {
          let selected = false;
          if (ent.type === 'CIRCLE' && ent.center && ent.radius) {
            const d = distance(ent.center, clickWorld);
            selected = Math.abs(d - ent.radius) < 0.35 || d < 0.35;
          } else if (ent.points.length >= 2) {
            for (let i = 0; i < ent.points.length - 1; i++) {
              const d1 = distance(ent.points[i], clickWorld);
              const d2 = distance(clickWorld, ent.points[i + 1]);
              const segLen = distance(ent.points[i], ent.points[i + 1]);
              if (Math.abs(d1 + d2 - segLen) < 0.35) {
                selected = true;
                break;
              }
            }
          }
          return { ...ent, selected: e.shiftKey ? (selected ? !ent.selected : ent.selected) : selected };
        });

        const anyDxfSelected = updatedDxf.some((ent) => ent.selected);
        if (!anyDxfSelected && !e.shiftKey) {
          onUpdateElements(elements.map((el) => (el.selected ? { ...el, selected: false } : el)));
          onStatusMessage('Cleared selection. Original colors restored.');
        }

        onUpdateDxfEntities(updatedDxf);
      }
      return;
    }

    // 5. FOOTING Tool
    if (toolMode === 'footing') {
      if (footingSubMode === 'multipoint') {
        setFootingPoints((prev) => [...prev, clickWorld]);
        onStatusMessage(`Footing vertex ${footingPoints.length + 1} added. Press C or ENTER to close area.`);
        return;
      }

      if (footingSubMode === 'inclined') {
        if (!footingStartPoint) {
          setFootingStartPoint(clickWorld);
          onStatusMessage('Footing center set. Click second point along DXF line to set inclined angle.');
        } else {
          const angle = (Math.atan2(clickWorld.y - footingStartPoint.y, clickWorld.x - footingStartPoint.x) * 180) / Math.PI;
          const newFooting: FootingElement = {
            id: `footing-${Date.now()}`,
            type: 'footing',
            mark: getNextElementMark('footing', 'F', elements),
            x: footingStartPoint.x,
            y: footingStartPoint.y,
            width: 2.0,
            length: 2.0,
            depth: 0.60,
            elevation: activeLevel ? activeLevel.elevation : -1.50,
            rotation: angle,
            concreteGrade: 'C30/37',
            color: colors.footing,
            levelId: activeLevel?.id,
          };
          onAddElement(newFooting);
          setFootingStartPoint(null);
          onStatusMessage(`Placed Inclined Footing ${newFooting.mark} (${angle.toFixed(1)}°)`);
        }
        return;
      }

      // Default: Standard Rectangle
      const newFooting: FootingElement = {
        id: `footing-${Date.now()}`,
        type: 'footing',
        mark: getNextElementMark('footing', 'F', elements),
        x: clickWorld.x,
        y: clickWorld.y,
        width: 2.0,
        length: 2.0,
        depth: 0.60,
        elevation: activeLevel ? activeLevel.elevation : -1.50,
        concreteGrade: 'C30/37',
        color: colors.footing,
        levelId: activeLevel?.id,
      };
      onAddElement(newFooting);
      onStatusMessage(`Placed Footing ${newFooting.mark} at (${clickWorld.x.toFixed(2)}, ${clickWorld.y.toFixed(2)})`);
      return;
    }

    // 6. COLUMN Tool
    if (toolMode === 'column') {
      if (columnSubMode === 'multipoint') {
        setColumnPoints((prev) => [...prev, clickWorld]);
        onStatusMessage(`Column vertex ${columnPoints.length + 1} added. Press C or ENTER to close area.`);
        return;
      }

      if (columnSubMode === 'inclined') {
        if (!columnStartPoint) {
          setColumnStartPoint(clickWorld);
          onStatusMessage('Column center set. Click along DXF line to set inclined angle.');
        } else {
          const angle = (Math.atan2(clickWorld.y - columnStartPoint.y, clickWorld.x - columnStartPoint.x) * 180) / Math.PI;
          const newCol: ColumnElement = {
            id: `col-${Date.now()}`,
            type: 'column',
            mark: getNextElementMark('column', 'C', elements),
            x: columnStartPoint.x,
            y: columnStartPoint.y,
            width: 0.40,
            depth: 0.40,
            height: activeLevel ? activeLevel.height : 3.00,
            baseElevation: activeLevel ? activeLevel.elevation : 0,
            rotation: angle,
            concreteGrade: 'C35/45',
            color: colors.column,
            levelId: activeLevel?.id,
          };
          onAddElement(newCol);
          setColumnStartPoint(null);
          onStatusMessage(`Placed Inclined Column ${newCol.mark} (${angle.toFixed(1)}°)`);
        }
        return;
      }

      // Check if user clicked an existing Footing to place column on top of it
      const clickedFooting = elements.find(
        (el): el is FootingElement =>
          el.type === 'footing' &&
          Math.abs(el.x - clickWorld.x) <= el.width / 2 &&
          Math.abs(el.y - clickWorld.y) <= el.length / 2
      );

      if (clickedFooting) {
        onOpenColumnModal(clickedFooting);
        onStatusMessage(`Selected Footing ${clickedFooting.mark} for column center`);
      } else {
        const newCol: ColumnElement = {
          id: `col-${Date.now()}`,
          type: 'column',
          mark: getNextElementMark('column', 'C', elements),
          x: clickWorld.x,
          y: clickWorld.y,
          width: 0.40,
          depth: 0.40,
          height: activeLevel ? activeLevel.height : 3.00,
          baseElevation: activeLevel ? activeLevel.elevation : 0,
          concreteGrade: 'C35/45',
          color: colors.column,
          levelId: activeLevel?.id,
        };
        onAddElement(newCol);
        onStatusMessage(`Placed Column ${newCol.mark} at (${clickWorld.x.toFixed(2)}, ${clickWorld.y.toFixed(2)})`);
      }
      return;
    }

    // 7. WALL & BEAM Tool
    if (toolMode === 'wall' || toolMode === 'beam') {
      if (!lineStartPoint) {
        setLineStartPoint(clickWorld);
        onStatusMessage(`First point set for ${toolMode}. Click second point to add segment.`);
      } else {
        const segLen = distance(lineStartPoint, clickWorld) * scaleCalibration.metersPerUnit;
        if (segLen < 0.1) {
          onStatusMessage('Segment too short. Click further away.');
          return;
        }

        if (toolMode === 'wall') {
          const newWall: WallElement = {
            id: `wall-${Date.now()}`,
            type: 'wall',
            mark: getNextElementMark('wall', 'W', elements),
            startPoint: lineStartPoint,
            endPoint: clickWorld,
            thickness: 0.20,
            height: activeLevel ? activeLevel.height : 3.00,
            baseElevation: activeLevel ? activeLevel.elevation : 0,
            concreteGrade: 'C30/37',
            color: colors.wall,
            levelId: activeLevel?.id,
          };
          onAddElement(newWall);
          setLineStartPoint(clickWorld);
          onStatusMessage(`Wall ${newWall.mark} segment created (${segLen.toFixed(2)}m). Click next point or ENTER to end.`);
        } else {
          const newBeam: BeamElement = {
            id: `beam-${Date.now()}`,
            type: 'beam',
            mark: getNextElementMark('beam', 'B', elements),
            startPoint: lineStartPoint,
            endPoint: clickWorld,
            width: 0.30,
            depth: 0.60,
            elevation: activeLevel ? activeLevel.elevation + activeLevel.height : 3.20,
            concreteGrade: 'C30/37',
            color: colors.beam,
            levelId: activeLevel?.id,
          };
          onAddElement(newBeam);
          setLineStartPoint(clickWorld);
          onStatusMessage(`Beam ${newBeam.mark} segment created (${segLen.toFixed(2)}m). Click next point or ENTER to end.`);
        }
      }
      return;
    }

    // 8. SLAB Tool
    if (toolMode === 'slab') {
      setSlabPoints((prev) => [...prev, clickWorld]);
      onStatusMessage(`Slab point ${slabPoints.length + 1} added. Press 'C' or ENTER when finished.`);
      return;
    }

    // 9. MEASURE Tool
    if (toolMode === 'measure') {
      setMeasurePoints((prev) => [...prev, clickWorld]);
      onStatusMessage(`Measure node added. Press ENTER to finalize dimension annotation.`);
      return;
    }
  };

  const handleMouseUp = () => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsPanning(false);
      onSaveViewState?.(viewStateRef.current);
    }
    if (activeGrip) {
      setActiveGrip(null);
      onStatusMessage('Element resized.');
    }
    if (selectionBox && selectionBox.active) {
      setSelectionBox(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseScrX = e.clientX - rect.left;
    const mouseScrY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const currentView = viewStateRef.current;
    const newZoom = Math.min(Math.max(currentView.zoom * zoomFactor, MIN_ZOOM), MAX_ZOOM);

    const worldBeforeX = (mouseScrX - currentView.panX) / currentView.zoom;
    const worldBeforeY = -(mouseScrY - currentView.panY) / currentView.zoom;
    const newPanX = mouseScrX - worldBeforeX * newZoom;
    const newPanY = mouseScrY + worldBeforeY * newZoom;

    const nextView = {
      zoom: newZoom,
      panX: newPanX,
      panY: newPanY,
    };
    viewStateRef.current = nextView;
    setViewState(nextView);

    if (wheelSaveTimerRef.current) {
      window.clearTimeout(wheelSaveTimerRef.current);
    }
    wheelSaveTimerRef.current = window.setTimeout(() => {
      onSaveViewState?.(nextView);
    }, 250);
  };

  // Selected elements counts
  const selectedElementsCount = elements.filter((el) => el.selected).length;
  const selectedDxfCount = dxfEntities.filter((ent) => ent.selected).length;
  const totalSelected = selectedElementsCount + selectedDxfCount;

  // Selected single element for on-canvas quick resize card
  const activeSelectedElement = elements.find((el) => el.selected);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#070b14] select-none">
      {/* Primary 2D Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className={`w-full h-full block ${
          toolMode === 'text'
            ? 'cursor-text'
            : toolMode === 'resize'
            ? 'cursor-crosshair'
            : isPanning
            ? 'cursor-grabbing'
            : activeGrip
            ? 'cursor-nwse-resize'
            : 'cursor-crosshair'
        }`}
      />

      {/* RESIZE MODE TOP BANNER */}
      {toolMode === 'resize' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-cyan-950/95 border border-cyan-500/80 px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md">
          <Scaling className="w-4 h-4 text-cyan-300" />
          <span className="text-xs font-bold text-cyan-200">
            Resize Tool Active: Click any Footing, Column, or Slab to resize graphically or use quick scale presets
          </span>
          <button
            onClick={() => setToolMode('select')}
            className="ml-2 text-xs font-semibold px-2 py-0.5 bg-cyan-800/80 hover:bg-cyan-700 text-white rounded"
          >
            Exit Resize
          </button>
        </div>
      )}

      {/* TEXT TOOL TOP BANNER */}
      {toolMode === 'text' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-purple-950/95 border border-purple-500/80 px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md">
          <Type className="w-4 h-4 text-purple-300" />
          <span className="text-xs font-bold text-purple-200">
            Text Editor Active: Click anywhere to add a text annotation, or click existing text to edit
          </span>
          <button
            onClick={() => setToolMode('select')}
            className="ml-2 text-xs font-semibold px-2 py-0.5 bg-purple-800/80 hover:bg-purple-700 text-white rounded"
          >
            Exit Text
          </button>
        </div>
      )}

      {/* FOOTING SUB-MODE BAR */}
      {toolMode === 'footing' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-slate-900/95 border border-orange-500/60 p-1.5 rounded-xl shadow-2xl backdrop-blur-md">
          <span className="text-xs font-bold text-orange-400 px-2 flex items-center gap-1">
            <Square className="w-3.5 h-3.5" /> Footing Type:
          </span>
          <button
            onClick={() => {
              setFootingSubMode('rectangle');
              setFootingPoints([]);
              setFootingStartPoint(null);
            }}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              footingSubMode === 'rectangle'
                ? 'bg-orange-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Square className="w-3.5 h-3.5" /> Rectangle (2.0×2.0m)
          </button>
          <button
            onClick={() => {
              setFootingSubMode('multipoint');
              setFootingStartPoint(null);
            }}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              footingSubMode === 'multipoint'
                ? 'bg-orange-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Pentagon className="w-3.5 h-3.5" /> Multi-Point (Trace Lines)
          </button>
          <button
            onClick={() => {
              setFootingSubMode('inclined');
              setFootingPoints([]);
            }}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              footingSubMode === 'inclined'
                ? 'bg-orange-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" /> 2-Pt Inclined
          </button>
          {footingSubMode === 'multipoint' && footingPoints.length >= 3 && (
            <button
              onClick={() => {
                const newFooting: FootingElement = {
                  id: `footing-${Date.now()}`,
                  type: 'footing',
                  mark: `F${elements.filter((el) => el.type === 'footing').length + 1}`,
                  x: footingPoints[0].x,
                  y: footingPoints[0].y,
                  width: 2.0,
                  length: 2.0,
                  depth: 0.60,
                  elevation: -1.50,
                  points: [...footingPoints],
                  isPolygon: true,
                  concreteGrade: 'C30/37',
                  color: colors.footing,
                };
                onAddElement(newFooting);
                setFootingPoints([]);
                onStatusMessage(`Polygon Footing ${newFooting.mark} created`);
              }}
              className="ml-2 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow"
            >
              <CornerDownLeft className="w-3.5 h-3.5" /> Close (C / Enter)
            </button>
          )}
        </div>
      )}

      {/* COLUMN SUB-MODE BAR */}
      {toolMode === 'column' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-slate-900/95 border border-red-500/60 p-1.5 rounded-xl shadow-2xl backdrop-blur-md">
          <span className="text-xs font-bold text-red-400 px-2 flex items-center gap-1">
            <Square className="w-3.5 h-3.5" /> Column Type:
          </span>
          <button
            onClick={() => {
              setColumnSubMode('rectangle');
              setColumnPoints([]);
              setColumnStartPoint(null);
            }}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              columnSubMode === 'rectangle'
                ? 'bg-red-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Square className="w-3.5 h-3.5" /> Rectangle (0.4×0.4m)
          </button>
          <button
            onClick={() => {
              setColumnSubMode('multipoint');
              setColumnStartPoint(null);
            }}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              columnSubMode === 'multipoint'
                ? 'bg-red-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Pentagon className="w-3.5 h-3.5" /> Multi-Point (Trace Lines)
          </button>
          <button
            onClick={() => {
              setColumnSubMode('inclined');
              setColumnPoints([]);
            }}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              columnSubMode === 'inclined'
                ? 'bg-red-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" /> 2-Pt Inclined
          </button>
          {columnSubMode === 'multipoint' && columnPoints.length >= 3 && (
            <button
              onClick={() => {
                const newCol: ColumnElement = {
                  id: `col-${Date.now()}`,
                  type: 'column',
                  mark: `C${elements.filter((el) => el.type === 'column').length + 1}`,
                  x: columnPoints[0].x,
                  y: columnPoints[0].y,
                  width: 0.40,
                  depth: 0.40,
                  height: 3.00,
                  baseElevation: 0,
                  points: [...columnPoints],
                  isPolygon: true,
                  concreteGrade: 'C35/45',
                  color: colors.column,
                };
                onAddElement(newCol);
                setColumnPoints([]);
                onStatusMessage(`Polygon Column ${newCol.mark} created`);
              }}
              className="ml-2 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow"
            >
              <CornerDownLeft className="w-3.5 h-3.5" /> Close (C / Enter)
            </button>
          )}
        </div>
      )}

      {/* CONTINUOUS CHAIN PROMPT (For Walls & Beams) */}
      {(toolMode === 'wall' || toolMode === 'beam') && lineStartPoint && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-slate-900/95 border border-indigo-500/60 px-3 py-1.5 rounded-xl shadow-xl backdrop-blur-md">
          <span className="text-xs font-semibold text-indigo-300">
            Drawing continuous {toolMode} chain: Click next point to add segment
          </span>
          <button
            onClick={() => {
              setLineStartPoint(null);
              onStatusMessage(`${toolMode} chain completed.`);
            }}
            className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded flex items-center gap-1"
          >
            Finish (ENTER)
          </button>
          <button
            onClick={() => {
              setLineStartPoint(null);
              onStatusMessage('Cancelled current segment (ESC)');
            }}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MEASURE TOOL PROMPT & REMOVE BAR */}
      {toolMode === 'measure' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-slate-900/95 border border-amber-500/70 px-3.5 py-1.5 rounded-xl shadow-xl backdrop-blur-md">
          <Ruler className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold text-amber-200">
            {measurePoints.length === 0
              ? 'Click 1st point to measure'
              : `${measurePoints.length} point(s) placed • Press ENTER to finalize`}
          </span>

          {measurePoints.length >= 2 && (
            <button
              onClick={() => {
                let total = 0;
                const segs: number[] = [];
                for (let i = 0; i < measurePoints.length - 1; i++) {
                  const d = distance(measurePoints[i], measurePoints[i + 1]) * scaleCalibration.metersPerUnit;
                  segs.push(d);
                  total += d;
                }
                const newAnnotation: DimensionAnnotation = {
                  id: `dim-${Date.now()}`,
                  type: 'annotation',
                  points: [...measurePoints],
                  totalDistance: total,
                  segments: segs,
                  offset: 0.8,
                  color: colors.annotation,
                  levelId: activeLevel?.id,
                };
                onAddElement(newAnnotation);
                setMeasurePoints([]);
                onStatusMessage(`Dimension recorded: ${total.toFixed(2)} m`);
              }}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow"
            >
              <Check className="w-3.5 h-3.5" /> Finalize (Enter)
            </button>
          )}

          {measurePoints.length > 0 && (
            <button
              onClick={() => {
                setMeasurePoints([]);
                onStatusMessage('Cleared current measurement points.');
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-rose-900/80 text-rose-300 text-xs font-semibold rounded-lg flex items-center gap-1 transition"
              title="Remove active measurement points (Delete key)"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove Point
            </button>
          )}

          {elements.some((el) => el.type === 'annotation') && (
            <button
              onClick={() => {
                onUpdateElements(elements.filter((el) => el.type !== 'annotation'));
                onStatusMessage('All dimension measurements removed.');
              }}
              className="px-2.5 py-1 bg-rose-950/90 hover:bg-rose-900 border border-rose-800 text-rose-200 text-xs font-semibold rounded-lg flex items-center gap-1 transition shadow-xs"
              title="Remove all dimension lines from drawing"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove Measures
            </button>
          )}

          <button
            onClick={() => {
              setMeasurePoints([]);
              setToolMode('select');
              onStatusMessage('Measure tool closed.');
            }}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
            title="Cancel Measure Tool (ESC)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SLAB CLOSING PROMPT */}
      {toolMode === 'slab' && slabPoints.length >= 3 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-slate-900/95 border border-emerald-500/60 px-3 py-1.5 rounded-xl shadow-xl backdrop-blur-md">
          <span className="text-xs font-semibold text-emerald-300">
            {slabPoints.length} points added ({polygonArea(slabPoints).toFixed(1)} m²)
          </span>
          <button
            onClick={() => {
              const newSlab: SlabElement = {
                id: `slab-${Date.now()}`,
                type: 'slab',
                mark: `S${elements.filter((el) => el.type === 'slab').length + 1}`,
                points: [...slabPoints],
                thickness: 0.20,
                elevation: 3.20,
                concreteGrade: 'C30/37',
                color: colors.slab,
              };
              onAddElement(newSlab);
              setSlabPoints([]);
              onStatusMessage(`Slab ${newSlab.mark} created`);
            }}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded flex items-center gap-1 shadow"
          >
            <CornerDownLeft className="w-3.5 h-3.5" /> Close Slab (Press C)
          </button>
        </div>
      )}

      {/* ON-CANVAS QUICK RESIZE TOOLBAR (When an element is selected in resize mode or select mode) */}
      {(toolMode === 'resize' || activeSelectedElement) && activeSelectedElement && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-slate-900/95 border border-slate-700/80 px-3 py-1.5 rounded-xl shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-1 text-[11px] font-bold text-white pr-2 border-r border-slate-800">
            <Scaling className="w-3.5 h-3.5 text-cyan-400" />
            <span>{'mark' in activeSelectedElement ? activeSelectedElement.mark : activeSelectedElement.type}</span>
          </div>

          {/* Footing Quick Resize Presets */}
          {activeSelectedElement.type === 'footing' && (
            <div className="flex items-center gap-1">
              {!activeSelectedElement.points && (
                <>
                  {[1.5, 2.0, 2.5, 3.0].map((dim) => (
                    <button
                      key={dim}
                      onClick={() => {
                        const updated = elements.map((el) =>
                          el.id === activeSelectedElement.id ? { ...el, width: dim, length: dim } : el
                        );
                        onUpdateElements(updated);
                        onStatusMessage(`Resized Footing to ${dim}×${dim}m`);
                      }}
                      className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-orange-600 text-slate-300 hover:text-white rounded transition"
                    >
                      {dim}m
                    </button>
                  ))}
                  <span className="text-slate-600">|</span>
                </>
              )}
              {[-0.1, 0.1, 0.25].map((pct) => (
                <button
                  key={pct}
                  onClick={() => {
                    const factor = 1 + pct;
                    const updated = elements.map((el) => {
                      if (el.id !== activeSelectedElement.id || el.type !== 'footing') return el;
                      if (el.points) {
                        return { ...el, points: scalePolygon(el.points, factor) };
                      }
                      return {
                        ...el,
                        width: Math.round(el.width * factor * 100) / 100,
                        length: Math.round(el.length * factor * 100) / 100,
                      };
                    });
                    onUpdateElements(updated);
                    onStatusMessage(`Scaled Footing by ${pct > 0 ? '+' : ''}${pct * 100}%`);
                  }}
                  className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-800 hover:bg-orange-600/30 text-orange-300 rounded transition"
                >
                  {pct > 0 ? `+${pct * 100}%` : `${pct * 100}%`}
                </button>
              ))}
            </div>
          )}

          {/* Column Quick Resize Presets */}
          {activeSelectedElement.type === 'column' && (
            <div className="flex items-center gap-1">
              {!activeSelectedElement.points && (
                <>
                  {[
                    { label: '300', w: 0.3, d: 0.3 },
                    { label: '400', w: 0.4, d: 0.4 },
                    { label: '500', w: 0.5, d: 0.5 },
                    { label: '300×600', w: 0.3, d: 0.6 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      onClick={() => {
                        const updated = elements.map((el) =>
                          el.id === activeSelectedElement.id ? { ...el, width: p.w, depth: p.d } : el
                        );
                        onUpdateElements(updated);
                        onStatusMessage(`Resized Column to ${p.label}`);
                      }}
                      className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white rounded transition"
                    >
                      {p.label}
                    </button>
                  ))}
                  <span className="text-slate-600">|</span>
                </>
              )}
              {[-0.1, 0.1, 0.25].map((pct) => (
                <button
                  key={pct}
                  onClick={() => {
                    const factor = 1 + pct;
                    const updated = elements.map((el) => {
                      if (el.id !== activeSelectedElement.id || el.type !== 'column') return el;
                      if (el.points) {
                        return { ...el, points: scalePolygon(el.points, factor) };
                      }
                      return {
                        ...el,
                        width: Math.round(el.width * factor * 100) / 100,
                        depth: Math.round(el.depth * factor * 100) / 100,
                      };
                    });
                    onUpdateElements(updated);
                    onStatusMessage(`Scaled Column by ${pct > 0 ? '+' : ''}${pct * 100}%`);
                  }}
                  className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-800 hover:bg-red-600/30 text-red-300 rounded transition"
                >
                  {pct > 0 ? `+${pct * 100}%` : `${pct * 100}%`}
                </button>
              ))}
            </div>
          )}

          {/* Slab Quick Resize Presets */}
          {activeSelectedElement.type === 'slab' && (
            <div className="flex items-center gap-1">
              {[-0.2, -0.1, 0.1, 0.2].map((pct) => (
                <button
                  key={pct}
                  onClick={() => {
                    const factor = 1 + pct;
                    const updated = elements.map((el) => {
                      if (el.id !== activeSelectedElement.id || el.type !== 'slab') return el;
                      return { ...el, points: scalePolygon(el.points, factor) };
                    });
                    onUpdateElements(updated);
                    onStatusMessage(`Scaled Slab Area by ${pct > 0 ? '+' : ''}${pct * 100}%`);
                  }}
                  className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-800 hover:bg-emerald-600/30 text-emerald-300 rounded transition"
                >
                  {pct > 0 ? `+${pct * 100}%` : `${pct * 100}%`} Area
                </button>
              ))}
              <span className="text-slate-600">|</span>
              {[0.15, 0.20, 0.25].map((th) => (
                <button
                  key={th}
                  onClick={() => {
                    const updated = elements.map((el) =>
                      el.id === activeSelectedElement.id && el.type === 'slab' ? { ...el, thickness: th } : el
                    );
                    onUpdateElements(updated);
                    onStatusMessage(`Slab Thickness set to ${Math.round(th * 1000)}mm`);
                  }}
                  className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded transition"
                >
                  {Math.round(th * 1000)}mm
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FLOATING SELECTION ACTION BAR (Delete & Deselect) */}
      {totalSelected > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-slate-900/95 border border-amber-500/80 px-4 py-2 rounded-2xl shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-bold text-amber-200">
              {totalSelected} item{totalSelected > 1 ? 's' : ''} selected
            </span>
            {selectedElementsCount > 0 && (
              <span className="text-[10px] text-slate-400">({selectedElementsCount} BIM)</span>
            )}
            {selectedDxfCount > 0 && (
              <span className="text-[10px] text-cyan-400">({selectedDxfCount} DXF)</span>
            )}
            {dxfEntities.filter((e) => (e.type === 'TEXT' || e.type === 'MTEXT') && e.selected).length > 0 && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/80 border border-purple-700/60 text-purple-200 font-semibold flex items-center gap-1">
                  <Type className="w-3 h-3 text-purple-400" />
                  {dxfEntities.filter((e) => (e.type === 'TEXT' || e.type === 'MTEXT') && e.selected).length} texts
                </span>
                <button
                  onClick={() => {
                    const firstText = dxfEntities.find(
                      (e) => (e.type === 'TEXT' || e.type === 'MTEXT') && e.selected
                    );
                    if (!firstText) return;
                    const lyr = firstText.layer;
                    const updated = dxfEntities.map((e) =>
                      (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer === lyr
                        ? { ...e, selected: true }
                        : e
                    );
                    onUpdateDxfEntities(updated);
                    const count = updated.filter((e) => (e.type === 'TEXT' || e.type === 'MTEXT') && e.selected).length;
                    onStatusMessage(`Selected all ${count} texts on layer "${lyr || '0'}"`);
                  }}
                  className="px-2 py-0.5 text-[10px] bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-200 rounded transition"
                  title="Select all text entities on the same layer"
                >
                  All on Layer
                </button>
                <button
                  onClick={() => {
                    const updated = dxfEntities.map((e) =>
                      e.type === 'TEXT' || e.type === 'MTEXT' ? { ...e, selected: true } : e
                    );
                    onUpdateDxfEntities(updated);
                    const totalTexts = updated.filter((e) => e.type === 'TEXT' || e.type === 'MTEXT').length;
                    onStatusMessage(`Selected all ${totalTexts} DXF text entities`);
                  }}
                  className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded transition"
                  title="Select all text entities across the drawing"
                >
                  All DXF Text
                </button>
                <button
                  onClick={() => {
                    let firstFound = false;
                    const updated = dxfEntities.map((e) => {
                      if ((e.type === 'TEXT' || e.type === 'MTEXT') && e.selected) {
                        if (!firstFound) {
                          firstFound = true;
                          return e;
                        }
                        return { ...e, selected: false };
                      }
                      return e;
                    });
                    onUpdateDxfEntities(updated);
                    onStatusMessage('Selected only 1 text instance');
                  }}
                  className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 rounded transition"
                  title="Keep only 1 text entity selected"
                >
                  Only 1
                </button>
              </div>
            )}
          </div>

          {elements.filter((e) => e.type === 'annotation' && e.selected).length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-700/60 text-amber-200 font-semibold flex items-center gap-1">
              <Ruler className="w-3 h-3 text-amber-400" />
              {elements.filter((e) => e.type === 'annotation' && e.selected).length} measure{elements.filter((e) => e.type === 'annotation' && e.selected).length > 1 ? 's' : ''}
            </span>
          )}

          <button
            onClick={() => {
              setToolMode('move');
              setMoveBasePoint(null);
              onStatusMessage('Move tool activated. Click reference Base Point on drawing to move from.');
            }}
            className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1.5 transition"
            title="Move selected items anywhere on drawing"
          >
            <Move className="w-3.5 h-3.5" />
            Move
          </button>

          <button
            onClick={onDeleteSelected}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1.5 transition"
            title="Delete / Remove Selected Items (Delete or Backspace key)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete / Remove
          </button>

          <button
            onClick={() => {
              const deselectBim = elements.map((el) => (el.selected ? { ...el, selected: false } : el));
              onUpdateElements(deselectBim);
              const deselectDxf = dxfEntities.map((ent) => (ent.selected ? { ...ent, selected: false } : ent));
              onUpdateDxfEntities(deselectDxf);
              onStatusMessage('Deselected all • Colors restored');
            }}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
            title="Deselect All (ESC)"
          >
            Deselect (ESC)
          </button>
        </div>
      )}

      {/* MOVE TOOL ACTIVE PROMPT BAR */}
      {toolMode === 'move' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-slate-900/95 border border-cyan-500/80 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md">
          <Move className="w-4 h-4 text-cyan-400 animate-pulse shrink-0" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white">
              {!moveBasePoint
                ? (totalSelected > 0 ? 'Click reference Base Point to move from' : 'Select items first, or click "Select All" to move entire drawing')
                : 'Click Destination Point to place items'}
            </span>
            <span className="text-[10px] text-cyan-300">
              {!moveBasePoint
                ? `${totalSelected} item(s) selected • You can move anywhere on drawing`
                : `Base: (${moveBasePoint.x.toFixed(2)}, ${moveBasePoint.y.toFixed(2)}) • Press ENTER or click Cancel to abort`}
            </span>
          </div>
          <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
            {totalSelected === 0 && (
              <button
                onClick={() => {
                  const allBim = elements.map((el) => ({ ...el, selected: true }));
                  const allDxf = dxfEntities.map((ent) => ({ ...ent, selected: true }));
                  onUpdateElements(allBim);
                  onUpdateDxfEntities(allDxf);
                  onStatusMessage('Selected all drawing elements and DXF entities.');
                }}
                className="px-2.5 py-1 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold rounded-lg shadow transition"
              >
                Select All
              </button>
            )}
            {moveBasePoint && (
              <button
                onClick={() => setMoveBasePoint(null)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
              >
                Reset Base
              </button>
            )}
            <button
              onClick={() => {
                setMoveBasePoint(null);
                setToolMode('select');
                onStatusMessage('Move operation cancelled.');
              }}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition flex items-center gap-1 shadow"
              title="Cancel / Remove Move operation (Press ENTER or ESC)"
            >
              <X className="w-3.5 h-3.5" /> Cancel / Remove (Enter)
            </button>
          </div>
        </div>
      )}

      {/* TEXT EDITOR MODAL DIALOG */}
      {textModalState && textModalState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-purple-500/60 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4 text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-500/20 text-purple-400 rounded-lg">
                  <Type className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold">
                  {textModalState.existingElementId || textModalState.existingDxfId
                    ? 'Edit Text'
                    : 'Add Text Annotation'}
                </h3>
              </div>
              <button
                onClick={() => setTextModalState(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Tag Templates */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Quick Structural Templates</label>
              <div className="flex flex-wrap gap-1.5">
                {['C1 (400×400)', 'B1 (300×600)', 'F1 (2.0×2.0)', 'Level +3.20m', 'Grid A', 'Grid 1'].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setTextModalState((prev) => (prev ? { ...prev, text: tag } : null))}
                    className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-purple-600/30 border border-slate-700 hover:border-purple-500 text-slate-300 hover:text-purple-200 rounded-md transition"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Text Input */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Text Content</label>
              <textarea
                autoFocus
                value={textModalState.text}
                onChange={(e) =>
                  setTextModalState((prev) => (prev ? { ...prev, text: e.target.value } : null))
                }
                rows={3}
                placeholder="Enter text, label, or annotation..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:border-purple-500 focus:outline-none resize-none"
              />
            </div>

            {/* Font Size & Color */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Font Size</label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { label: 'S', sz: 0.25 },
                    { label: 'M', sz: 0.35 },
                    { label: 'L', sz: 0.55 },
                  ].map((s) => (
                    <button
                      key={s.label}
                      onClick={() =>
                        setTextModalState((prev) => (prev ? { ...prev, fontSize: s.sz } : null))
                      }
                      className={`py-1 text-xs font-mono rounded border transition ${
                        Math.abs(textModalState.fontSize - s.sz) < 0.05
                          ? 'bg-purple-600 border-purple-400 text-white font-bold'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Color</label>
                <div className="flex gap-1.5 pt-0.5">
                  {['#ffffff', '#38bdf8', '#f59e0b', '#10b981', '#f43f5e'].map((c) => (
                    <button
                      key={c}
                      onClick={() =>
                        setTextModalState((prev) => (prev ? { ...prev, color: c } : null))
                      }
                      className={`w-6 h-6 rounded-md border-2 transition ${
                        textModalState.color === c ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              {(textModalState.existingElementId || textModalState.existingDxfId) && (
                <button
                  onClick={() => {
                    if (textModalState.existingElementId) {
                      onUpdateElements(elements.filter((el) => el.id !== textModalState.existingElementId));
                    }
                    if (textModalState.existingDxfId) {
                      onUpdateDxfEntities(dxfEntities.filter((ent) => ent.id !== textModalState.existingDxfId));
                    }
                    setTextModalState(null);
                    onStatusMessage('Text deleted.');
                  }}
                  className="px-3 py-2 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}

              <button
                onClick={() => setTextModalState(null)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  if (!textModalState.text.trim()) {
                    setTextModalState(null);
                    return;
                  }

                  if (textModalState.existingElementId) {
                    const updated = elements.map((el) =>
                      el.id === textModalState.existingElementId && el.type === 'text'
                        ? {
                            ...el,
                            text: textModalState.text,
                            fontSize: textModalState.fontSize,
                            color: textModalState.color,
                          }
                        : el
                    );
                    onUpdateElements(updated);
                    onStatusMessage('Text updated.');
                  } else if (textModalState.existingDxfId) {
                    const updated = dxfEntities.map((ent) =>
                      ent.id === textModalState.existingDxfId
                        ? { ...ent, text: textModalState.text, height: textModalState.fontSize }
                        : ent
                    );
                    onUpdateDxfEntities(updated);
                    onStatusMessage('DXF text updated.');
                  } else {
                    const newText: TextAnnotation = {
                      id: `txt-${Date.now()}`,
                      type: 'text',
                      text: textModalState.text,
                      x: textModalState.worldPos.x,
                      y: textModalState.worldPos.y,
                      fontSize: textModalState.fontSize,
                      color: textModalState.color,
                    };
                    onAddElement(newText);
                    onStatusMessage(`Placed text: "${newText.text}"`);
                  }
                  setTextModalState(null);
                }}
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/30 flex items-center justify-center gap-1.5 transition"
              >
                <Check className="w-4 h-4" />
                {textModalState.existingElementId || textModalState.existingDxfId ? 'Save Changes' : 'Place Text'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Active Move Tool Banner */}
      {toolMode === 'move' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 bg-slate-900/95 border border-cyan-500/80 text-white px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md text-xs animate-in fade-in">
          <Move className="w-4 h-4 text-cyan-400 animate-pulse shrink-0" />
          <span className="font-bold text-cyan-300">
            {moveBasePoint ? 'Step 2:' : 'Step 1:'}
          </span>
          <span className="text-slate-200">
            {moveBasePoint
              ? 'Click destination point to complete move'
              : 'Click base point to start move'}
          </span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-300">Press</span>
          <kbd className="px-2 py-0.5 bg-slate-800 border border-slate-600 rounded text-amber-300 font-mono font-bold text-[11px]">
            Enter
          </kbd>
          <span className="text-slate-300">to cancel</span>
          <button
            onClick={() => {
              setMoveBasePoint(null);
              setToolMode('select');
              onStatusMessage('Move operation cancelled (ENTER).');
            }}
            className="ml-2 px-2.5 py-1 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-700/80 rounded-lg text-[11px] font-semibold transition"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Floating Canvas Navigation Toolbar (Zoom / Fit / Scale) */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 p-1.5 rounded-xl shadow-xl backdrop-blur-md">
        <button
          onClick={fitToExtents}
          className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition"
          title="Fit Drawing to Screen (Zoom Extents)"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={() =>
            setViewState((prev) => ({
              ...prev,
              zoom: Math.min(prev.zoom * 1.25, MAX_ZOOM),
            }))
          }
          className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() =>
            setViewState((prev) => ({
              ...prev,
              zoom: Math.max(prev.zoom * 0.8, MIN_ZOOM),
            }))
          }
          className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setViewState({ panX: 0, panY: 0, zoom: 25 });
            fitToExtents();
          }}
          className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition"
          title="Reset Canvas View"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Live Scale / Coordinate Badge */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none flex items-center gap-2">
        <div className="px-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-300 shadow-md backdrop-blur-sm flex items-center gap-3">
          <span>
            X: <strong className="text-cyan-400">{cursorWorld.x.toFixed(2)}</strong>
          </span>
          <span>
            Y: <strong className="text-cyan-400">{cursorWorld.y.toFixed(2)}</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Zoom: <strong className="text-emerald-400">{viewState.zoom.toFixed(2)} px/u</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
