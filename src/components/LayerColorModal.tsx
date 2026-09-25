import React from 'react';
import { ColorSettings } from '../types/bim';
import { Palette, RotateCcw, X } from 'lucide-react';

interface LayerColorModalProps {
  isOpen: boolean;
  colors: ColorSettings;
  onUpdateColors: (colors: ColorSettings) => void;
  onClose: () => void;
}

export const LayerColorModal: React.FC<LayerColorModalProps> = ({
  isOpen,
  colors,
  onUpdateColors,
  onClose,
}) => {
  if (!isOpen) return null;

  const defaultColors: ColorSettings = {
    dxfLines: '#38bdf8',
    footing: '#ea580c',
    column: '#dc2626',
    beam: '#4f46e5',
    wall: '#94a3b8',
    slab: '#10b981',
    annotation: '#fbbf24',
    snapMarker: '#22c55e',
  };

  const handleColorChange = (key: keyof ColorSettings, val: string) => {
    onUpdateColors({ ...colors, [key]: val });
  };

  const colorItems: { key: keyof ColorSettings; label: string; description: string }[] = [
    { key: 'dxfLines', label: 'DXF Entities & Grids', description: 'Underlay CAD lines, grids, circles' },
    { key: 'footing', label: 'Footings', description: 'Foundation pad outlines and markers' },
    { key: 'column', label: 'Columns', description: 'Vertical structural columns' },
    { key: 'beam', label: 'Beams', description: 'Horizontal structural framing beams' },
    { key: 'wall', label: 'Walls', description: 'RC shear and masonry walls' },
    { key: 'slab', label: 'Slabs / Areas', description: 'Floor slabs and area takeoffs' },
    { key: 'annotation', label: 'Dimensions & Annotations', description: 'Measurement lines and text' },
    { key: 'snapMarker', label: 'Snap Indicator', description: 'Corner, center, and vertex cursor' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">BIM & DXF Color Settings</h3>
              <p className="text-xs text-slate-400">Customize display colors for drawing elements</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          {colorItems.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition"
            >
              <div>
                <div className="text-xs font-semibold text-slate-200">{item.label}</div>
                <div className="text-[11px] text-slate-400">{item.description}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400">{colors[item.key]}</span>
                <input
                  type="color"
                  value={colors[item.key]}
                  onChange={(e) => handleColorChange(item.key, e.target.value)}
                  className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={() => onUpdateColors(defaultColors)}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/30 transition"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};
