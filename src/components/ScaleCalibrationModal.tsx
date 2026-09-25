import React, { useState } from 'react';
import { ScaleCalibration } from '../types/bim';
import { Ruler, Check, X, Info } from 'lucide-react';

interface ScaleCalibrationModalProps {
  calibration: ScaleCalibration;
  onConfirm: (realDistanceMeters: number) => void;
  onCancel: () => void;
}

export const ScaleCalibrationModal: React.FC<ScaleCalibrationModalProps> = ({
  calibration,
  onConfirm,
  onCancel,
}) => {
  const [distanceMeters, setDistanceMeters] = useState<number>(6.0);

  if (!calibration.active || calibration.step !== 'input') return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (distanceMeters > 0) {
      onConfirm(distanceMeters);
    }
  };

  const presets = [1.0, 3.0, 5.0, 6.0, 8.0, 10.0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#0f172a] border border-cyan-800/50 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Ruler className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Calibrate Drawing Scale</h3>
              <p className="text-xs text-slate-400">Set real-world distance for accurate Quantity Takeoff</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-cyan-950/30 border border-cyan-900/40 text-xs text-cyan-200">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              You selected two points with an on-screen distance of{' '}
              <span className="font-mono font-bold text-white">{calibration.pixelDistance.toFixed(2)}</span> drawing units.
              Enter the known real-world dimension between these two points.
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Real-world Distance in Meters
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                value={distanceMeters}
                onChange={(e) => setDistanceMeters(parseFloat(e.target.value) || 0)}
                className="w-full pl-4 pr-16 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-lg text-white font-mono font-semibold focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              />
              <span className="absolute right-4 top-3 text-sm font-semibold text-cyan-400 font-mono">meters</span>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-slate-400 mb-2">
              Drawing Unit Quick Preset:
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <button
                type="button"
                onClick={() => {
                  const px = calibration.pixelDistance || 1;
                  setDistanceMeters(Math.max(0.001, parseFloat((px * 0.001).toFixed(4))));
                }}
                className="py-2 px-2 rounded-lg border border-cyan-800 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-200 text-xs font-semibold flex flex-col items-center transition"
                title="1 unit = 1 mm (0.001m) • Drawing is in Millimeters"
              >
                <span className="font-bold">Millimeters (mm)</span>
                <span className="text-[10px] text-cyan-400 font-mono">1u = 0.001m</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const px = calibration.pixelDistance || 1;
                  setDistanceMeters(Math.max(0.01, parseFloat((px * 0.01).toFixed(3))));
                }}
                className="py-2 px-2 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex flex-col items-center transition"
                title="1 unit = 1 cm (0.01m) • Drawing is in Centimeters"
              >
                <span className="font-bold">Centimeters (cm)</span>
                <span className="text-[10px] text-slate-400 font-mono">1u = 0.01m</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const px = calibration.pixelDistance || 1;
                  setDistanceMeters(Math.max(0.1, parseFloat(px.toFixed(2))));
                }}
                className="py-2 px-2 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex flex-col items-center transition"
                title="1 unit = 1 meter (1.0m) • Drawing is in Meters"
              >
                <span className="font-bold">Meters (m)</span>
                <span className="text-[10px] text-slate-400 font-mono">1u = 1.00m</span>
              </button>
            </div>

            <div className="text-[11px] font-medium text-slate-400 mb-2">Standard Grid Distance Presets:</div>
            <div className="grid grid-cols-3 gap-2">
              {presets.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setDistanceMeters(p)}
                  className={`py-1.5 px-2 rounded border text-xs font-mono transition ${
                    distanceMeters === p
                      ? 'bg-cyan-600/30 border-cyan-400 text-cyan-200 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {p.toFixed(1)} m
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-[11px] text-emerald-200">
            <div className="font-semibold text-emerald-300 mb-0.5">Scale Conversion Applied to BOQ:</div>
            <div>
              1 unit = <span className="font-mono font-bold text-white">{(distanceMeters / (calibration.pixelDistance || 1)).toFixed(5)} meters</span>
              . If drawing measurements are in mm, BOQ takeoff will convert all lengths, areas, and concrete volumes into standard meters (m, m², m³).
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-800">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              Skip Calibration (Default 1:1)
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg shadow-lg shadow-cyan-600/30 flex items-center gap-1.5 transition"
            >
              <Check className="w-4 h-4" />
              Apply Scale Calibration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
