import React from 'react';
import {
  BIMElement,
  FootingElement,
  ColumnElement,
  BeamElement,
  WallElement,
  SlabElement,
  TextAnnotation,
  DimensionAnnotation,
  DXFEntity,
} from '../types/bim';
import { distance, polygonArea, scalePolygon } from '../utils/geometry';
import { cleanDxfText, isMatchingDxfText, getDxfFormatSignature } from '../utils/dxfParser';
import {
  Sliders,
  Trash2,
  X,
  RotateCw,
  Box,
  Columns,
  Minus,
  Pentagon,
  Type,
  Scaling,
  Ruler,
  Maximize2,
  Sparkles,
} from 'lucide-react';

interface ElementPropertiesPanelProps {
  selectedElement: BIMElement | null;
  selectedDxfEntity?: DXFEntity | null;
  dxfEntities?: DXFEntity[];
  onUpdateElement: (updated: BIMElement) => void;
  onDeleteElement: (id: string) => void;
  onUpdateDxfEntity?: (updated: DXFEntity) => void;
  onUpdateDxfEntities?: (entities: DXFEntity[]) => void;
  onDeleteDxfEntity?: (id: string) => void;
  onDeleteSelected?: () => void;
  onDeselect: () => void;
}

export const ElementPropertiesPanel: React.FC<ElementPropertiesPanelProps> = ({
  selectedElement,
  selectedDxfEntity,
  dxfEntities,
  onUpdateElement,
  onDeleteElement,
  onUpdateDxfEntity,
  onUpdateDxfEntities,
  onDeleteDxfEntity,
  onDeleteSelected,
  onDeselect,
}) => {
  if (!selectedElement && !selectedDxfEntity) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-center">
        <div className="w-8 h-8 rounded-lg bg-slate-800/80 text-slate-500 mx-auto flex items-center justify-center mb-2">
          <Sliders className="w-4 h-4" />
        </div>
        <p className="text-xs font-semibold text-slate-300">No Element Selected</p>
        <p className="text-[11px] text-slate-500 mt-1">
          Click any column, wall, footing, beam, slab, or text to inspect dimensions, quick-resize, or edit text.
        </p>
      </div>
    );
  }

  // Handle DXF Entity Selection (e.g. DXF Text or Line)
  if (!selectedElement && selectedDxfEntity) {
    return (
      <div className="bg-slate-900/95 border border-amber-500/50 rounded-xl shadow-lg p-3.5 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-amber-500/20 text-amber-400">
              {selectedDxfEntity.type === 'TEXT' || selectedDxfEntity.type === 'MTEXT' ? (
                <Type className="w-4 h-4" />
              ) : (
                <Sliders className="w-4 h-4" />
              )}
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                DXF {selectedDxfEntity.type}
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">
                Layer: {selectedDxfEntity.layer || '0'}
              </span>
            </div>
          </div>
          <button
            onClick={onDeselect}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition"
            title="Deselect (ESC)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Text Content Editor for DXF Text */}
        {(selectedDxfEntity.type === 'TEXT' || selectedDxfEntity.type === 'MTEXT') && (
          <div className="space-y-2 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-slate-400">Text Content (Raw)</label>
                {cleanDxfText(selectedDxfEntity.text) !== selectedDxfEntity.text && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                    AutoCAD MTEXT Format
                  </span>
                )}
              </div>
              <textarea
                value={selectedDxfEntity.text || ''}
                onChange={(e) => {
                  if (onUpdateDxfEntity) {
                    onUpdateDxfEntity({ ...selectedDxfEntity, text: e.target.value });
                  }
                }}
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none resize-none"
              />
            </div>

            {/* Clean preview if text has AutoCAD formatting codes */}
            {cleanDxfText(selectedDxfEntity.text) !== selectedDxfEntity.text && (
              <div className="p-2 bg-slate-800/80 rounded-lg border border-slate-700 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Clean Decoded Value:</span>
                  <button
                    onClick={() => {
                      if (onUpdateDxfEntity) {
                        onUpdateDxfEntity({
                          ...selectedDxfEntity,
                          text: cleanDxfText(selectedDxfEntity.text),
                        });
                      }
                    }}
                    className="text-[9px] px-1.5 py-0.5 bg-cyan-950 border border-cyan-700 text-cyan-300 hover:bg-cyan-900 rounded transition"
                    title="Replace raw formatting codes with clean plain text"
                  >
                    Strip Codes
                  </button>
                </div>
                <div className="font-mono text-sm font-bold text-amber-300">
                  {cleanDxfText(selectedDxfEntity.text) || '(empty)'}
                </div>
              </div>
            )}

            {/* Batch Text Selection Actions */}
            {dxfEntities && onUpdateDxfEntities && (
              <div className="p-2 bg-purple-950/30 border border-purple-800/60 rounded-xl space-y-1.5">
                <div className="text-[10px] font-bold text-purple-300 flex items-center gap-1.5">
                  <Type className="w-3 h-3 text-purple-400" />
                  BATCH TEXT SELECTION
                </div>
                <div className="grid grid-cols-1 gap-1">
                  <button
                    onClick={() => {
                      const target = selectedDxfEntity.text;
                      const updated = dxfEntities.map((e) =>
                        (e.type === 'TEXT' || e.type === 'MTEXT') && isMatchingDxfText(e.text, target)
                          ? { ...e, selected: true }
                          : e
                      );
                      onUpdateDxfEntities(updated);
                    }}
                    className="w-full py-1 px-2 text-left bg-purple-900/40 hover:bg-purple-800/60 border border-purple-700/50 rounded text-[11px] text-purple-200 flex items-center justify-between transition"
                  >
                    <span className="truncate pr-1">Select All Matching ("{cleanDxfText(selectedDxfEntity.text) || selectedDxfEntity.text}")</span>
                    <span className="font-mono font-bold text-purple-300 shrink-0">
                      {dxfEntities.filter((e) => (e.type === 'TEXT' || e.type === 'MTEXT') && isMatchingDxfText(e.text, selectedDxfEntity.text)).length}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      const lyr = selectedDxfEntity.layer;
                      const updated = dxfEntities.map((e) =>
                        (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer === lyr
                          ? { ...e, selected: true }
                          : e
                      );
                      onUpdateDxfEntities(updated);
                    }}
                    className="w-full py-1 px-2 text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[11px] text-slate-300 flex items-center justify-between transition"
                  >
                    <span className="truncate pr-1">Select All Text on Layer "{selectedDxfEntity.layer || '0'}"</span>
                    <span className="font-mono font-bold text-slate-300 shrink-0">
                      {dxfEntities.filter((e) => (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer === selectedDxfEntity.layer).length}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      const updated = dxfEntities.map((e) =>
                        e.type === 'TEXT' || e.type === 'MTEXT' ? { ...e, selected: true } : e
                      );
                      onUpdateDxfEntities(updated);
                    }}
                    className="w-full py-1 px-2 text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[11px] text-slate-300 flex items-center justify-between transition"
                  >
                    <span>Select All Text Entities in DXF</span>
                    <span className="font-mono font-bold text-slate-300 shrink-0">
                      {dxfEntities.filter((e) => e.type === 'TEXT' || e.type === 'MTEXT').length}
                    </span>
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Text Height / Size (m)</label>
              <input
                type="number"
                step="0.05"
                min="0.05"
                value={selectedDxfEntity.height || 0.35}
                onChange={(e) => {
                  if (onUpdateDxfEntity) {
                    onUpdateDxfEntity({
                      ...selectedDxfEntity,
                      height: Math.max(0.05, parseFloat(e.target.value) || 0.35),
                    });
                  }
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Delete DXF Entity */}
        <div className="flex gap-2 pt-2 border-t border-slate-800">
          {onDeleteDxfEntity && (
            <button
              onClick={() => onDeleteDxfEntity(selectedDxfEntity.id)}
              className="flex-1 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              title="Delete DXF Entity (Delete key)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete DXF Entity
            </button>
          )}
          <button
            onClick={onDeselect}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (!selectedElement) return null;

  const getElementIcon = () => {
    switch (selectedElement.type) {
      case 'column':
        return <Columns className="w-4 h-4 text-red-400" />;
      case 'footing':
        return <Box className="w-4 h-4 text-orange-400" />;
      case 'wall':
        return <Minus className="w-4 h-4 text-slate-300" />;
      case 'beam':
        return <Minus className="w-4 h-4 text-indigo-400" />;
      case 'slab':
        return <Pentagon className="w-4 h-4 text-emerald-400" />;
      case 'text':
        return <Type className="w-4 h-4 text-purple-400" />;
      case 'annotation':
        return <Ruler className="w-4 h-4 text-amber-400" />;
      default:
        return <Sliders className="w-4 h-4 text-cyan-400" />;
    }
  };

  const getElementTitle = () => {
    switch (selectedElement.type) {
      case 'column':
        return `Column: ${selectedElement.mark}`;
      case 'footing':
        return `Footing: ${selectedElement.mark}`;
      case 'wall':
        return `Wall: ${selectedElement.mark}`;
      case 'beam':
        return `Beam: ${selectedElement.mark}`;
      case 'slab':
        return `Slab: ${selectedElement.mark}`;
      case 'text':
        return 'Text Annotation';
      case 'annotation':
        return 'Dimension Annotation';
      default:
        return 'Element Properties';
    }
  };

  return (
    <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-lg p-3.5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-slate-800/90">{getElementIcon()}</div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              {getElementTitle()}
            </h4>
            <span className="text-[10px] text-cyan-400 font-mono">
              ID: {selectedElement.id.slice(-6)}
            </span>
          </div>
        </div>
        <button
          onClick={onDeselect}
          className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition"
          title="Deselect (ESC)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 1. TEXT ANNOTATION EDITOR */}
      {selectedElement.type === 'text' && (
        <div className="space-y-3 text-xs">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Annotation Text</label>
            <textarea
              value={selectedElement.text}
              onChange={(e) =>
                onUpdateElement({ ...selectedElement, text: e.target.value })
              }
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none resize-none"
              placeholder="e.g. C1 - 400x400, Level +3.20m"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] text-slate-400">Font Size (m)</label>
              <span className="font-mono text-purple-300 text-[10px]">
                {selectedElement.fontSize.toFixed(2)}m
              </span>
            </div>
            <div className="flex gap-1.5 mb-1.5">
              {[0.25, 0.35, 0.50, 0.80].map((sz) => (
                <button
                  key={sz}
                  onClick={() => onUpdateElement({ ...selectedElement, fontSize: sz })}
                  className={`flex-1 py-1 rounded text-[10px] font-mono border transition ${
                    Math.abs(selectedElement.fontSize - sz) < 0.05
                      ? 'bg-purple-600 border-purple-400 text-white font-bold'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  {sz.toFixed(2)}m
                </button>
              ))}
            </div>
            <input
              type="range"
              min="0.15"
              max="1.50"
              step="0.05"
              value={selectedElement.fontSize}
              onChange={(e) =>
                onUpdateElement({ ...selectedElement, fontSize: parseFloat(e.target.value) })
              }
              className="w-full accent-purple-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Text Color</label>
            <div className="flex gap-1.5">
              {['#ffffff', '#38bdf8', '#f59e0b', '#10b981', '#f43f5e', '#a855f7'].map((col) => (
                <button
                  key={col}
                  onClick={() => onUpdateElement({ ...selectedElement, color: col })}
                  className={`w-6 h-6 rounded-md border-2 transition ${
                    selectedElement.color === col ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: col }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. FOOTING PROPERTIES & RESIZE */}
      {selectedElement.type === 'footing' && (
        <div className="space-y-3 text-xs">
          {/* Quick Resize Section */}
          <div className="p-2.5 bg-slate-950/80 border border-orange-500/40 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-orange-400 font-bold text-[11px]">
              <Scaling className="w-3.5 h-3.5" />
              <span>Footing Quick Resize</span>
            </div>

            {/* Standard Presets */}
            {!selectedElement.points && (
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Standard Presets (W × L)</label>
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { label: '1.5m', w: 1.5, l: 1.5 },
                    { label: '2.0m', w: 2.0, l: 2.0 },
                    { label: '2.5m', w: 2.5, l: 2.5 },
                    { label: '3.0m', w: 3.0, l: 3.0 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      onClick={() =>
                        onUpdateElement({ ...selectedElement, width: p.w, length: p.l })
                      }
                      className={`py-1 rounded text-[10px] font-mono border transition ${
                        Math.abs(selectedElement.width - p.w) < 0.05 &&
                        Math.abs(selectedElement.length - p.l) < 0.05
                          ? 'bg-orange-600 border-orange-400 text-white font-bold'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Direct Scaling Multipliers */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Scale Multiplier</label>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { label: '-20%', factor: 0.8 },
                  { label: '-10%', factor: 0.9 },
                  { label: '+10%', factor: 1.1 },
                  { label: '+25%', factor: 1.25 },
                ].map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      if (selectedElement.points) {
                        const scaledPts = scalePolygon(selectedElement.points, s.factor);
                        onUpdateElement({ ...selectedElement, points: scaledPts });
                      } else {
                        onUpdateElement({
                          ...selectedElement,
                          width: Math.round(selectedElement.width * s.factor * 100) / 100,
                          length: Math.round(selectedElement.length * s.factor * 100) / 100,
                        });
                      }
                    }}
                    className="py-1 rounded text-[10px] font-bold bg-slate-800 hover:bg-orange-600/30 border border-slate-700 hover:border-orange-500 text-slate-200 hover:text-orange-300 transition"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Mark / Label</label>
              <input
                type="text"
                value={selectedElement.mark}
                onChange={(e) =>
                  onUpdateElement({ ...selectedElement, mark: e.target.value })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Concrete Grade</label>
              <select
                value={selectedElement.concreteGrade}
                onChange={(e) =>
                  onUpdateElement({ ...selectedElement, concreteGrade: e.target.value })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:border-cyan-500 focus:outline-none"
              >
                <option value="C25/30">C25/30</option>
                <option value="C30/37">C30/37</option>
                <option value="C35/45">C35/45</option>
              </select>
            </div>
          </div>

          {/* Polygon vs Rectangular dimensions */}
          {selectedElement.points && selectedElement.points.length >= 3 ? (
            <div className="p-2 bg-slate-950/70 rounded border border-orange-900/40 space-y-1.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-orange-300 font-medium">Inclined / Polygon Footing</span>
                <span className="font-mono text-white">
                  {polygonArea(selectedElement.points).toFixed(2)} m²
                </span>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Depth / Thickness (m)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  value={selectedElement.depth}
                  onChange={(e) =>
                    onUpdateElement({
                      ...selectedElement,
                      depth: Math.max(0.1, parseFloat(e.target.value) || 0.1),
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Width (m)</label>
                <input
                  type="number"
                  step="0.10"
                  min="0.2"
                  value={selectedElement.width}
                  onChange={(e) =>
                    onUpdateElement({
                      ...selectedElement,
                      width: Math.max(0.2, parseFloat(e.target.value) || 0.2),
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Length (m)</label>
                <input
                  type="number"
                  step="0.10"
                  min="0.2"
                  value={selectedElement.length}
                  onChange={(e) =>
                    onUpdateElement({
                      ...selectedElement,
                      length: Math.max(0.2, parseFloat(e.target.value) || 0.2),
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Depth (m)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  value={selectedElement.depth}
                  onChange={(e) =>
                    onUpdateElement({
                      ...selectedElement,
                      depth: Math.max(0.1, parseFloat(e.target.value) || 0.1),
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Elevation (m)</label>
                <input
                  type="number"
                  step="0.10"
                  value={selectedElement.elevation}
                  onChange={(e) =>
                    onUpdateElement({
                      ...selectedElement,
                      elevation: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Inclination Angle */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] text-slate-400 flex items-center gap-1">
                <RotateCw className="w-3 h-3 text-orange-400" /> Inclination Angle
              </label>
              <span className="font-mono text-orange-300 text-[11px]">
                {(selectedElement.rotation || 0).toFixed(1)}°
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={selectedElement.rotation || 0}
              onChange={(e) =>
                onUpdateElement({ ...selectedElement, rotation: parseFloat(e.target.value) })
              }
              className="w-full accent-orange-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
          </div>
        </div>
      )}

      {/* 3. COLUMN PROPERTIES & RESIZE */}
      {selectedElement.type === 'column' && (
        <div className="space-y-3 text-xs">
          {/* Quick Resize Section */}
          <div className="p-2.5 bg-slate-950/80 border border-red-500/40 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-red-400 font-bold text-[11px]">
              <Scaling className="w-3.5 h-3.5" />
              <span>Column Quick Resize</span>
            </div>

            {/* Standard Cross-Section Presets */}
            {!selectedElement.points && (
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Standard Sections (W × D)</label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { label: '300×300', w: 0.3, d: 0.3 },
                    { label: '400×400', w: 0.4, d: 0.4 },
                    { label: '500×500', w: 0.5, d: 0.5 },
                    { label: '300×600', w: 0.3, d: 0.6 },
                    { label: '400×800', w: 0.4, d: 0.8 },
                    { label: '500×1000', w: 0.5, d: 1.0 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      onClick={() =>
                        onUpdateElement({ ...selectedElement, width: p.w, depth: p.d })
                      }
                      className={`py-1 rounded text-[10px] font-mono border transition ${
                        Math.abs(selectedElement.width - p.w) < 0.02 &&
                        Math.abs(selectedElement.depth - p.d) < 0.02
                          ? 'bg-red-600 border-red-400 text-white font-bold'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Direct Scaling Multipliers */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Scale Multiplier</label>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { label: '-20%', factor: 0.8 },
                  { label: '-10%', factor: 0.9 },
                  { label: '+10%', factor: 1.1 },
                  { label: '+25%', factor: 1.25 },
                ].map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      if (selectedElement.points) {
                        const scaledPts = scalePolygon(selectedElement.points, s.factor);
                        onUpdateElement({ ...selectedElement, points: scaledPts });
                      } else {
                        onUpdateElement({
                          ...selectedElement,
                          width: Math.round(selectedElement.width * s.factor * 100) / 100,
                          depth: Math.round(selectedElement.depth * s.factor * 100) / 100,
                        });
                      }
                    }}
                    className="py-1 rounded text-[10px] font-bold bg-slate-800 hover:bg-red-600/30 border border-slate-700 hover:border-red-500 text-slate-200 hover:text-red-300 transition"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Mark / Label</label>
              <input
                type="text"
                value={selectedElement.mark}
                onChange={(e) =>
                  onUpdateElement({ ...selectedElement, mark: e.target.value })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Concrete Grade</label>
              <select
                value={selectedElement.concreteGrade}
                onChange={(e) =>
                  onUpdateElement({ ...selectedElement, concreteGrade: e.target.value })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:border-cyan-500 focus:outline-none"
              >
                <option value="C25/30">C25/30</option>
                <option value="C30/37">C30/37</option>
                <option value="C35/45">C35/45</option>
              </select>
            </div>
          </div>

          {!selectedElement.points && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Width (m)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  value={selectedElement.width}
                  onChange={(e) =>
                    onUpdateElement({
                      ...selectedElement,
                      width: Math.max(0.1, parseFloat(e.target.value) || 0.1),
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Depth (m)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  value={selectedElement.depth}
                  onChange={(e) =>
                    onUpdateElement({
                      ...selectedElement,
                      depth: Math.max(0.1, parseFloat(e.target.value) || 0.1),
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Height (m)</label>
              <input
                type="number"
                step="0.10"
                min="0.5"
                value={selectedElement.height}
                onChange={(e) =>
                  onUpdateElement({
                    ...selectedElement,
                    height: Math.max(0.5, parseFloat(e.target.value) || 0.5),
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Base Elevation (m)</label>
              <input
                type="number"
                step="0.10"
                value={selectedElement.baseElevation || 0}
                onChange={(e) =>
                  onUpdateElement({
                    ...selectedElement,
                    baseElevation: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Inclination Angle */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] text-slate-400 flex items-center gap-1">
                <RotateCw className="w-3 h-3 text-red-400" /> Column Angle
              </label>
              <span className="font-mono text-red-300 text-[11px]">
                {(selectedElement.rotation || 0).toFixed(1)}°
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={selectedElement.rotation || 0}
              onChange={(e) =>
                onUpdateElement({ ...selectedElement, rotation: parseFloat(e.target.value) })
              }
              className="w-full accent-red-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
          </div>
        </div>
      )}

      {/* 4. SLAB PROPERTIES & RESIZE */}
      {selectedElement.type === 'slab' && (
        <div className="space-y-3 text-xs">
          {/* Quick Resize Section */}
          <div className="p-2.5 bg-slate-950/80 border border-emerald-500/40 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
              <Scaling className="w-3.5 h-3.5" />
              <span>Slab Quick Resize (Area & Boundary)</span>
            </div>

            {/* Direct Area Scale Multipliers */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Scale Slab Area</label>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { label: '-20%', factor: 0.8 },
                  { label: '-10%', factor: 0.9 },
                  { label: '+10%', factor: 1.1 },
                  { label: '+25%', factor: 1.25 },
                ].map((s) => (
                  <button
                    key={s.label}
                    onClick={() => {
                      const scaledPts = scalePolygon(selectedElement.points, s.factor);
                      onUpdateElement({ ...selectedElement, points: scaledPts });
                    }}
                    className="py-1 rounded text-[10px] font-bold bg-slate-800 hover:bg-emerald-600/30 border border-slate-700 hover:border-emerald-500 text-slate-200 hover:text-emerald-300 transition"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Thickness Presets */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Thickness Presets</label>
              <div className="grid grid-cols-4 gap-1">
                {[0.15, 0.20, 0.25, 0.30].map((th) => (
                  <button
                    key={th}
                    onClick={() => onUpdateElement({ ...selectedElement, thickness: th })}
                    className={`py-1 rounded text-[10px] font-mono border transition ${
                      Math.abs(selectedElement.thickness - th) < 0.01
                        ? 'bg-emerald-600 border-emerald-400 text-white font-bold'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    {Math.round(th * 1000)}mm
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Mark / Label</label>
              <input
                type="text"
                value={selectedElement.mark}
                onChange={(e) =>
                  onUpdateElement({ ...selectedElement, mark: e.target.value })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Concrete Grade</label>
              <select
                value={selectedElement.concreteGrade}
                onChange={(e) =>
                  onUpdateElement({ ...selectedElement, concreteGrade: e.target.value })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:border-cyan-500 focus:outline-none"
              >
                <option value="C25/30">C25/30</option>
                <option value="C30/37">C30/37</option>
                <option value="C35/45">C35/45</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Thickness (m)</label>
              <input
                type="number"
                step="0.02"
                min="0.08"
                value={selectedElement.thickness}
                onChange={(e) =>
                  onUpdateElement({
                    ...selectedElement,
                    thickness: Math.max(0.08, parseFloat(e.target.value) || 0.08),
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Elevation (m)</label>
              <input
                type="number"
                step="0.10"
                value={selectedElement.elevation}
                onChange={(e) =>
                  onUpdateElement({
                    ...selectedElement,
                    elevation: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="p-2 bg-slate-950/70 rounded border border-emerald-900/40 space-y-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-emerald-300 font-medium">Calculated Slab Area:</span>
              <span className="font-mono font-bold text-white">
                {polygonArea(selectedElement.points).toFixed(2)} m²
              </span>
            </div>
            <p className="text-[10px] text-slate-500">
              {selectedElement.points.length} nodes. Drag corner grips directly on canvas to reshape.
            </p>
          </div>
        </div>
      )}

      {/* 5. BEAM PROPERTIES */}
      {selectedElement.type === 'beam' && (
        <div className="space-y-3 text-xs">
          <div className="p-2 bg-slate-950/80 border border-indigo-500/40 rounded-xl space-y-2">
            <label className="text-[10px] text-slate-400 block">Cross Section Presets (W × D)</label>
            <div className="grid grid-cols-4 gap-1">
              {[
                { label: '25×50', w: 0.25, d: 0.5 },
                { label: '30×60', w: 0.3, d: 0.6 },
                { label: '30×70', w: 0.3, d: 0.7 },
                { label: '40×80', w: 0.4, d: 0.8 },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => onUpdateElement({ ...selectedElement, width: p.w, depth: p.d })}
                  className="py-1 rounded text-[10px] font-mono bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500 text-slate-300 hover:text-white transition"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Mark / Label</label>
              <input
                type="text"
                value={selectedElement.mark}
                onChange={(e) =>
                  onUpdateElement({ ...selectedElement, mark: e.target.value })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Concrete Grade</label>
              <select
                value={selectedElement.concreteGrade}
                onChange={(e) =>
                  onUpdateElement({ ...selectedElement, concreteGrade: e.target.value })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:border-cyan-500 focus:outline-none"
              >
                <option value="C25/30">C25/30</option>
                <option value="C30/37">C30/37</option>
                <option value="C35/45">C35/45</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Width (m)</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                value={selectedElement.width}
                onChange={(e) =>
                  onUpdateElement({
                    ...selectedElement,
                    width: Math.max(0.1, parseFloat(e.target.value) || 0.1),
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Depth (m)</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                value={selectedElement.depth}
                onChange={(e) =>
                  onUpdateElement({
                    ...selectedElement,
                    depth: Math.max(0.1, parseFloat(e.target.value) || 0.1),
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-between items-center text-slate-300 py-1 border-t border-slate-800">
            <span className="text-[11px]">Span Length:</span>
            <span className="font-mono font-bold text-indigo-300">
              {distance(selectedElement.startPoint, selectedElement.endPoint).toFixed(2)} m
            </span>
          </div>
        </div>
      )}

      {/* 6. WALL PROPERTIES */}
      {selectedElement.type === 'wall' && (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Mark / Label</label>
              <input
                type="text"
                value={selectedElement.mark}
                onChange={(e) =>
                  onUpdateElement({ ...selectedElement, mark: e.target.value })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Concrete Grade</label>
              <select
                value={selectedElement.concreteGrade}
                onChange={(e) =>
                  onUpdateElement({ ...selectedElement, concreteGrade: e.target.value })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:border-cyan-500 focus:outline-none"
              >
                <option value="C25/30">C25/30</option>
                <option value="C30/37">C30/37</option>
                <option value="C35/45">C35/45</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Thickness (m)</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                value={selectedElement.thickness}
                onChange={(e) =>
                  onUpdateElement({
                    ...selectedElement,
                    thickness: Math.max(0.1, parseFloat(e.target.value) || 0.1),
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Height (m)</label>
              <input
                type="number"
                step="0.10"
                min="0.5"
                value={selectedElement.height}
                onChange={(e) =>
                  onUpdateElement({
                    ...selectedElement,
                    height: Math.max(0.5, parseFloat(e.target.value) || 0.5),
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-between items-center text-slate-300 py-1 border-t border-slate-800">
            <span className="text-[11px]">Wall Length:</span>
            <span className="font-mono font-bold text-slate-300">
              {distance(selectedElement.startPoint, selectedElement.endPoint).toFixed(2)} m
            </span>
          </div>
        </div>
      )}

      {/* Action Buttons: Delete & Done */}
      <div className="flex gap-2 pt-2 border-t border-slate-800">
        <button
          onClick={() => onDeleteElement(selectedElement.id)}
          className="flex-1 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow"
          title="Delete Element (Delete key)"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Element
        </button>
        <button
          onClick={onDeselect}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition"
          title="Done (ESC)"
        >
          Done
        </button>
      </div>
    </div>
  );
};
