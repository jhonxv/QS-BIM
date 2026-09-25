import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ToolMode,
  BIMElement,
  DXFEntity,
  ColorSettings,
  ScaleCalibration,
  FootingElement,
  ColumnElement,
  BeamElement,
  WallElement,
  SlabElement,
  UnitRates,
  ProjectLevel,
} from './types/bim';
import { parseDXFString, generateSampleStructuralDXF } from './utils/dxfParser';
import { calculateBOQ, DEFAULT_UNIT_RATES } from './utils/boqEngine';
import { CadCanvas2D } from './components/CadCanvas2D';
import { ThreeBimViewer } from './components/ThreeBimViewer';
import { ColumnDimensionModal } from './components/ColumnDimensionModal';
import { ScaleCalibrationModal } from './components/ScaleCalibrationModal';
import { LayerColorModal } from './components/LayerColorModal';
import { BoqModal } from './components/BoqModal';
import { ElementPropertiesPanel } from './components/ElementPropertiesPanel';
import { AssignLevelDxfModal } from './components/AssignLevelDxfModal';
import { LevelManagerModal } from './components/LevelManagerModal';
import {
  MousePointer,
  BoxSelect,
  Minus,
  Columns,
  Box,
  Pentagon,
  Ruler,
  Magnet,
  Trash2,
  FileSpreadsheet,
  Upload,
  Layers,
  Palette,
  Eye,
  CheckCircle2,
  Sparkles,
  FileText,
  HelpCircle,
  Type,
  Scaling,
  SplitSquareVertical,
  Move,
  Building2,
  ChevronDown,
  Plus,
} from 'lucide-react';

export default function App() {
  // Active View Tab: 2D CAD vs 3D BIM vs Split
  const [activeView, setActiveView] = useState<'2D' | '3D' | 'split'>('2D');

  // Active Drawing Tool
  const [toolMode, setToolMode] = useState<ToolMode>('select');

  // Object Snap (OSNAP) toggle
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);

  // Floor Levels Management (Foundation, Ground Floor, First Floor, etc.)
  const [levels, setLevels] = useState<ProjectLevel[]>([
    { id: 'lvl-found', name: 'Foundation', elevation: -1.50, height: 1.50 },
    { id: 'lvl-ground', name: 'Ground Floor', elevation: 0.00, height: 3.20 },
    { id: 'lvl-first', name: 'First Floor', elevation: 3.20, height: 3.20 },
    { id: 'lvl-second', name: 'Second Floor', elevation: 6.40, height: 3.20 },
    { id: 'lvl-roof', name: 'Roof', elevation: 9.60, height: 3.00 },
  ]);
  const [activeLevelId, setActiveLevelId] = useState<string>('lvl-ground');
  const [pendingDxfUpload, setPendingDxfUpload] = useState<{
    file: File;
    parsed: any;
  } | null>(null);
  const [showAssignLevelDxfModal, setShowAssignLevelDxfModal] = useState<boolean>(false);
  const [showLevelManagerModal, setShowLevelManagerModal] = useState<boolean>(false);

  // DXF Drawing Entities & Metadata
  const [dxfFileName, setDxfFileName] = useState<string>('Structural_Foundation_Plan.dxf');
  const [dxfEntities, setDxfEntities] = useState<DXFEntity[]>([]);
  const [dxfBounds, setDxfBounds] = useState({
    minX: -4,
    minY: -4,
    maxX: 22,
    maxY: 16,
    width: 26,
    height: 20,
    centerX: 9,
    centerY: 6,
  });

  // Structural BIM Elements
  const [elements, setElements] = useState<BIMElement[]>([]);

  // Preserved 2D Canvas Viewport (pan and zoom state across view toggling)
  const [cadViewState, setCadViewState] = useState<{ panX: number; panY: number; zoom: number } | null>(null);

  // Status bar message
  const [statusMessage, setStatusMessage] = useState<string>('Ready • Select a tool to begin drawing');

  // Color configurations
  const [colors, setColors] = useState<ColorSettings>({
    dxfLines: '#38bdf8',
    footing: '#ea580c',
    column: '#dc2626',
    beam: '#4f46e5',
    wall: '#94a3b8',
    slab: '#10b981',
    annotation: '#fbbf24',
    snapMarker: '#22c55e',
  });

  // Scale Calibration State
  const [scaleCalibration, setScaleCalibration] = useState<ScaleCalibration>({
    active: false,
    step: 'point1',
    point1: null,
    point2: null,
    pixelDistance: 0,
    realDistanceMeters: 6.0,
    metersPerUnit: 1.0,
    calibrated: true,
  });

  // Unit Cost Rates for Takeoff
  const [unitRates, setUnitRates] = useState<UnitRates>(DEFAULT_UNIT_RATES);

  // Modals state
  const [showColumnModal, setShowColumnModal] = useState<boolean>(false);
  const [targetFootingForColumn, setTargetFootingForColumn] = useState<FootingElement | null>(null);
  const [showColorModal, setShowColorModal] = useState<boolean>(false);
  const [showBoqModal, setShowBoqModal] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load sample DXF and initial BIM structure on startup
  useEffect(() => {
    const sample = generateSampleStructuralDXF();
    setDxfEntities(sample.entities);
    setDxfBounds(sample.bounds);

    // Populate initial structural model matching the drawing so user has a rich working base right away
    const initialElements: BIMElement[] = [];
    const xGrids = [0, 6, 12, 18];
    const yGrids = [0, 6, 12];

    let fCount = 1;
    xGrids.forEach((x) => {
      yGrids.forEach((y) => {
        // 1. RC Footing (2.0m x 2.0m x 0.6m)
        initialElements.push({
          id: `f-init-${fCount}`,
          type: 'footing',
          mark: `F${fCount}`,
          x,
          y,
          width: 2.0,
          length: 2.0,
          depth: 0.60,
          elevation: -1.50,
          concreteGrade: 'C30/37',
          color: colors.footing,
          levelId: 'lvl-ground',
        });

        // 2. RC Column (0.4m x 0.4m) extending from footing top (-0.9m) to floor level (+3.2m)
        initialElements.push({
          id: `c-init-${fCount}`,
          type: 'column',
          mark: `C${fCount}`,
          x,
          y,
          width: 0.40,
          depth: 0.40,
          height: 4.10,
          baseElevation: -0.90,
          concreteGrade: 'C30/37',
          color: colors.column,
          levelId: 'lvl-ground',
        });

        fCount++;
      });
    });

    // 3. Structural Floor Beams along X Grid lines (0.3m x 0.5m at +3.2m elevation)
    let bCount = 1;
    yGrids.forEach((y) => {
      for (let i = 0; i < xGrids.length - 1; i++) {
        initialElements.push({
          id: `b-init-${bCount}`,
          type: 'beam',
          mark: `B${bCount}`,
          startPoint: { x: xGrids[i], y },
          endPoint: { x: xGrids[i + 1], y },
          width: 0.30,
          depth: 0.50,
          elevation: 3.20,
          concreteGrade: 'C30/37',
          color: colors.beam,
          levelId: 'lvl-ground',
        });
        bCount++;
      }
    });

    // 4. Structural Floor Beams along Y Grid lines
    xGrids.forEach((x) => {
      for (let j = 0; j < yGrids.length - 1; j++) {
        initialElements.push({
          id: `b-init-${bCount}`,
          type: 'beam',
          mark: `B${bCount}`,
          startPoint: { x, y: yGrids[j] },
          endPoint: { x, y: yGrids[j + 1] },
          width: 0.30,
          depth: 0.50,
          elevation: 3.20,
          concreteGrade: 'C30/37',
          color: colors.beam,
          levelId: 'lvl-ground',
        });
        bCount++;
      }
    });

    // 5. Ground Floor / Roof Slab (0.18m thick at +3.2m elevation)
    initialElements.push({
      id: 'slab-init-1',
      type: 'slab',
      mark: 'S1',
      points: [
        { x: -0.5, y: -0.5 },
        { x: 18.5, y: -0.5 },
        { x: 18.5, y: 12.5 },
        { x: -0.5, y: 12.5 },
      ],
      thickness: 0.18,
      elevation: 3.20,
      concreteGrade: 'C30/37',
      color: colors.slab,
      levelId: 'lvl-ground',
    });

    setElements(initialElements);
  }, []);

  // Handle DXF File Upload -> Opens Assign Level Modal
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const parsed = parseDXFString(text);
      setPendingDxfUpload({ file, parsed });
      setShowAssignLevelDxfModal(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Confirm DXF assignment to level
  const handleConfirmAssignLevelDxf = (
    targetLevelId: string,
    levelName: string,
    elevation: number,
    height: number
  ) => {
    if (!pendingDxfUpload) return;
    const { file, parsed } = pendingDxfUpload;

    setDxfFileName(file.name);

    let exists = levels.some((l) => l.id === targetLevelId);
    let updatedLevels: ProjectLevel[];

    if (exists) {
      updatedLevels = levels.map((l) =>
        l.id === targetLevelId
          ? {
              ...l,
              name: levelName,
              elevation,
              height,
              dxfFileName: file.name,
              dxfEntities: parsed.entities,
              dxfBounds: parsed.bounds,
            }
          : l
      );
    } else {
      const newLvl: ProjectLevel = {
        id: targetLevelId,
        name: levelName,
        elevation,
        height,
        dxfFileName: file.name,
        dxfEntities: parsed.entities,
        dxfBounds: parsed.bounds,
      };
      updatedLevels = [...levels, newLvl].sort((a, b) => a.elevation - b.elevation);
    }

    setLevels(updatedLevels);
    setActiveLevelId(targetLevelId);
    setShowAssignLevelDxfModal(false);
    setPendingDxfUpload(null);
    setCadViewState(null); // Reset viewState so new drawing auto-fits cleanly

    // Prompt scale calibration
    setScaleCalibration({
      active: true,
      step: 'point1',
      point1: null,
      point2: null,
      pixelDistance: 0,
      realDistanceMeters: 5.0,
      metersPerUnit: parsed.suggestedScaleUnit === 'mm' ? 0.001 : 1.0,
      calibrated: false,
    });

    setStatusMessage(
      `Assigned "${file.name}" to ${levelName} (${elevation >= 0 ? '+' : ''}${elevation.toFixed(2)}m). Previous drawings hidden in 2D. 3D view shows all levels.`
    );
  };

  const activeLevel = levels.find((l) => l.id === activeLevelId) || levels[1] || levels[0];

  // 2D Canvas shows ONLY elements belonging to the active level!
  // When user moves to next level, previous level elements are hidden in 2D!
  const visible2DElements = elements.filter((el) => {
    if (el.levelId) {
      return el.levelId === activeLevelId;
    }
    if (el.type === 'footing') return activeLevelId === 'lvl-found' || activeLevelId === 'lvl-ground';
    return activeLevelId === 'lvl-ground';
  });

  const activeLevelDxf =
    activeLevel.dxfEntities && activeLevel.dxfEntities.length > 0
      ? activeLevel.dxfEntities
      : activeLevelId === 'lvl-ground'
      ? dxfEntities
      : [];

  const activeLevelBounds = useMemo(() => {
    const raw = activeLevel.dxfBounds || dxfBounds;
    return {
      minX: raw.minX,
      minY: raw.minY,
      maxX: raw.maxX,
      maxY: raw.maxY,
      width: raw.width,
      height: raw.height,
      centerX: 'centerX' in raw && typeof raw.centerX === 'number' ? raw.centerX : (raw.minX + raw.maxX) / 2,
      centerY: 'centerY' in raw && typeof raw.centerY === 'number' ? raw.centerY : (raw.minY + raw.maxY) / 2,
    };
  }, [activeLevel.dxfBounds, dxfBounds]);

  // Add a BIM element tagged with activeLevel
  const handleAddElement = (element: BIMElement) => {
    const withLevel: BIMElement = {
      ...element,
      levelId: element.levelId || activeLevelId,
    };
    setElements((prev) => [...prev, withLevel]);
  };

  // Update elements (merging visible 2D updates back into the full elements array, and removing deleted elements)
  const handleUpdateElements = (updatedVisible: BIMElement[]) => {
    setElements((prev) => {
      const updatedMap = new Map(updatedVisible.map((e) => [e.id, e]));
      const updatedIds = new Set(updatedVisible.map((e) => e.id));

      return prev
        .filter((el) => {
          const belongsToActive = el.levelId
            ? el.levelId === activeLevelId
            : el.type === 'footing'
            ? activeLevelId === 'lvl-found' || activeLevelId === 'lvl-ground'
            : activeLevelId === 'lvl-ground';

          if (belongsToActive) {
            // If it belonged to active level in 2D and was removed, remove it completely from 3D & BOQ!
            return updatedIds.has(el.id);
          }
          // Elements on other levels are preserved
          return true;
        })
        .map((e) => (updatedMap.has(e.id) ? updatedMap.get(e.id)! : e));
    });
  };

  // Update DXF entities for active level
  const handleUpdateDxfEntities = (updated: DXFEntity[]) => {
    if (activeLevel.dxfEntities && activeLevel.dxfEntities.length > 0) {
      setLevels((prev) =>
        prev.map((l) => (l.id === activeLevelId ? { ...l, dxfEntities: updated } : l))
      );
    } else {
      setDxfEntities(updated);
    }
  };

  // Update a single element (e.g. from Properties Panel)
  const handleUpdateSingleElement = (updated: BIMElement) => {
    setElements((prev) => prev.map((el) => (el.id === updated.id ? updated : el)));
    const markName = 'mark' in updated ? updated.mark : updated.type;
    setStatusMessage(`Updated properties for ${markName}. 3D and BOQ synchronized.`);
  };

  // Delete a single element
  const handleDeleteSingleElement = (id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
    setStatusMessage('Deleted element from 2D & 3D. BOQ recalculated.');
  };

  // Deselect all elements & DXF lines
  const handleDeselectAll = () => {
    setElements((prev) => prev.map((el) => ({ ...el, selected: false })));
    handleUpdateDxfEntities(activeLevelDxf.map((ent) => ({ ...ent, selected: false })));
    setStatusMessage('Deselected all. Original colors restored.');
  };

  // Global Escape key listener: Deselect and restore original colors immediately
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDeselectAll();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeLevelDxf]);

  // Select All items on current active level (Ctrl+A)
  const handleSelectAll = () => {
    const allBim = elements.map((el) => ({ ...el, selected: true }));
    const allDxf = activeLevelDxf.map((ent) => ({ ...ent, selected: true }));
    setElements(allBim);
    handleUpdateDxfEntities(allDxf);
    setStatusMessage(`Selected all ${allBim.length} element(s) and ${allDxf.length} DXF entity(ies). Click 'Move' to relocate or edit.`);
  };

  // Delete selected elements (BIM & DXF)
  const handleDeleteSelected = () => {
    const anyBimSelected = elements.some((el) => el.selected);
    const anyDxfSelected = activeLevelDxf.some((ent) => ent.selected);

    if (anyBimSelected || anyDxfSelected) {
      const remainingBim = elements.filter((el) => !el.selected);
      const deletedBimCount = elements.length - remainingBim.length;

      const remainingDxf = activeLevelDxf.filter((ent) => !ent.selected);
      const deletedDxfCount = activeLevelDxf.length - remainingDxf.length;

      setElements(remainingBim);
      handleUpdateDxfEntities(remainingDxf);
      setStatusMessage(`Deleted ${deletedBimCount} element(s) and ${deletedDxfCount} DXF entity(ies). 3D and BOQ updated.`);
      return;
    }

    // If nothing selected and measure tool or annotations exist, remove dimension annotations
    if (toolMode === 'measure' || elements.some((el) => el.type === 'annotation')) {
      const remainingBim = elements.filter((el) => el.type !== 'annotation');
      const removedCount = elements.length - remainingBim.length;
      setElements(remainingBim);
      setStatusMessage(`Removed ${removedCount} measurement dimension(s).`);
    }
  };

  // Confirm Column Creation (single or apply to all footings)
  const handleConfirmColumnModal = (config: {
    width: number;
    depth: number;
    height: number;
    mark: string;
    concreteGrade: string;
    applyToAll: boolean;
  }) => {
    const footings = elements.filter((el): el is FootingElement => el.type === 'footing');

    if (config.applyToAll) {
      const newCols: ColumnElement[] = footings.map((f, i) => ({
        id: `col-all-${Date.now()}-${i}`,
        type: 'column',
        mark: `${config.mark || 'C'}${i + 1}`,
        x: f.x,
        y: f.y,
        width: config.width,
        depth: config.depth,
        height: config.height,
        baseElevation: 0,
        footingId: f.id,
        concreteGrade: config.concreteGrade,
        color: colors.column,
      }));
      setElements((prev) => [...prev, ...newCols]);
      setStatusMessage(`Added ${newCols.length} columns to all footing centers!`);
    } else if (targetFootingForColumn) {
      const colIndex = elements.filter((el) => el.type === 'column').length + 1;
      const newCol: ColumnElement = {
        id: `col-${Date.now()}`,
        type: 'column',
        mark: config.mark || `C${colIndex}`,
        x: targetFootingForColumn.x,
        y: targetFootingForColumn.y,
        width: config.width,
        depth: config.depth,
        height: config.height,
        baseElevation: 0,
        footingId: targetFootingForColumn.id,
        concreteGrade: config.concreteGrade,
        color: colors.column,
      };
      setElements((prev) => [...prev, newCol]);
      setStatusMessage(`Added column ${newCol.mark} at center of Footing ${targetFootingForColumn.mark}`);
    }
  };

  // Confirm Scale Calibration
  const handleConfirmScaleCalibration = (realDistanceMeters: number) => {
    const ratio = realDistanceMeters / (scaleCalibration.pixelDistance || 1);
    setScaleCalibration((prev) => ({
      ...prev,
      active: false,
      step: 'completed',
      realDistanceMeters,
      metersPerUnit: ratio,
      calibrated: true,
    }));
    setStatusMessage(`Scale calibrated: 1 drawing unit = ${ratio.toFixed(4)} meters.`);
  };

  // Automated Live BOQ Calculation
  const boqResult = calculateBOQ(elements, unitRates, scaleCalibration.metersPerUnit);

  // Selected item counts
  const selectedElementsCount = visible2DElements.filter((e) => e.selected).length;
  const selectedDxfCount = activeLevelDxf.filter((e) => e.selected).length;
  const allFootingsCount = elements.filter((e) => e.type === 'footing').length;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#070b14] text-slate-100 font-sans select-none">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".dxf"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* 1. TOP HEADER (Matching Screenshot Architecture) */}
      <header className="h-14 bg-[#0a0f1d] border-b border-slate-800/80 px-4 flex items-center justify-between z-30 shrink-0">
        {/* Brand & Project Info */}
        <div className="flex items-center gap-3.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500 text-slate-950 font-bold font-mono text-sm tracking-tighter shadow-md shadow-cyan-500/30">
            QS
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white tracking-wide">QSBIM Takeoff</h1>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                CAD • BIM 4D
              </span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{dxfFileName}</span>
            </div>
          </div>
        </div>

        {/* Center: Floor Level Selector & 2D / 3D / Split View Switcher */}
        <div className="flex items-center gap-3">
          {/* Floor Level Selector & Manager */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-900 border border-slate-800 rounded-xl shadow-inner">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 pl-1">
              <Building2 className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline text-[11px] font-semibold text-slate-300">Floor Level:</span>
            </div>
            <select
              value={activeLevelId}
              onChange={(e) => {
                setActiveLevelId(e.target.value);
                const chosen = levels.find((l) => l.id === e.target.value);
                if (chosen) {
                  setStatusMessage(
                    `Active Level: ${chosen.name} (${chosen.elevation >= 0 ? '+' : ''}${chosen.elevation.toFixed(2)}m) • Previous floor drawings hidden in 2D`
                  );
                }
              }}
              className="bg-slate-800 hover:bg-slate-700/80 text-cyan-300 text-xs font-bold px-2 py-1 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500 cursor-pointer"
              title="Active Floor Level: 2D CAD Canvas displays drawing & elements for this level only. 3D Model renders all floors combined."
            >
              {levels.map((lvl) => (
                <option key={lvl.id} value={lvl.id}>
                  {lvl.name} ({lvl.elevation >= 0 ? '+' : ''}{lvl.elevation.toFixed(2)}m)
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowLevelManagerModal(true)}
              className="px-2 py-1 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800/80 text-cyan-300 text-xs font-semibold rounded-lg flex items-center gap-1 transition shadow-xs"
              title="Add or Edit Floor Levels and Heights (+4.00m, +5.00m, etc.)"
            >
              <Plus className="w-3 h-3" />
              <span className="hidden md:inline text-[11px]">Levels</span>
            </button>
          </div>

          {/* 2D / 3D / Split View Switcher */}
          <div className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl shadow-inner">
            <button
              onClick={() => setActiveView('2D')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                activeView === '2D'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              2D CAD
            </button>
            <button
              onClick={() => setActiveView('3D')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                activeView === '3D'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              3D BIM
            </button>
            <button
              onClick={() => setActiveView('split')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                activeView === 'split'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Side-by-side 2D CAD + Realtime 3D BIM"
            >
              <SplitSquareVertical className="w-3.5 h-3.5" />
              Split 2D + 3D
            </button>
          </div>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2">
          {/* Scale indicator badge */}
          <button
            onClick={() =>
              setScaleCalibration((prev) => ({
                ...prev,
                active: true,
                step: 'point1',
                point1: null,
                point2: null,
              }))
            }
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-cyan-300 flex items-center gap-1.5 transition"
            title="Click to recalibrate scale"
          >
            <Ruler className="w-3.5 h-3.5 text-cyan-400" />
            <span>1u = {scaleCalibration.metersPerUnit.toFixed(3)}m</span>
          </button>

          {/* Upload DXF */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 transition"
          >
            <Upload className="w-3.5 h-3.5 text-slate-300" />
            Upload DXF
          </button>

          {/* Quick BOQ Takeoff Modal Button */}
          <button
            onClick={() => setShowBoqModal(true)}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold text-white shadow-lg shadow-emerald-600/25 flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Live BOQ (${Math.round(boqResult.totals.totalCost).toLocaleString()})
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE (Left Toolbar + Center Canvas + Right Control Panel) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* LEFT TOOLBAR: DRAW & EDIT TOOLS */}
        <aside className="w-20 bg-[#0a0f1d] border-r border-slate-800/80 flex flex-col items-center py-3 overflow-y-auto shrink-0 z-20 space-y-4">
          {/* DRAW GROUP */}
          <div className="w-full px-2 flex flex-col items-center">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">DRAW</span>

            <div className="flex flex-col gap-1.5 w-full">
              {/* Select */}
              <button
                onClick={() => setToolMode('select')}
                className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition text-[10px] ${
                  toolMode === 'select'
                    ? 'bg-cyan-600 text-white font-bold shadow-md shadow-cyan-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Single Element Select"
              >
                <MousePointer className="w-4 h-4 mb-0.5" />
                Select
              </button>

              {/* Select Box (Marquee) */}
              <button
                onClick={() => setToolMode('selectBox')}
                className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition text-[10px] ${
                  toolMode === 'selectBox'
                    ? 'bg-cyan-600 text-white font-bold shadow-md shadow-cyan-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Marquee Window / Crossing Box Selection"
              >
                <BoxSelect className="w-4 h-4 mb-0.5" />
                Select Box
              </button>

              {/* Select All */}
              <button
                onClick={handleSelectAll}
                className="w-full py-2 flex flex-col items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition text-[10px]"
                title="Select All Elements & DXF Entities (Ctrl+A)"
              >
                <CheckCircle2 className="w-4 h-4 mb-0.5 text-cyan-400" />
                Select All
              </button>

              {/* Move Tool */}
              <button
                onClick={() => {
                  setToolMode('move');
                  setStatusMessage('Move tool active: Select items, click reference Base Point, then Destination Point to move drawing anywhere. (Press Enter to cancel)');
                }}
                className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition text-[10px] ${
                  toolMode === 'move'
                    ? 'bg-cyan-600 text-white font-bold shadow-md shadow-cyan-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Move selected drawing or entire plan anywhere (Press Enter to cancel)"
              >
                <Move className="w-4 h-4 mb-0.5 text-cyan-400" />
                Move
              </button>

              {/* Footing */}
              <button
                onClick={() => setToolMode('footing')}
                className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition text-[10px] ${
                  toolMode === 'footing'
                    ? 'bg-orange-600 text-white font-bold shadow-md shadow-orange-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Draw RC Isolated Footing (2.0m x 2.0m)"
              >
                <Box className="w-4 h-4 mb-0.5 text-orange-400" />
                Footing
              </button>

              {/* Column */}
              <button
                onClick={() => {
                  setToolMode('column');
                  setTargetFootingForColumn(null);
                  setShowColumnModal(true);
                }}
                className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition text-[10px] ${
                  toolMode === 'column'
                    ? 'bg-red-600 text-white font-bold shadow-md shadow-red-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Create Column (Click Footing or Specify Dimensions)"
              >
                <Columns className="w-4 h-4 mb-0.5 text-red-400" />
                Column
              </button>

              {/* Beam */}
              <button
                onClick={() => setToolMode('beam')}
                className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition text-[10px] ${
                  toolMode === 'beam'
                    ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Draw Structural Beam (Reduces and extends dynamically with mouse)"
              >
                <Minus className="w-4 h-4 mb-0.5 text-indigo-400 rotate-45" />
                Beam
              </button>

              {/* Wall */}
              <button
                onClick={() => setToolMode('wall')}
                className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition text-[10px] ${
                  toolMode === 'wall'
                    ? 'bg-slate-700 text-white font-bold shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Draw RC Shear Wall"
              >
                <Minus className="w-4 h-4 mb-0.5 text-slate-300" />
                Wall
              </button>

              {/* Area / Slab */}
              <button
                onClick={() => setToolMode('slab')}
                className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition text-[10px] ${
                  toolMode === 'slab'
                    ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Draw Slab / Floor Area (Press 'C' to close polygon)"
              >
                <Pentagon className="w-4 h-4 mb-0.5 text-emerald-400" />
                Area
              </button>

              {/* Text Tool */}
              <button
                onClick={() => setToolMode('text')}
                className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition text-[10px] ${
                  toolMode === 'text'
                    ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Text Annotation & Label Editor (Click canvas or existing text)"
              >
                <Type className="w-4 h-4 mb-0.5 text-purple-400" />
                Text
              </button>

              {/* Measure */}
              <button
                onClick={() => setToolMode('measure')}
                className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition text-[10px] ${
                  toolMode === 'measure'
                    ? 'bg-amber-600 text-white font-bold shadow-md shadow-amber-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Measure Distance & Annotation (Press Enter to finalize)"
              >
                <Ruler className="w-4 h-4 mb-0.5 text-amber-400" />
                Measure
              </button>
            </div>
          </div>

          <div className="w-full px-3">
            <div className="w-full border-t border-slate-800 my-1" />
          </div>

          {/* EDIT GROUP */}
          <div className="w-full px-2 flex flex-col items-center">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">EDIT</span>

            <div className="flex flex-col gap-1.5 w-full">
              {/* OSNAP corner/vertex detector */}
              <button
                onClick={() => setSnapEnabled(!snapEnabled)}
                className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition text-[10px] ${
                  snapEnabled
                    ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-300'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                }`}
                title="Object Corner/Endpoint Snap (F3)"
              >
                <Magnet className="w-4 h-4 mb-0.5" />
                Snap {snapEnabled ? 'ON' : 'OFF'}
              </button>

              {/* Resize Tool */}
              <button
                onClick={() => setToolMode('resize')}
                className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition text-[10px] ${
                  toolMode === 'resize'
                    ? 'bg-cyan-600 text-white font-bold shadow-md shadow-cyan-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Resize Footings, Columns, Slabs with grips & presets"
              >
                <Scaling className="w-4 h-4 mb-0.5 text-cyan-400" />
                Resize
              </button>

              {/* Colors */}
              <button
                onClick={() => setShowColorModal(true)}
                className="w-full py-2 flex flex-col items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition text-[10px]"
                title="Change DXF & BIM Colors"
              >
                <Palette className="w-4 h-4 mb-0.5" />
                Colors
              </button>

              {/* Delete / Remove Selected Items & Measurements */}
              <button
                onClick={handleDeleteSelected}
                disabled={
                  selectedElementsCount === 0 &&
                  selectedDxfCount === 0 &&
                  (toolMode !== 'measure' || !elements.some((el) => el.type === 'annotation'))
                }
                className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition text-[10px] ${
                  selectedElementsCount > 0 ||
                  selectedDxfCount > 0 ||
                  (toolMode === 'measure' && elements.some((el) => el.type === 'annotation'))
                    ? 'bg-rose-950/80 border border-rose-600 text-rose-300 hover:bg-rose-900 cursor-pointer'
                    : 'text-slate-600 cursor-not-allowed opacity-40'
                }`}
                title="Delete Selected Elements or Remove Measurements (Delete / Backspace key)"
              >
                <Trash2 className="w-4 h-4 mb-0.5" />
                Delete
              </button>
            </div>
          </div>
        </aside>

        {/* CENTER VIEWPORT (2D CAD Canvas / 3D BIM Viewer / Split) */}
        <main className="flex-1 min-w-0 min-h-0 h-full relative overflow-hidden flex">
          {/* 2D View Container - Kept persistently mounted to preserve user pan and zoom */}
          <div
            className={`h-full relative min-w-0 min-h-0 ${
              activeView === '2D'
                ? 'w-full block'
                : activeView === 'split'
                ? 'w-1/2 block border-r border-slate-800'
                : 'hidden'
            }`}
          >
            <CadCanvas2D
              toolMode={toolMode}
              setToolMode={setToolMode}
              elements={visible2DElements}
              onAddElement={handleAddElement}
              onUpdateElements={handleUpdateElements}
              onDeleteSelected={handleDeleteSelected}
              dxfEntities={activeLevelDxf}
              onUpdateDxfEntities={handleUpdateDxfEntities}
              dxfBounds={activeLevelBounds}
              colors={colors}
              scaleCalibration={scaleCalibration}
              onUpdateCalibration={(up) => setScaleCalibration((prev) => ({ ...prev, ...up }))}
              snapEnabled={snapEnabled}
              onOpenColumnModal={(footing) => {
                setTargetFootingForColumn(footing);
                setShowColumnModal(true);
              }}
              onStatusMessage={setStatusMessage}
              activeLevel={activeLevel}
              savedViewState={cadViewState}
              onSaveViewState={setCadViewState}
            />
          </div>

          {/* 3D BIM Viewer Container */}
          {(activeView === '3D' || activeView === 'split') && (
            <div
              className={`h-full relative min-w-0 min-h-0 ${
                activeView === 'split' ? 'w-1/2' : 'w-full'
              }`}
            >
              <ThreeBimViewer
                elements={elements}
                dxfEntities={dxfEntities}
                scaleRatio={scaleCalibration.metersPerUnit}
                onSelectElement={(selectedEl) => {
                  setElements((prev) =>
                    prev.map((el) => ({ ...el, selected: el.id === selectedEl.id }))
                  );
                  const markStr = 'mark' in selectedEl ? selectedEl.mark : selectedEl.type;
                  setStatusMessage(`Selected ${selectedEl.type.toUpperCase()} ${markStr}. Showing dimensions in properties.`);
                }}
                onDeselect={handleDeselectAll}
              />
            </div>
          )}
        </main>

        {/* RIGHT PANEL: PROJECT CONTROL & LIVE TAKEOFF */}
        <aside className="w-80 bg-[#0a0f1d] border-l border-slate-800/80 p-3.5 flex flex-col gap-3.5 shrink-0 z-20 overflow-y-auto">
          {/* 1. Element Properties Inspector (Dimensions, Grades, Angles) */}
          <ElementPropertiesPanel
            selectedElement={elements.find((el) => el.selected) || null}
            selectedDxfEntity={dxfEntities.find((ent) => ent.selected) || null}
            dxfEntities={dxfEntities}
            onUpdateDxfEntities={setDxfEntities}
            onUpdateElement={handleUpdateSingleElement}
            onDeleteElement={handleDeleteSingleElement}
            onUpdateDxfEntity={(updated) =>
              setDxfEntities((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
            }
            onDeleteDxfEntity={(id) =>
              setDxfEntities((prev) => prev.filter((e) => e.id !== id))
            }
            onDeleteSelected={handleDeleteSelected}
            onDeselect={handleDeselectAll}
          />

          {/* 2. Project Statistics & Control */}
          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">PROJECT CONTROL</h3>
              <p className="text-[11px] text-slate-500">Live BIM model & takeoff statistics</p>
            </div>

            {/* Metrics List */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">DXF Entities</span>
                <span className="font-mono font-bold text-white">{dxfEntities.length}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Selected DXF</span>
                <span className="font-mono font-bold text-cyan-400">{selectedDxfCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">BIM Elements</span>
                <span className="font-mono font-bold text-white">{elements.length}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Selected Elements</span>
                <span className="font-mono font-bold text-cyan-400">{selectedElementsCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs border-t border-slate-800/80 pt-2">
                <span className="text-slate-400">Scale Ratio</span>
                <span className="font-mono text-emerald-400">1u = {scaleCalibration.metersPerUnit.toFixed(3)}m</span>
              </div>
            </div>

            {/* Live Automated BOQ Summary Card */}
            <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-emerald-800/40 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Live Quantity Takeoff
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400">
                  AUTO
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-center text-slate-300">
                  <span>Concrete Volume:</span>
                  <span className="font-mono font-semibold text-white">
                    {boqResult.totals.totalConcreteVol.toFixed(2)} m³
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>Formwork Area:</span>
                  <span className="font-mono font-semibold text-white">
                    {boqResult.totals.totalFormworkArea.toFixed(2)} m²
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>Steel Reinforcement:</span>
                  <span className="font-mono font-semibold text-cyan-400">
                    {boqResult.totals.totalRebarTons.toFixed(2)} tons
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-300 border-t border-slate-800 pt-1.5">
                  <span className="font-semibold text-slate-200">Total Est. Cost:</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    ${Math.round(boqResult.totals.totalCost).toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowBoqModal(true)}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-bold text-white shadow-md shadow-emerald-600/30 transition flex items-center justify-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Open Detailed BOQ Table
              </button>
            </div>

            {/* Quick Automation: Add Columns to All Footings */}
            {allFootingsCount > 0 && (
              <div className="p-3 bg-cyan-950/20 border border-cyan-800/40 rounded-xl space-y-2">
                <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  Auto-BIM Footing Center
                </div>
                <p className="text-[11px] text-slate-400">
                  Found <span className="text-white font-bold">{allFootingsCount}</span> footings. Click below to add columns centered on all footings instantly.
                </p>
                <button
                  onClick={() => {
                    setTargetFootingForColumn(null);
                    setShowColumnModal(true);
                  }}
                  className="w-full py-1.5 px-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-xs font-semibold text-white transition"
                >
                  Configure & Place Columns
                </button>
              </div>
            )}
          </div>

          {/* Bottom Quick Help Card */}
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1.5">
            <div className="font-semibold text-slate-300 flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
              Keyboard Shortcuts
            </div>
            <div className="text-[10px] space-y-1">
              <div><kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-300 font-mono">ESC</kbd> Cancel active drawing</div>
              <div><kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-300 font-mono">C</kbd> Close Slab / Area polygon</div>
              <div><kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-300 font-mono">Del</kbd> Delete selected elements</div>
              <div><kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-300 font-mono">Enter</kbd> Finalize measurement</div>
            </div>
          </div>
        </aside>
      </div>

      {/* 3. BOTTOM STATUS BAR (Matching Screenshot) */}
      <footer className="h-8 bg-[#0a0f1d] border-t border-slate-800/80 px-4 flex items-center justify-between text-xs text-slate-400 z-30 shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-slate-300 font-mono">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            {statusMessage}
          </span>
        </div>

        <div className="flex items-center gap-4 text-[11px] font-mono">
          <span>
            Snap: <span className={snapEnabled ? 'text-emerald-400 font-bold' : 'text-slate-500'}>{snapEnabled ? 'ACTIVE (Endpoints/Centers)' : 'OFF'}</span>
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Mode: <span className="text-white uppercase font-bold">{toolMode}</span>
          </span>
        </div>
      </footer>

      {/* MODALS */}
      {/* 1. Column Dimension Modal */}
      <ColumnDimensionModal
        isOpen={showColumnModal}
        targetFooting={targetFootingForColumn}
        allFootingsCount={allFootingsCount}
        onClose={() => setShowColumnModal(false)}
        onConfirm={handleConfirmColumnModal}
      />

      {/* 2. Scale Calibration Modal */}
      <ScaleCalibrationModal
        calibration={scaleCalibration}
        onConfirm={handleConfirmScaleCalibration}
        onCancel={() =>
          setScaleCalibration((prev) => ({
            ...prev,
            active: false,
            step: 'completed',
          }))
        }
      />

      {/* 3. Layer Color Settings Modal */}
      <LayerColorModal
        isOpen={showColorModal}
        colors={colors}
        onUpdateColors={setColors}
        onClose={() => setShowColorModal(false)}
      />

      {/* 4. Full Bill of Quantities (BOQ) Modal */}
      <BoqModal
        isOpen={showBoqModal}
        boqResult={boqResult}
        unitRates={unitRates}
        onUpdateRates={setUnitRates}
        scaleCalibration={scaleCalibration}
        onUpdateScaleRatio={(ratio) =>
          setScaleCalibration((prev) => ({
            ...prev,
            metersPerUnit: ratio,
          }))
        }
        onClose={() => setShowBoqModal(false)}
      />

      {/* 5. Assign DXF to Floor Level Modal */}
      <AssignLevelDxfModal
        isOpen={showAssignLevelDxfModal}
        onClose={() => {
          setShowAssignLevelDxfModal(false);
          setPendingDxfUpload(null);
        }}
        pendingFile={pendingDxfUpload}
        levels={levels}
        activeLevelId={activeLevelId}
        onConfirm={handleConfirmAssignLevelDxf}
      />

      {/* 6. Level Manager Modal (Floors & Elevations) */}
      <LevelManagerModal
        isOpen={showLevelManagerModal}
        onClose={() => setShowLevelManagerModal(false)}
        levels={levels}
        activeLevelId={activeLevelId}
        onSelectLevel={(lvlId) => {
          setActiveLevelId(lvlId);
          const lvl = levels.find((l) => l.id === lvlId);
          if (lvl) {
            setStatusMessage(`Switched to floor level: ${lvl.name} (${lvl.elevation >= 0 ? '+' : ''}${lvl.elevation.toFixed(2)}m)`);
          }
        }}
        onUpdateLevels={(updatedLevels) => {
          setLevels(updatedLevels);
          setStatusMessage('Updated project floor levels.');
        }}
      />
    </div>
  );
}
