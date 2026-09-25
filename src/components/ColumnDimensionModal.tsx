import React, { useState } from 'react';
import { FootingElement } from '../types/bim';
import { Columns, Check, X, Sparkles } from 'lucide-react';

interface ColumnDimensionModalProps {
  isOpen: boolean;
  targetFooting: FootingElement | null;
  allFootingsCount: number;
  onClose: () => void;
  onConfirm: (config: {
    width: number;
    depth: number;
    height: number;
    mark: string;
    concreteGrade: string;
    applyToAll: boolean;
  }) => void;
}

export const ColumnDimensionModal: React.FC<ColumnDimensionModalProps> = ({
  isOpen,
  targetFooting,
  allFootingsCount,
  onClose,
  onConfirm,
}) => {
  const [width, setWidth] = useState<number>(0.40);
  const [depth, setDepth] = useState<number>(0.40);
  const [height, setHeight] = useState<number>(3.20);
  const [mark, setMark] = useState<string>('C1');
  const [concreteGrade, setConcreteGrade] = useState<string>('C30/37');
  const [applyToAll, setApplyToAll] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm({
      width: Number(width) || 0.40,
      depth: Number(depth) || 0.40,
      height: Number(height) || 3.20,
      mark: mark.trim() || 'C1',
      concreteGrade,
      applyToAll,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
              <Columns className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Create Structural Column</h3>
              <p className="text-xs text-slate-400">
                {targetFooting
                  ? `Positioned at center of Footing ${targetFooting.mark}`
                  : 'Specify column cross-section and height'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Column Mark / ID</label>
              <input
                type="text"
                value={mark}
                onChange={(e) => setMark(e.target.value)}
                placeholder="e.g. C1"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Concrete Grade</label>
              <select
                value={concreteGrade}
                onChange={(e) => setConcreteGrade(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="C25/30">C25/30</option>
                <option value="C30/37">C30/37 (Standard)</option>
                <option value="C35/45">C35/45 (High Strength)</option>
                <option value="C40/50">C40/50</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cross Section (Meters)</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Width X (b)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    value={width}
                    onChange={(e) => setWidth(parseFloat(e.target.value) || 0)}
                    className="w-full pl-2.5 pr-6 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <span className="absolute right-2 top-1.5 text-xs text-slate-500">m</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Depth Y (h)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    value={depth}
                    onChange={(e) => setDepth(parseFloat(e.target.value) || 0)}
                    className="w-full pl-2.5 pr-6 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <span className="absolute right-2 top-1.5 text-xs text-slate-500">m</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Height (H)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    value={height}
                    onChange={(e) => setHeight(parseFloat(e.target.value) || 0)}
                    className="w-full pl-2.5 pr-6 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <span className="absolute right-2 top-1.5 text-xs text-slate-500">m</span>
                </div>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80">
              <span>Section: {Math.round(width * 100)} × {Math.round(depth * 100)} cm</span>
              <span className="text-cyan-400 font-mono">Vol: {(width * depth * height).toFixed(3)} m³</span>
            </div>
          </div>

          {/* Option to apply to all footings */}
          {allFootingsCount > 1 && (
            <label className="flex items-start gap-3 p-3 rounded-lg bg-cyan-950/20 border border-cyan-900/40 cursor-pointer hover:bg-cyan-950/30 transition">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/20"
              />
              <div className="text-xs">
                <div className="font-medium text-cyan-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  Add to ALL {allFootingsCount} Footings at their centers
                </div>
                <div className="text-slate-400 mt-0.5">
                  Automatically generates columns at the center of every footing on the drawing as per BIM standards.
                </div>
              </div>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-900/80 border-t border-slate-800 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            Cancel (ESC)
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg shadow-lg shadow-red-600/30 flex items-center gap-1.5 transition"
          >
            <Check className="w-4 h-4" />
            OK, Add Column{applyToAll ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
