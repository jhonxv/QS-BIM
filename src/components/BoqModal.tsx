import React, { useState } from 'react';
import { UnitRates, BOQSummaryItem, ScaleCalibration } from '../types/bim';
import { BOQCalculationResult, exportBOQToCSV } from '../utils/boqEngine';
import { FileSpreadsheet, Download, X, Layers, DollarSign, RefreshCw, HelpCircle, Scale, ChevronDown, ChevronUp, Check } from 'lucide-react';

interface BoqModalProps {
  isOpen: boolean;
  boqResult: BOQCalculationResult;
  unitRates: UnitRates;
  onUpdateRates: (rates: UnitRates) => void;
  onClose: () => void;
  scaleCalibration?: ScaleCalibration;
  onUpdateScaleRatio?: (ratio: number) => void;
}

export const BoqModal: React.FC<BoqModalProps> = ({
  isOpen,
  boqResult,
  unitRates,
  onUpdateRates,
  onClose,
  scaleCalibration,
  onUpdateScaleRatio,
}) => {
  const [selectedTab, setSelectedTab] = useState<'all' | 'Footing' | 'Column' | 'Beam' | 'Wall' | 'Slab'>('all');
  const [showRatesEditor, setShowRatesEditor] = useState<boolean>(false);
  const [showFormulasGuide, setShowFormulasGuide] = useState<boolean>(false);
  const [ratesForm, setRatesForm] = useState<UnitRates>(unitRates);

  if (!isOpen) return null;

  const metersPerUnit = scaleCalibration?.metersPerUnit || boqResult.metersPerUnit || 1.0;

  const filteredItems: BOQSummaryItem[] = selectedTab === 'all'
    ? boqResult.items
    : boqResult.items.filter((it: BOQSummaryItem) => it.category === selectedTab);

  const handleSaveRates = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateRates(ratesForm);
    setShowRatesEditor(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl bg-[#0b101b] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Structural Bill of Quantities (BOQ) & Takeoff
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                  BIM Standard ISO 19650
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Automated concrete volume, formwork area, rebar estimation, and cost summary in Metric (m, m², m³)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFormulasGuide(!showFormulasGuide)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition flex items-center gap-1.5 ${
                showFormulasGuide
                  ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="View formulas used for steel reinforcement & concrete volumes"
            >
              <HelpCircle className="w-4 h-4 text-cyan-400" />
              Steel Formulas & Guide
            </button>
            <button
              onClick={() => exportBOQToCSV(boqResult.items)}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 transition"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Active Scale & Unit Calibration Banner */}
        <div className="px-6 py-2.5 bg-slate-900/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Scale className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Drawing Scale: <strong className="font-mono text-emerald-300">1 unit = {metersPerUnit.toFixed(4)}m</strong>
              {metersPerUnit <= 0.0015 ? ' (Millimeters: mm → m)' : metersPerUnit <= 0.015 ? ' (Centimeters: cm → m)' : ' (Meters: 1:1)'}
            </span>
            <span className="text-slate-500 hidden sm:inline">•</span>
            <span className="text-slate-400 hidden sm:inline">
              Drawing measurements in mm are converted directly to meters in BOQ calculations.
            </span>
          </div>

          {onUpdateScaleRatio && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Scale Presets:</span>
              <button
                onClick={() => onUpdateScaleRatio(0.001)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition ${
                  Math.abs(metersPerUnit - 0.001) < 0.0001
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
                title="1 drawing unit = 1 millimeter (0.001m)"
              >
                mm (1:1000)
              </button>
              <button
                onClick={() => onUpdateScaleRatio(0.01)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition ${
                  Math.abs(metersPerUnit - 0.01) < 0.001
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
                title="1 drawing unit = 1 centimeter (0.01m)"
              >
                cm (1:100)
              </button>
              <button
                onClick={() => onUpdateScaleRatio(1.0)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition ${
                  Math.abs(metersPerUnit - 1.0) < 0.01
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
                title="1 drawing unit = 1 meter (1.0m)"
              >
                m (1:1)
              </button>
            </div>
          )}
        </div>

        {/* Steel Reinforcement Formulas & Methodology Explainer (Toggleable) */}
        {showFormulasGuide && (
          <div className="p-5 bg-slate-950 border-b border-cyan-800/40 text-xs text-slate-300 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="font-bold text-cyan-300 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-cyan-400" />
                How Reinforcement Steel is Calculated from Dimensions
              </div>
              <button
                onClick={() => setShowFormulasGuide(false)}
                className="text-[11px] text-slate-400 hover:text-white"
              >
                Dismiss Guide
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-white">1. Core Steel Weight Formula</div>
                <p className="text-[11px] text-slate-400">
                  Because drawings specify outer member dimensions without individual rebar schedules, the program employs the industry-standard empirical density method (derived from structural engineering codes <strong>ACI 318 / BS 8110 / Eurocode 2</strong>):
                </p>
                <div className="p-2 bg-slate-950 rounded border border-cyan-900/50 font-mono text-cyan-300 text-[11px]">
                  Steel Weight (kg) = Concrete Volume (m³) × Steel Ratio (kg/m³)
                </div>
                <div className="p-2 bg-slate-950 rounded border border-cyan-900/50 font-mono text-cyan-300 text-[11px]">
                  Total Tons = Steel Weight (kg) / 1000
                </div>
              </div>

              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-white">2. Structural Member Ratios Used</div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-orange-400 font-semibold">Footings:</span>
                    <span className="font-mono text-white font-bold">95 kg/m³</span>
                    <span className="text-slate-400">(bottom & top mat mesh)</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-red-400 font-semibold">Columns:</span>
                    <span className="font-mono text-white font-bold">175 kg/m³</span>
                    <span className="text-slate-400">(longitudinal bars + stirrup ties)</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-indigo-400 font-semibold">Beams:</span>
                    <span className="font-mono text-white font-bold">140 kg/m³</span>
                    <span className="text-slate-400">(top/bottom bars + shear links)</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-emerald-400 font-semibold">Slabs:</span>
                    <span className="font-mono text-white font-bold">110 kg/m³</span>
                    <span className="text-slate-400">(BRC mesh & rebar mats)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-semibold">Walls:</span>
                    <span className="font-mono text-white font-bold">85 kg/m³</span>
                    <span className="text-slate-400">(double curtain vertical/horiz)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-cyan-950/20 border border-cyan-800/30 rounded-xl space-y-1 text-[11px]">
              <span className="font-bold text-cyan-300">Practical Column Example:</span>
              <p className="text-slate-300">
                A column with dimensions <strong>400 mm × 400 mm</strong> (0.40m × 0.40m) and height <strong>3.0 m</strong>:
                <br />
                • Concrete Volume = 0.40m × 0.40m × 3.00m = <strong className="text-white">0.48 m³</strong>
                <br />
                • Reinforcement Steel = 0.48 m³ × 175 kg/m³ = <strong className="text-cyan-400">84.0 kg</strong> (0.084 tons)
                <br />
                • Formwork Area = 2 × (0.40 + 0.40) × 3.00 = <strong className="text-white">4.80 m²</strong>
              </p>
            </div>
          </div>
        )}

        {/* Quick KPI Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 bg-slate-950/60 border-b border-slate-800">
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Concrete Volume</div>
            <div className="text-2xl font-extrabold text-white font-mono mt-1">
              {boqResult.totals.totalConcreteVol.toFixed(2)}{' '}
              <span className="text-sm font-normal text-slate-400">m³</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Formwork Area</div>
            <div className="text-2xl font-extrabold text-white font-mono mt-1">
              {boqResult.totals.totalFormworkArea.toFixed(2)}{' '}
              <span className="text-sm font-normal text-slate-400">m²</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Reinforcing Steel</div>
            <div className="text-2xl font-extrabold text-cyan-400 font-mono mt-1">
              {boqResult.totals.totalRebarTons.toFixed(2)}{' '}
              <span className="text-sm font-normal text-slate-400">tons ({boqResult.totals.totalRebarWeightKg.toFixed(0)} kg)</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-800/50">
            <div className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider flex items-center justify-between">
              <span>Estimated Cost</span>
              <button
                onClick={() => setShowRatesEditor(!showRatesEditor)}
                className="text-[10px] text-emerald-300 underline hover:text-white"
              >
                Edit Rates
              </button>
            </div>
            <div className="text-2xl font-extrabold text-emerald-400 font-mono mt-1">
              ${boqResult.totals.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Rates Editor (Expandable) */}
        {showRatesEditor && (
          <form onSubmit={handleSaveRates} className="p-4 bg-slate-900/90 border-b border-slate-800 text-xs space-y-3">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Customize Unit Cost Rates for Takeoff
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Concrete C30 ($/m³)</label>
                <input
                  type="number"
                  value={ratesForm.concreteC30}
                  onChange={(e) => setRatesForm({ ...ratesForm, concreteC30: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Formwork ($/m²)</label>
                <input
                  type="number"
                  value={ratesForm.formwork}
                  onChange={(e) => setRatesForm({ ...ratesForm, formwork: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Rebar ($/ton)</label>
                <input
                  type="number"
                  value={ratesForm.rebar}
                  onChange={(e) => setRatesForm({ ...ratesForm, rebar: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-white font-mono"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded transition"
                >
                  Apply Rates
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Category Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 bg-slate-950/40 border-b border-slate-800 overflow-x-auto">
          {(['all', 'Footing', 'Column', 'Beam', 'Wall', 'Slab'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 ${
                selectedTab === tab
                  ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === 'all' ? 'All Items' : `${tab}s`} ({tab === 'all' ? boqResult.items.length : boqResult.totals.countByCategory[tab] || 0})
            </button>
          ))}
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto p-6">
          {filteredItems.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
              No structural elements drawn in this category yet.
              <p className="text-xs text-slate-600 mt-1">Draw footings, columns, beams, walls, or slabs to view instant takeoffs.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-3">Item</th>
                  <th className="py-3 px-3">Mark</th>
                  <th className="py-3 px-3">Description & Dimensions</th>
                  <th className="py-3 px-3 text-center">Qty</th>
                  <th className="py-3 px-3 text-right">Concrete (m³)</th>
                  <th className="py-3 px-3 text-right">Formwork (m²)</th>
                  <th className="py-3 px-3 text-right">Rebar (kg)</th>
                  <th className="py-3 px-3 text-right">Est. Cost ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-900/50 transition">
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        item.category === 'Footing' ? 'bg-orange-500/20 text-orange-400' :
                        item.category === 'Column' ? 'bg-red-500/20 text-red-400' :
                        item.category === 'Beam' ? 'bg-indigo-500/20 text-indigo-400' :
                        item.category === 'Wall' ? 'bg-slate-500/20 text-slate-300' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {item.category}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-white">{item.mark}</td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-200">{item.description}</div>
                      <div className="text-[11px] font-mono text-slate-400">{item.dimensions}</div>
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-semibold text-slate-300">{item.count}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-200">{item.concreteVol.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-200">{item.formworkArea.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-mono text-cyan-400">{item.rebarKg.toFixed(1)}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                      ${item.unitCost.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Total Takeoff Items: <span className="text-white font-mono font-bold">{boqResult.items.length}</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition"
          >
            Close BOQ
          </button>
        </div>
      </div>
    </div>
  );
};
