import React, { useState } from 'react';
import { ProjectLevel } from '../types/bim';
import { Layers, Plus, Trash2, Edit2, Check, X, Building, ArrowUp } from 'lucide-react';

interface LevelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  levels: ProjectLevel[];
  activeLevelId: string;
  onSelectLevel: (levelId: string) => void;
  onUpdateLevels: (levels: ProjectLevel[]) => void;
}

export const LevelManagerModal: React.FC<LevelManagerModalProps> = ({
  isOpen,
  onClose,
  levels,
  activeLevelId,
  onSelectLevel,
  onUpdateLevels,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editElevation, setEditElevation] = useState<number>(0);
  const [editHeight, setEditHeight] = useState<number>(3.2);

  // New level inputs
  const [newName, setNewName] = useState<string>('');
  const [newElevation, setNewElevation] = useState<number>(() => {
    return levels.length > 0 ? Math.max(...levels.map((l) => l.elevation)) + 3.2 : 0;
  });
  const [newHeight, setNewHeight] = useState<number>(3.2);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  if (!isOpen) return null;

  const startEdit = (lvl: ProjectLevel) => {
    setEditingId(lvl.id);
    setEditName(lvl.name);
    setEditElevation(lvl.elevation);
    setEditHeight(lvl.height);
  };

  const saveEdit = (id: string) => {
    const updated = levels.map((lvl) =>
      lvl.id === id
        ? { ...lvl, name: editName.trim() || lvl.name, elevation: editElevation, height: editHeight }
        : lvl
    );
    updated.sort((a, b) => a.elevation - b.elevation);
    onUpdateLevels(updated);
    setEditingId(null);
  };

  const handleAddLevel = (e: React.FormEvent) => {
    e.preventDefault();
    const newLvl: ProjectLevel = {
      id: `lvl-${Date.now()}`,
      name: newName.trim() || `Level +${newElevation.toFixed(1)}m`,
      elevation: newElevation,
      height: newHeight,
    };
    const updated = [...levels, newLvl].sort((a, b) => a.elevation - b.elevation);
    onUpdateLevels(updated);
    onSelectLevel(newLvl.id);
    setNewName('');
    setShowAddForm(false);
  };

  const handleDeleteLevel = (id: string) => {
    if (levels.length <= 1) return;
    const updated = levels.filter((lvl) => lvl.id !== id);
    onUpdateLevels(updated);
    if (activeLevelId === id) {
      onSelectLevel(updated[0].id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden text-white animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Project Floor Levels & Elevations</h2>
              <p className="text-xs text-slate-400">Configure multi-storey floors (+0.00m, +4.00m, etc.)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Level List */}
          <div className="space-y-2">
            {levels.map((lvl) => {
              const isActive = lvl.id === activeLevelId;
              const isEditing = lvl.id === editingId;

              if (isEditing) {
                return (
                  <div
                    key={lvl.id}
                    className="p-3 rounded-xl border border-cyan-500/80 bg-slate-950 space-y-2"
                  >
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="text-[10px] text-slate-400">Name</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400">Elevation (m)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={editElevation}
                          onChange={(e) => setEditElevation(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-cyan-300"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400">Height (m)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={editHeight}
                          onChange={(e) => setEditHeight(parseFloat(e.target.value) || 3.2)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-emerald-300"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 text-[11px] text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(lvl.id)}
                        className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 shadow"
                      >
                        <Check className="w-3 h-3" /> Save
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={lvl.id}
                  className={`flex items-center justify-between p-3 rounded-xl border transition ${
                    isActive
                      ? 'bg-cyan-950/40 border-cyan-500/80 shadow-md'
                      : 'bg-slate-800/50 border-slate-700/60 hover:border-slate-600'
                  }`}
                >
                  <div
                    className="flex items-center gap-3 cursor-pointer flex-1"
                    onClick={() => onSelectLevel(lvl.id)}
                  >
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        isActive ? 'bg-cyan-400 ring-4 ring-cyan-500/20' : 'bg-slate-600'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{lvl.name}</span>
                        {isActive && (
                          <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                            Active 2D Floor
                          </span>
                        )}
                        {lvl.dxfFileName && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                            ({lvl.dxfFileName})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                        <span>
                          Floor Elevation:{' '}
                          <strong className="text-cyan-400 font-mono">
                            {lvl.elevation >= 0 ? '+' : ''}
                            {lvl.elevation.toFixed(2)}m
                          </strong>
                        </span>
                        <span>
                          Height:{' '}
                          <strong className="text-emerald-400 font-mono">{lvl.height.toFixed(2)}m</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pl-3 border-l border-slate-700/80">
                    <button
                      onClick={() => startEdit(lvl)}
                      className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-slate-700 rounded-lg transition"
                      title="Edit Level Elevation"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {levels.length > 1 && (
                      <button
                        onClick={() => handleDeleteLevel(lvl.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-700 rounded-lg transition"
                        title="Delete Level"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add New Level Section */}
          {!showAddForm ? (
            <button
              onClick={() => {
                setShowAddForm(true);
                const nextElev =
                  levels.length > 0 ? Math.max(...levels.map((l) => l.elevation)) + 3.2 : 0;
                setNewElevation(nextElev);
                setNewName(`Floor Level +${nextElev.toFixed(1)}m`);
              }}
              className="w-full py-2.5 border border-dashed border-slate-700 hover:border-cyan-500 hover:bg-cyan-950/20 text-slate-400 hover:text-cyan-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
            >
              <Plus className="w-4 h-4" /> Add New Level (+4.00m, +5.00m...)
            </button>
          ) : (
            <form
              onSubmit={handleAddLevel}
              className="p-3.5 bg-slate-950 border border-slate-700 rounded-xl space-y-3"
            >
              <h4 className="text-xs font-bold text-slate-200">New Floor Level Details</h4>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400">Level Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                    placeholder="e.g. First Floor"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Floor Level (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={newElevation}
                    onChange={(e) => setNewElevation(parseFloat(e.target.value) || 0)}
                    required
                    placeholder="+4.00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-cyan-300"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Storey Height (m)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.5"
                    value={newHeight}
                    onChange={(e) => setNewHeight(parseFloat(e.target.value) || 3.2)}
                    required
                    placeholder="3.20"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-300"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-xs font-bold rounded-lg shadow"
                >
                  Add Level
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/60">
          <span className="text-[11px] text-slate-400">
            Active 2D drawings are isolated per level. 3D view renders all levels accumulated.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
