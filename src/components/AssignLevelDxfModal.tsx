import React, { useState, useEffect } from 'react';
import { ProjectLevel } from '../types/bim';
import { Layers, Check, X, FileUp, Building2, ArrowUpRight } from 'lucide-react';

interface AssignLevelDxfModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingFile: {
    file: File;
    parsed: {
      entities: any[];
      bounds: any;
      suggestedScaleUnit?: 'm' | 'mm';
    };
  } | null;
  levels: ProjectLevel[];
  activeLevelId: string;
  onConfirm: (
    targetLevelId: string,
    levelName: string,
    elevation: number,
    height: number
  ) => void;
}

export const AssignLevelDxfModal: React.FC<AssignLevelDxfModalProps> = ({
  isOpen,
  onClose,
  pendingFile,
  levels,
  activeLevelId,
  onConfirm,
}) => {
  const [selectedLevelId, setSelectedLevelId] = useState<string>(activeLevelId);
  const [levelName, setLevelName] = useState<string>('Ground Floor');
  const [elevation, setElevation] = useState<number>(0);
  const [height, setHeight] = useState<number>(3.2);
  const [isNewCustom, setIsNewCustom] = useState<boolean>(false);

  // Sync defaults when modal opens or activeLevel changes
  useEffect(() => {
    if (!isOpen) return;
    const current = levels.find((l) => l.id === activeLevelId) || levels[0];
    if (current) {
      setSelectedLevelId(current.id);
      setLevelName(current.name);
      setElevation(current.elevation);
      setHeight(current.height);
      setIsNewCustom(false);
    }
  }, [isOpen, activeLevelId, levels]);

  if (!isOpen || !pendingFile) return null;

  const handleSelectExisting = (lvl: ProjectLevel) => {
    setSelectedLevelId(lvl.id);
    setLevelName(lvl.name);
    setElevation(lvl.elevation);
    setHeight(lvl.height);
    setIsNewCustom(false);
  };

  const handleSelectNewCustom = () => {
    setIsNewCustom(true);
    const nextElev = levels.length > 0 ? Math.max(...levels.map((l) => l.elevation)) + 3.2 : 4.0;
    setSelectedLevelId(`lvl-custom-${Date.now()}`);
    setLevelName(`Level at +${nextElev.toFixed(1)}m`);
    setElevation(nextElev);
    setHeight(3.2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(selectedLevelId, levelName.trim(), elevation, height);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-cyan-500/60 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden text-white animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Assign DXF to Floor Level</h2>
              <p className="text-xs text-slate-400">Specify floor level & elevation before drawing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* File summary pill */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
            <div className="flex items-center gap-2 text-cyan-300 font-medium truncate">
              <FileUp className="w-4 h-4 shrink-0 text-cyan-400" />
              <span className="truncate">{pendingFile.file.name}</span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 shrink-0">
              {pendingFile.parsed.entities.length} entities
            </span>
          </div>

          {/* Floor Level Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Select Floor Level Target:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {levels.map((lvl) => {
                const isSelected = !isNewCustom && selectedLevelId === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => handleSelectExisting(lvl)}
                    className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition ${
                      isSelected
                        ? 'bg-cyan-950/80 border-cyan-500 text-white shadow-md'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:border-slate-600 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold truncate">{lvl.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    </div>
                    <span className="text-[11px] font-mono text-cyan-400/90 mt-1">
                      {lvl.elevation >= 0 ? '+' : ''}
                      {lvl.elevation.toFixed(2)}m
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleSelectNewCustom}
                className={`flex flex-col items-start p-2.5 rounded-xl border border-dashed text-left transition ${
                  isNewCustom
                    ? 'bg-amber-950/70 border-amber-500 text-amber-200'
                    : 'bg-slate-800/30 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold">+ New Level</span>
                  {isNewCustom && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <span className="text-[10px] text-slate-400 mt-1">Custom floor height</span>
              </button>
            </div>
          </div>

          {/* Level Name & Elevation Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Level / Storey Name
              </label>
              <input
                type="text"
                value={levelName}
                onChange={(e) => setLevelName(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-hidden focus:border-cyan-500"
                placeholder="e.g. Ground Floor, First Floor"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Floor Level Elevation (m)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.05"
                  value={elevation}
                  onChange={(e) => setElevation(parseFloat(e.target.value) || 0)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-cyan-300 focus:outline-hidden focus:border-cyan-500"
                  placeholder="+4.00"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">meters</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Storey Height (m)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.05"
                min="0.5"
                value={height}
                onChange={(e) => setHeight(parseFloat(e.target.value) || 3.2)}
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-emerald-300 focus:outline-hidden focus:border-cyan-500"
                placeholder="3.20"
              />
              <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">meters</span>
            </div>
          </div>

          {/* Workflow rule explanation */}
          <div className="p-3 bg-cyan-950/40 border border-cyan-800/50 rounded-xl text-[11px] text-cyan-200/90 leading-relaxed">
            <span className="font-semibold text-cyan-300">Level Isolation Rule:</span> When you switch to this level, previous floor drawings are hidden from 2D view for clarity, while the 3D model automatically accumulates all levels together into the complete building.
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-slate-900 bg-cyan-400 hover:bg-cyan-300 rounded-xl shadow-lg transition flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Confirm & Start Drawing
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
