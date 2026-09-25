import { BIMElement, BOQSummaryItem, UnitRates } from '../types/bim';
import { distance, polygonArea, polygonPerimeter } from './geometry';

export const DEFAULT_UNIT_RATES: UnitRates = {
  concreteC25: 120,    // $/m3
  concreteC30: 135,    // $/m3
  concreteC35: 150,    // $/m3
  formwork: 28,        // $/m2
  rebar: 1100,         // $/ton ($1.10 per kg)
  excavation: 15,      // $/m3
  masonryWall: 45,     // $/m2
};

export interface BOQCalculationResult {
  items: BOQSummaryItem[];
  metersPerUnit: number;
  totals: {
    totalConcreteVol: number; // m3
    totalFormworkArea: number; // m2
    totalRebarWeightKg: number; // kg
    totalRebarTons: number;
    totalCost: number;
    countByCategory: Record<string, number>;
  };
}

/**
 * Normalizes dimension attributes (width, depth, length, thickness, height) to real-world meters.
 * If drawing is in millimeters (metersPerUnit < 0.1) and dimension was entered/stored in mm (> 20),
 * converts to meters by multiplying by metersPerUnit.
 */
function normalizeDimensionToMeters(val: number | undefined, defaultVal: number, metersPerUnit: number): number {
  if (val === undefined || isNaN(val)) return defaultVal;
  if (metersPerUnit < 0.1 && val > 20) {
    return val * metersPerUnit;
  }
  // If metersPerUnit is >= 0.1, but dimension was clearly specified in millimeters (> 25)
  if (metersPerUnit >= 0.1 && val > 25) {
    return val / 1000;
  }
  return val;
}

export function calculateBOQ(
  elements: BIMElement[],
  rates: UnitRates = DEFAULT_UNIT_RATES,
  metersPerUnit: number = 1.0
): BOQCalculationResult {
  const items: BOQSummaryItem[] = [];
  const s = metersPerUnit > 0 ? metersPerUnit : 1.0;
  const s2 = s * s;

  // Group elements by category and size/mark
  const footings = elements.filter((e): e is import('../types/bim').FootingElement => e.type === 'footing');
  const columns = elements.filter((e): e is import('../types/bim').ColumnElement => e.type === 'column');
  const beams = elements.filter((e): e is import('../types/bim').BeamElement => e.type === 'beam');
  const walls = elements.filter((e): e is import('../types/bim').WallElement => e.type === 'wall');
  const slabs = elements.filter((e): e is import('../types/bim').SlabElement => e.type === 'slab');

  // 1. Process Footings
  const footingGroups = new Map<string, { count: number; width: number; length: number; depth: number; grade: string; totalVol: number; totalForm: number }>();
  footings.forEach(f => {
    let vol = 0;
    let form = 0;
    let dimStr = '';
    const normDepth = normalizeDimensionToMeters(f.depth, 0.60, s);

    if (f.points && f.points.length >= 3) {
      // Polygon vertices in drawing coordinates -> convert area and perimeter to meters
      const areaM2 = polygonArea(f.points) * s2;
      const perimM = polygonPerimeter(f.points) * s;
      vol = areaM2 * normDepth;
      form = perimM * normDepth;
      dimStr = `Polygon (Area: ${areaM2.toFixed(2)}m² × D: ${normDepth.toFixed(2)}m)`;
    } else {
      const normW = normalizeDimensionToMeters(f.width, 2.0, s);
      const normL = normalizeDimensionToMeters(f.length, 2.0, s);
      vol = normW * normL * normDepth;
      form = 2 * (normW + normL) * normDepth;
      dimStr = `${normW.toFixed(2)}m × ${normL.toFixed(2)}m × ${normDepth.toFixed(2)}m`;
    }

    const key = `${f.mark}_${dimStr}_${f.concreteGrade}`;
    const cur = footingGroups.get(key) || { count: 0, width: normalizeDimensionToMeters(f.width, 2.0, s), length: normalizeDimensionToMeters(f.length, 2.0, s), depth: normDepth, grade: f.concreteGrade, totalVol: 0, totalForm: 0 };
    cur.count += 1;
    cur.totalVol += vol;
    cur.totalForm += form;
    footingGroups.set(key, cur);
  });

  footingGroups.forEach((val, key) => {
    const totalVol = val.totalVol;
    const totalForm = val.totalForm;
    // Structural steel estimation: 95 kg of steel per m3 of concrete for footings (ACI/BS/Eurocode)
    const totalRebar = totalVol * 95;

    const concreteCost = totalVol * rates.concreteC30;
    const formworkCost = totalForm * rates.formwork;
    const rebarCost = (totalRebar / 1000) * rates.rebar;
    const unitCost = concreteCost + formworkCost + rebarCost;

    const parts = key.split('_');
    const mark = parts[0];
    const dim = parts[1];
    items.push({
      id: `boq-f-${key}`,
      category: 'Footing',
      mark: mark,
      description: `Reinforced Concrete Footing (${val.grade})`,
      count: val.count,
      dimensions: dim,
      concreteVol: totalVol,
      formworkArea: totalForm,
      rebarKg: totalRebar,
      unitCost,
      currency: 'USD',
    });
  });

  // 2. Process Columns
  const colGroups = new Map<string, { count: number; width: number; depth: number; height: number; grade: string; totalVol: number; totalForm: number }>();
  columns.forEach(c => {
    let vol = 0;
    let form = 0;
    let dimStr = '';
    const normH = normalizeDimensionToMeters(c.height, 3.0, s);

    if (c.points && c.points.length >= 3) {
      const areaM2 = polygonArea(c.points) * s2;
      const perimM = polygonPerimeter(c.points) * s;
      vol = areaM2 * normH;
      form = perimM * normH;
      dimStr = `Polygon (${areaM2.toFixed(2)}m² × H: ${normH.toFixed(2)}m)`;
    } else {
      const normW = normalizeDimensionToMeters(c.width, 0.40, s);
      const normD = normalizeDimensionToMeters(c.depth, 0.40, s);
      vol = normW * normD * normH;
      form = 2 * (normW + normD) * normH;
      dimStr = `${normW.toFixed(2)}m × ${normD.toFixed(2)}m × ${normH.toFixed(2)}m`;
    }

    const key = `${c.mark}_${dimStr}_${c.concreteGrade}`;
    const cur = colGroups.get(key) || { count: 0, width: normalizeDimensionToMeters(c.width, 0.40, s), depth: normalizeDimensionToMeters(c.depth, 0.40, s), height: normH, grade: c.concreteGrade, totalVol: 0, totalForm: 0 };
    cur.count += 1;
    cur.totalVol += vol;
    cur.totalForm += form;
    colGroups.set(key, cur);
  });

  colGroups.forEach((val, key) => {
    const totalVol = val.totalVol;
    const totalForm = val.totalForm;
    // Structural steel estimation: 175 kg/m3 of concrete for columns (ACI/BS/Eurocode)
    const totalRebar = totalVol * 175;

    const concreteCost = totalVol * rates.concreteC35;
    const formworkCost = totalForm * rates.formwork;
    const rebarCost = (totalRebar / 1000) * rates.rebar;
    const unitCost = concreteCost + formworkCost + rebarCost;

    const parts = key.split('_');
    const mark = parts[0];
    const dim = parts[1];
    items.push({
      id: `boq-c-${key}`,
      category: 'Column',
      mark: mark,
      description: `Cast-in-place Structural Column (${val.grade})`,
      count: val.count,
      dimensions: dim,
      concreteVol: totalVol,
      formworkArea: totalForm,
      rebarKg: totalRebar,
      unitCost,
      currency: 'USD',
    });
  });

  // 3. Process Beams
  const beamGroups = new Map<string, { count: number; totalLen: number; width: number; depth: number; grade: string }>();
  beams.forEach(b => {
    // Coordinate length in meters = raw length in drawing units * metersPerUnit
    const lenM = distance(b.startPoint, b.endPoint) * s;
    const normW = normalizeDimensionToMeters(b.width, 0.30, s);
    const normD = normalizeDimensionToMeters(b.depth, 0.50, s);

    const key = `${b.mark}_${normW.toFixed(2)}x${normD.toFixed(2)}`;
    const cur = beamGroups.get(key) || { count: 0, totalLen: 0, width: normW, depth: normD, grade: b.concreteGrade };
    cur.count += 1;
    cur.totalLen += lenM;
    beamGroups.set(key, cur);
  });

  beamGroups.forEach((val, key) => {
    const totalVol = val.totalLen * val.width * val.depth;
    const totalForm = val.totalLen * (2 * val.depth + val.width);
    // Structural steel estimation: 140 kg/m3 of concrete for beams (ACI/BS/Eurocode)
    const totalRebar = totalVol * 140;

    const concreteCost = totalVol * rates.concreteC30;
    const formworkCost = totalForm * rates.formwork;
    const rebarCost = (totalRebar / 1000) * rates.rebar;
    const unitCost = concreteCost + formworkCost + rebarCost;

    const mark = key.split('_')[0];
    items.push({
      id: `boq-b-${key}`,
      category: 'Beam',
      mark: mark,
      description: `Cast-in-place Reinforced Concrete Beam (${val.grade})`,
      count: val.count,
      dimensions: `${val.width.toFixed(2)}m × ${val.depth.toFixed(2)}m (Total ${val.totalLen.toFixed(2)}m)`,
      concreteVol: totalVol,
      formworkArea: totalForm,
      rebarKg: totalRebar,
      unitCost,
      currency: 'USD',
    });
  });

  // 4. Process Walls
  const wallGroups = new Map<string, { count: number; totalLen: number; thickness: number; height: number; material: string; openingsArea: number; openingsCount: number }>();
  let totalDoorsCount = 0;
  let totalWindowsCount = 0;

  walls.forEach(w => {
    // Coordinate length in meters = raw length in drawing units * metersPerUnit
    const lenM = distance(w.startPoint, w.endPoint) * s;
    const normThk = normalizeDimensionToMeters(w.thickness, 0.20, s);
    const normH = normalizeDimensionToMeters(w.height, 3.0, s);

    // Calculate openings deduction
    let wallOpeningsArea = 0;
    if (w.openings && w.openings.length > 0) {
      w.openings.forEach((op) => {
        wallOpeningsArea += (op.width || 0.9) * (op.height || 2.1);
        if (op.type === 'door') totalDoorsCount++;
        if (op.type === 'window') totalWindowsCount++;
      });
    }

    const key = `${w.mark}_${normThk.toFixed(2)}x${normH.toFixed(2)}`;
    const cur = wallGroups.get(key) || { count: 0, totalLen: 0, thickness: normThk, height: normH, material: w.material || w.concreteGrade || 'C30/37', openingsArea: 0, openingsCount: 0 };
    cur.count += 1;
    cur.totalLen += lenM;
    cur.openingsArea += wallOpeningsArea;
    cur.openingsCount += (w.openings ? w.openings.length : 0);
    wallGroups.set(key, cur);
  });

  wallGroups.forEach((val, key) => {
    const grossArea = val.totalLen * val.height;
    const netArea = Math.max(0, grossArea - val.openingsArea);
    const totalVol = netArea * val.thickness;
    const totalForm = 2 * netArea;
    // Structural steel estimation: 85 kg/m3 of concrete for walls (ACI/BS/Eurocode)
    const totalRebar = totalVol * 85;

    const concreteCost = totalVol * rates.concreteC25;
    const formworkCost = totalForm * rates.formwork;
    const rebarCost = (totalRebar / 1000) * rates.rebar;
    const unitCost = concreteCost + formworkCost + rebarCost;

    const mark = key.split('_')[0];
    const deductionNote = val.openingsArea > 0 ? ` [Net after ${val.openingsArea.toFixed(1)}m² openings deducted]` : '';
    items.push({
      id: `boq-w-${key}`,
      category: 'Wall',
      mark: mark,
      description: `Structural RC / Masonry Wall (${val.material})${deductionNote}`,
      count: val.count,
      dimensions: `${val.thickness.toFixed(2)}m thk × ${val.height.toFixed(2)}m h (Total ${val.totalLen.toFixed(2)}m)`,
      concreteVol: totalVol,
      formworkArea: totalForm,
      rebarKg: totalRebar,
      unitCost,
      currency: 'USD',
    });
  });

  // 5. Process Slabs
  slabs.forEach(sElem => {
    // Polygon area and perimeter converted from drawing units to meters
    const grossAreaM2 = polygonArea(sElem.points) * s2;
    const perimM = polygonPerimeter(sElem.points) * s;
    const normThk = normalizeDimensionToMeters(sElem.thickness, 0.20, s);

    // Calculate slab openings deduction (stair voids, shafts)
    let openingsAreaM2 = 0;
    if (sElem.openings && sElem.openings.length > 0) {
      sElem.openings.forEach((op) => {
        if (op.points && op.points.length >= 3) {
          openingsAreaM2 += polygonArea(op.points) * s2;
        } else if (op.width && op.length) {
          openingsAreaM2 += op.width * op.length;
        }
      });
    }

    const netAreaM2 = Math.max(0, grossAreaM2 - openingsAreaM2);
    const vol = netAreaM2 * normThk;
    const formwork = netAreaM2 + perimM * normThk; // soffit + perimeter edge form
    // Structural steel estimation: 110 kg/m3 of concrete for slabs (ACI/BS/Eurocode)
    const rebar = vol * 110;

    const concreteCost = vol * rates.concreteC30;
    const formworkCost = formwork * rates.formwork;
    const rebarCost = (rebar / 1000) * rates.rebar;
    const unitCost = concreteCost + formworkCost + rebarCost;

    const openingNote = openingsAreaM2 > 0 ? ` (Net area after ${openingsAreaM2.toFixed(1)}m² stair/void deduction)` : '';
    items.push({
      id: `boq-s-${sElem.id}`,
      category: 'Slab',
      mark: sElem.mark,
      description: `Reinforced Concrete Floor Slab (${sElem.concreteGrade})${openingNote}`,
      count: 1,
      dimensions: `${netAreaM2.toFixed(1)} m² net × ${normThk.toFixed(2)}m thk`,
      concreteVol: vol,
      formworkArea: formwork,
      rebarKg: rebar,
      unitCost,
      currency: 'USD',
    });
  });

  // Calculate overall totals
  let totalConcreteVol = 0;
  let totalFormworkArea = 0;
  let totalRebarWeightKg = 0;
  let totalCost = 0;
  const countByCategory: Record<string, number> = {
    Footing: footings.length,
    Column: columns.length,
    Beam: beams.length,
    Wall: walls.length,
    Slab: slabs.length,
  };

  items.forEach(item => {
    totalConcreteVol += item.concreteVol;
    totalFormworkArea += item.formworkArea;
    totalRebarWeightKg += item.rebarKg;
    totalCost += item.unitCost;
  });

  return {
    items,
    metersPerUnit: s,
    totals: {
      totalConcreteVol,
      totalFormworkArea,
      totalRebarWeightKg,
      totalRebarTons: totalRebarWeightKg / 1000,
      totalCost,
      countByCategory,
    },
  };
}

export function exportBOQToCSV(items: BOQSummaryItem[]): void {
  const headers = ['Category', 'Mark', 'Description', 'Quantity', 'Dimensions', 'Concrete (m³)', 'Formwork (m²)', 'Rebar (kg)', 'Estimated Cost ($)'];
  const rows = items.map(it => [
    `"${it.category}"`,
    `"${it.mark}"`,
    `"${it.description}"`,
    it.count,
    `"${it.dimensions}"`,
    it.concreteVol.toFixed(2),
    it.formworkArea.toFixed(2),
    it.rebarKg.toFixed(1),
    it.unitCost.toFixed(2),
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `QSBIM_Takeoff_BOQ_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
