import { strFromU8, Unzip, UnzipInflate } from "fflate";
import type { Env } from "./env";
import { getSetting } from "./db";
import { send } from "./telegram";
import { SALES_SCHEMA_VERSION, SALES_PERIOD_VERSION, salesKey, quarterName, quarterOrder, quarterForMonth, latestQuarter, periodColumns, readPeriodSeries, mergeQuarterHistory, mergeProductHistory, recoverShiftedClient, recoverShiftedDelegate, recoverMonthlySales } from './salesPeriods';

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;
type QuarterPoint = {
  quarter: string;
  total: number;
  platform: number;
  push: number;
  directPct: number | null;
  platformPct: number | null;
  projected?: number;
  pharmacies200?: number;
  openingsCount?: number;
  openingsSales?: number;
  openingsAverage?: number;
  target200At85?: number;
  target200At100?: number;
};
export interface DashboardPayload {
  metadata: {
    sourceName: string;
    sourceDate: string;
    clientCount: number;
    productCount: number;
    recoveryMatchCount: number;
    currentQuarter: string;
    productMonths: string[];
    schemaVersion: number;
  };
  quota: any[];
  cycles: any[];
  delegates: any[];
  clients: any[];
  clientDetails: any[];
  products: any[];
  productDetails: any[];
  clientProducts: { vdl: string; products: any[] }[];
  alerts: any[];
}

const XML_NS_DATE = Date.UTC(1899, 11, 30);
const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
const clean = (v: Cell) => String(v ?? "").trim();
const number = (v: Cell) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const nullableNumber = (v: Cell) => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const excelDate = (v: Cell) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0
    ? new Date(XML_NS_DATE + n * 86400000).toISOString().slice(0, 10)
    : clean(v);
};
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9%]+/g, " ")
    .trim()
    .toLowerCase();
const colNumber = (letters: string) =>
  [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
const colLetters = (n: number) => {
  let s = "";
  while (n) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
};
const colRange = (from: string, to: string) =>
  Array.from({ length: colNumber(to) - colNumber(from) + 1 }, (_, i) =>
    colLetters(colNumber(from) + i),
  );

function selectedUnzip(
  bytes: Uint8Array,
  wanted: Set<string>,
): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  let failure: Error | undefined;
  const unzip = new Unzip((file) => {
    const name = file.name.replace(/^\//, "");
    if (!wanted.has(name)) return;
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (err, data, final) => {
      if (err) {
        failure = err;
        return;
      }
      chunks.push(data);
      size += data.length;
      if (final) {
        const merged = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        out[name] = merged;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.push(bytes, true);
  if (failure) throw failure;
  return out;
}
function workbookParts(bytes: Uint8Array) {
  const core = selectedUnzip(
      bytes,
      new Set([
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/sharedStrings.xml",
      ]),
    ),
    workbook = strFromU8(core["xl/workbook.xml"] || new Uint8Array()),
    rels = strFromU8(core["xl/_rels/workbook.xml.rels"] || new Uint8Array());
  if (!workbook || !rels)
    throw new Error("El archivo no es un libro XLSX válido.");
  const paths: Record<string, string> = {};
  for (const m of workbook.matchAll(
    /<(?:\w+:)?sheet\b[^>]*name="([^"]+)"[^>]*(?:\w+:)?id="([^"]+)"[^>]*\/?\s*>/g,
  )) {
    const rel = rels.match(
      new RegExp(
        `<Relationship\\b[^>]*Id="${m[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*Target="([^"]+)"`,
      ),
    );
    if (rel) {
      let path = rel[1].replace(/^\//, "");
      if (!path.startsWith("xl/")) path = "xl/" + path.replace(/^\.\//, "");
      paths[decode(m[1])] = path;
    }
  }
  const required = [
    "Cuadro Mando",
    "Cuota",
    "Ciclos Cerrados",
    "Presentaciones por Farmacia",
    "Recuperaciones",
    "Cliente-Presentacion",
  ];
  for (const name of required)
    if (!paths[name])
      throw new Error(`El Excel no contiene la hoja obligatoria “${name}”.`);
  const files = selectedUnzip(
      bytes,
      new Set([...required.map((name) => paths[name]), "xl/sharedStrings.xml"]),
    ),
    sharedXml = strFromU8(
      files["xl/sharedStrings.xml"] ||
        core["xl/sharedStrings.xml"] ||
        new Uint8Array(),
    ),
    shared = [
      ...sharedXml.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g),
    ].map((m) =>
      decode(
        [...m[1].matchAll(/<(?:\w+:)?t(?: [^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)]
          .map((x) => x[1])
          .join(""),
      ),
    );
  return { paths, files, shared };
}
function parseCells(body: string, shared: string[]): Row {
  const item: Row = {},
    set = (attrs: string, content = "") => {
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!ref) return;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      let raw =
        content.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1] ?? "";
      if (type === "inlineStr")
        raw = [
          ...content.matchAll(
            /<(?:\w+:)?t(?: [^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g,
          ),
        ]
          .map((x) => x[1])
          .join("");
      let value: Cell = decode(raw);
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "b") value = raw === "1";
      else if (type !== "inlineStr" && raw !== "" && !Number.isNaN(Number(raw)))
        value = Number(raw);
      item[ref] = value;
    };
  for (const c of body.matchAll(
    /<(?:\w+:)?c\b(?![^>]*\/>)([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g,
  ))
    set(c[1], c[2]);
  for (const c of body.matchAll(/<(?:\w+:)?c\b([^>]*)\/>/g)) set(c[1]);
  return item;
}
function rows(
  xml: string,
  shared: string[],
  min: number,
  max: number,
): Map<number, Row> {
  const result = new Map<number, Row>();
  for (const m of xml.matchAll(
    /<(?:\w+:)?row\b(?![^>]*\/>)\s*[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g,
  )) {
    const n = Number(m[1]);
    if (n >= min && n <= max) result.set(n, parseCells(m[2], shared));
  }
  return result;
}
function headerMap(row: Row) {
  const map: Record<string, string> = {};
  for (const [letter, value] of Object.entries(row))
    if (value !== null && value !== "") map[normalize(String(value))] = letter;
  return map;
}
function fromHeader(
  row: Row,
  headers: Record<string, string>,
  ...names: string[]
) {
  for (const name of names) {
    const letter = headers[normalize(name)];
    if (letter) return row[letter] ?? null;
  }
  return null;
}
function priority(classification: string, current: number, previous: number) {
  const top = /premium|vip|plus|cliente a/i.test(classification);
  if (current < previous && top) return "RECUPERAR";
  if (current < previous) return "VIGILAR";
  if (/no cliente/i.test(classification) && current <= 0) return "ACTIVAR";
  return "CONSOLIDAR";
}
function quarterLabel(v: Cell, index: number) {
  const m = clean(v).match(/Q([1-4])\s*(\d{2})\s*-\s*(\d{2})/i);
  return m ? `Q${m[1]} ${m[2]}-${m[3]}` : `Trimestre ${index + 1}`;
}
function quarterProgress(sourceDate: string) {
  const d = new Date(`${sourceDate}T12:00:00Z`),
    m = d.getUTCMonth() + 1,
    start = m >= 10 ? 10 : m >= 7 ? 7 : m >= 4 ? 4 : 1,
    y = d.getUTCFullYear(),
    a = Date.UTC(y, start - 1, 1),
    b = Date.UTC(start === 10 ? y + 1 : y, start === 10 ? 0 : start + 2, 1);
  return Math.max(0.08, Math.min(1, (d.getTime() - a + 86400000) / (b - a)));
}
export function purchasePattern(values: number[], progress = 1) {
  if (!values.length) return "Sin datos";
  const current = values.at(-1)! / progress,
    previous = values.at(-2) ?? 0,
    before = values.at(-3) ?? 0;
  if (previous <= 0 && current > 0) return "Apertura";
  if (previous > 0 && current <= 0) return "Compra detenida";
  if (before > 0 && previous > before * 1.05 && current > previous * 1.05)
    return "Crecimiento sostenido";
  if (before > 0 && previous < before * 0.95 && current < previous * 0.95)
    return "Decrecimiento sostenido";
  if (previous && current > previous * 1.1) return "Crecimiento";
  if (previous && current < previous * 0.9) return "Decrecimiento";
  return "Estable";
}
function quarterSeries(
  row: Row,
  labels: string[],
  totalCols: string[],
  platformCols: string[],
  pushCols: string[],
  progress: number,
): QuarterPoint[] {
  return labels.map((quarter, i) => {
    const total = number(row[totalCols[i]]),
      platform = number(row[platformCols[i]]),
      push = number(row[pushCols[i]]);
    return {
      quarter,
      total,
      platform,
      push,
      directPct: total ? push / total : null,
      platformPct: total ? platform / total : null,
      ...(i === labels.length - 1 && progress < 0.98
        ? { projected: total / progress }
        : {}),
    };
  });
}
const shiftMonth = (value: string, delta: number) => {
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(4, 6)),
    date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return String(date.getUTCFullYear() * 100 + date.getUTCMonth() + 1);
};
export function productTrend(
  months: Record<string, number>,
  latestMonth: string,
) {
  const ym = Number(latestMonth),
    year = Math.floor(ym / 100),
    month = ym % 100,
    currentStart = month >= 10 ? 10 : month >= 7 ? 7 : month >= 4 ? 4 : 1,
    currentKeys = Array.from({ length: month - currentStart + 1 }, (_, i) =>
      String(year * 100 + currentStart + i),
    ),
    previousKeys = Array.from({ length: 3 }, (_, i) =>
      shiftMonth(String(year * 100 + currentStart), -3 + i),
    ),
    currentUnits = currentKeys.reduce((n, k) => n + number(months[k]), 0),
    previousUnits = previousKeys.reduce((n, k) => n + number(months[k]), 0),
    projectedUnits = currentUnits,
    previousHistory = Object.entries(months).some(
      ([key, value]) => key < currentKeys[0] && number(value) > 0,
    );
  let monthsWithoutPurchase = 0;
  const observedMonths = Object.keys(months)
      .filter((key) => /^\d{6}$/.test(key) && key <= latestMonth)
      .sort(),
    firstObserved = observedMonths[0] || latestMonth;
  for (let i = 0; i < 60; i++) {
    const key = shiftMonth(latestMonth, -i);
    if (key < firstObserved || number(months[key]) > 0) break;
    monthsWithoutPurchase++;
  }
  const lastPurchaseMonth =
      Object.keys(months)
        .filter((key) => key <= latestMonth && number(months[key]) > 0)
        .sort()
        .at(-1) || "",
    changePct = previousUnits ? currentUnits / previousUnits - 1 : null,
    firstCurrentPurchase = currentKeys.find((key) => number(months[key]) > 0) || "",
    previousPurchase = Object.keys(months)
      .filter((key) => key < (firstCurrentPurchase || currentKeys[0]) && number(months[key]) > 0)
      .sort()
      .at(-1) || "",
    monthIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(4, 6)),
    recoveryGap = firstCurrentPurchase && previousPurchase
      ? monthIndex(firstCurrentPurchase) - monthIndex(previousPurchase) - 1
      : 0,
    recovered = currentUnits > 0 && recoveryGap >= 5,
    allPreviousQuartersEmpty = !previousHistory,
    quarterSeries = (() => {
      const keys = Object.keys(months).filter((key) => /^\d{6}$/.test(key) && key <= latestMonth).sort();
      const groups = new Map<string, number>();
      for (const key of keys) {
        const y = Number(key.slice(0, 4)), m = Number(key.slice(4, 6));
        const fiscalQuarter = m >= 10 ? 3 : m >= 7 ? 2 : m >= 4 ? 1 : 4;
        const startYear = fiscalQuarter === 4 ? y - 1 : y;
        const label = `Q${fiscalQuarter} ${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
        groups.set(label, (groups.get(label) || 0) + number(months[key]));
      }
      return [...groups].map(([quarter, units]) => ({ quarter, units }));
    })();
  const status =
    recovered
      ? "Molécula recuperada"
      : monthsWithoutPurchase >= 5 && previousHistory
      ? "Molécula perdida"
      : allPreviousQuartersEmpty && currentUnits > 0
        ? "Nueva compra"
        : changePct !== null && changePct > 0.1
          ? "Aumento de compra"
          : changePct !== null && changePct < -0.1
            ? "Descenso de compra"
            : "Compra estable";
  return {
    status,
    currentUnits,
    previousUnits,
    projectedUnits,
    currentAvg: currentUnits / Math.max(1, currentKeys.length),
    previousAvg: previousUnits / 3,
    changePct,
    monthsWithoutPurchase,
    lastPurchaseMonth,
    currentMonths: currentKeys.length,
    recoveryGap,
    quarterSeries,
  };
}
export function aggregateMoleculeProducts(items: any[], latestMonth: string) {
  const grouped = new Map<
    string,
    {
      molecule: string;
      months: Record<string, number>;
      presentations: Set<string>;
      codes: Set<string>;
      children: any[];
    }
  >();
  for (const item of items) {
    const molecule =
        clean(item.brand) ||
        clean(item.molecule) ||
        clean(item.presentation) ||
        "Sin molécula",
      key = normalize(molecule);
    let row = grouped.get(key);
    if (!row) {
      row = {
        molecule,
        months: {},
        presentations: new Set(),
        codes: new Set(),
        children: [],
      };
      grouped.set(key, row);
    }
    for (const [month, value] of Object.entries(item.months || {}))
      row.months[month] = (row.months[month] || 0) + number(value as Cell);
    if (item.presentation) row.presentations.add(clean(item.presentation));
    if (item.nationalCode || item.national_code)
      row.codes.add(clean(item.nationalCode || item.national_code));
    row.children.push({
      nationalCode: clean(item.nationalCode || item.national_code),
      molecule: clean(item.presentation) || clean(item.molecule),
      presentation: clean(item.presentation),
      months: item.months || {},
      total: Object.values(item.months || {}).reduce<number>((sum, value) => sum + number(value as Cell), 0),
      ...productTrend(item.months || {}, latestMonth),
    });
  }
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      presentations: [...row.presentations],
      codes: [...row.codes],
      presentationCount: row.presentations.size,
      brand: row.molecule,
      children: row.children.sort((a, b) => b.total - a.total),
      ...productTrend(row.months, latestMonth),
      total: Object.values(row.months).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.projectedUnits - a.projectedUnits);
}
function parseClientProducts(
  xml: string,
  shared: string[],
  productNames: Map<string, { presentation: string; brand: string }>,
  latestMonth: string,
) {
  const grouped = new Map<
    string,
    Map<
      string,
      {
        nationalCode: string;
        presentation: string;
        brand: string;
        months: Record<string, number>;
      }
    >
  >();
  for (const m of xml.matchAll(
    /<(?:\w+:)?row\b(?![^>]*\/>)\s*[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g,
  )) {
    if (Number(m[1]) < 7) continue;
    const row = parseCells(m[2], shared),
      vdl = clean(row.C),
      nationalCode = clean(row.E),
      yearMonth = clean(row.H);
    if (!vdl || !nationalCode || !/^\d{6}$/.test(yearMonth)) continue;
    let byProduct = grouped.get(vdl);
    if (!byProduct) {
      byProduct = new Map();
      grouped.set(vdl, byProduct);
    }
    let item = byProduct.get(nationalCode);
    if (!item) {
      const master = productNames.get(nationalCode);
      item = {
        nationalCode,
        presentation: clean(row.F) || master?.presentation || nationalCode,
        brand: master?.brand || "",
        months: {},
      };
      byProduct.set(nationalCode, item);
    }
    item.months[yearMonth] = (item.months[yearMonth] || 0) + number(row.G);
  }
  return [...grouped].map(([vdl, items]) => ({
    vdl,
    products: [...items.values()]
      .map((item) => ({
        ...item,
        ...productTrend(item.months, latestMonth),
        total: Object.values(item.months).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.projectedUnits - a.projectedUnits),
  }));
}

export function parseSalesDashboard(
  bytes: ArrayBuffer | Uint8Array,
  sourceName: string,
): DashboardPayload {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    book = workbookParts(input),
    sheet = (name: string, min: number, max: number) =>
      rows(strFromU8(book.files[book.paths[name]]), book.shared, min, max),
    main = sheet("Cuadro Mando", 1, 1500),
    headers = headerMap(main.get(10) || {}),
    clients: any[] = [],
    clientDetails: any[] = [],
    alerts: any[] = [];
  for (const h of ["Cod Del", "VDL", "Nombre de la Institución", "Clas. CRM"])
    if (!headers[normalize(h)])
      throw new Error(
        `Ha cambiado el esquema: falta la columna “${h}” en Cuadro Mando.`,
      );
  const sourceDate = excelDate(main.get(1)?.H ?? ""),
    progress = quarterProgress(sourceDate),
    recoveryRows = sheet("Recuperaciones", 6, 1600),
    recoveryHeader = recoveryRows.get(6) || {},
    recovery = new Map<
      string,
      {
        total: number;
        months: Record<string, number>;
        quarters: Record<string, number>;
      }
    >();
  for (const [idx, row] of recoveryRows) {
    if (idx === 6) continue;
    const vdl = clean(row.C);
    if (!vdl) continue;
    const months: Record<string, number> = {},
      quarters: Record<string, number> = {};
    for (const c of colRange("G", "N"))
      months[clean(recoveryHeader[c])] = number(row[c]);
    for (const c of colRange("O", "R"))
      quarters[clean(recoveryHeader[c])] = number(row[c]);
    recovery.set(vdl, { total: number(row.S), months, quarters });
  }
  const headerRow = main.get(10) || {},
    mainGroups = main.get(9) || {},
    monthCols = Object.keys(headerRow).filter(c => Number(headerRow[c]) >= 36526 && Number(headerRow[c]) <= 73050),
    totalPeriods = periodColumns(headerRow, mainGroups, 'VENTA TOTAL'),
    platformPeriods = periodColumns(headerRow, mainGroups, 'V. PLATAFORMA CICLO'),
    pushPeriods = periodColumns(headerRow, mainGroups, 'V. PUSH CICLO'),
    currentQuarter = totalPeriods.find(p=>p.current)?.quarter || latestQuarter(totalPeriods),
    periodProgress = currentQuarter === quarterForMonth(sourceDate) ? progress : 1,
    otcStart = Object.entries(mainGroups).find(([,v])=>salesKey(v)==='seguimiento otc')?.[0],
    otcCols = otcStart ? colRange(otcStart, colLetters(colNumber(totalPeriods[0].column)-1)) : [],
    mainValue = (row:Row,...names:string[]) => fromHeader(row,headers,...names),
    seen = new Set<string>();
  for (let i = 11; i <= 1500; i++) {
    const row = main.get(i) || {},
      vdl = clean(fromHeader(row, headers, "VDL"));
    if (!vdl) continue;
    if (seen.has(vdl))
      throw new Error(`El Excel contiene un VDL duplicado: ${vdl}.`);
    seen.add(vdl);
    const previous = number(row.T),
      current = number(row.U),
      objective = number(mainValue(row,'OBJETIVO VENTA MENSUAL')),
      classification = clean(row.H) || "Sin clasificar",
      quarters = readPeriodSeries(row,totalPeriods,platformPeriods,pushPeriods,periodProgress),
      monthlySales = Object.fromEntries(
        monthCols.map((c) => [
          excelDate(headerRow[c]).slice(0, 7),
          number(row[c]),
        ]),
      ),
      otc = otcCols.map((c) => ({
        name: clean(headerRow[c]),
        quantity: number(row[c]),
        purchased: number(row[c]) > 0,
      })),
      commitment = nullableNumber(mainValue(row,'Compromiso Fact Q')),
      accumulated = nullableNumber(mainValue(row,'Acumulado Q')),
      start = excelDate(mainValue(row,'Inicio acuerdo')),
      end = excelDate(mainValue(row,'Fin acuerdo')),
      condition = clean(mainValue(row,'COND. COMERCIAL')),
      agreementActive = Boolean(condition || commitment || start || end),
      remaining =
        commitment === null
          ? nullableNumber(row.BM)
          : commitment - (accumulated || 0),
      agreement = {
        active: agreementActive,
        condition,
        commitment,
        accumulated,
        remaining,
        start,
        end,
        vigency: clean(mainValue(row,'Vigencia')),
        service: clean(mainValue(row,'SERVICIO')),
        grossAccumulated: nullableNumber(mainValue(row,'Fact Bruta Acum Acdo')),
        averageDiscount: nullableNumber(row.Q),
      },
      recoveryData = recovery.get(vdl) || {
        total: 0,
        months: {},
        quarters: {},
      };
    clientDetails.push({
      vdl,
      monthlySales,
      quarters,
      recovery: recoveryData,
      agreement,
      otc,
      purchasePattern: purchasePattern(
        quarters.map((q) => q.total),
        periodProgress,
      ),
      directPct: quarters.at(-1)?.directPct ?? null,
      forecastGap: number(mainValue(row,'FALTA PREV.')),
    });
    clients.push({
      vdl,
      codDel: clean(row.C),
      delegate: clean(row.D),
      client: clean(row.G),
      classification,
      clientType: clean(row.I),
      previousVrn: previous,
      currentVrn: current,
      variation: current - previous,
      variationPct: previous ? current / previous - 1 : null,
      objective,
      gap: objective - current,
      coverage: objective ? current / objective : null,
      sow: nullableNumber(row.L),
      acuteShare: nullableNumber(row.N),
      province: clean(mainValue(row,'Provincia')),
      city: clean(mainValue(row,'Ciudad')),
      postalCode: clean(mainValue(row,'CP')),
      region: clean(mainValue(row,'CCAA')),
      route: clean(mainValue(row,'RUTA')),
      unitsTotal: recoveryData.total,
      priority: priority(classification, current, previous),
    });
    if (agreementActive && commitment && end) {
      const endMs = Date.parse(`${end}T12:00:00Z`),
        startMs = Date.parse(`${start || sourceDate}T12:00:00Z`),
        nowMs = Date.parse(`${sourceDate}T12:00:00Z`),
        days = Math.ceil((endMs - nowMs) / 86400000),
        elapsed = Math.max(
          0,
          Math.min(1, (nowMs - startMs) / Math.max(1, endMs - startMs)),
        ),
        expected = commitment * elapsed,
        pace = (accumulated || 0) >= expected * 0.85;
      if (days <= 90 || !pace) {
        const severity =
          days <= 30 || (!pace && elapsed > 0.5) ? "critical" : "warning";
        alerts.push({
          severity,
          type: "agreement",
          vdl,
          codDel: clean(row.C),
          client: clean(row.G),
          title:
            days < 0
              ? "Acuerdo vencido"
              : days <= 90
                ? `Acuerdo vence en ${days} días`
                : "Acuerdo desviado",
          detail: `${condition || "Acuerdo"} · acumulado ${Math.round(accumulated || 0)} € de ${Math.round(commitment)} € · faltan ${Math.round(Math.max(0, remaining || 0))} €`,
          score: (severity === "critical" ? 100 : 50) + Math.max(0, 90 - days),
        });
      }
    }
  }
  const quotaRows = sheet("Cuota", 6, 60),
    quotaHeader = [...quotaRows.values()].find(row=>salesKey(row.C)==='coddel') || {},
    quotaMonths = ['F','G','H'].map(c=>excelDate(quotaHeader[c]).slice(0,7)),
    quotaQuarter = quarterForMonth(quotaMonths[0] || ''),
    client200Targets = new Map(
      [...quotaRows.entries()]
        .filter(([, row]) => clean(row.D) && !clean(row.C) && Number(row.F)>0 && Number(row.E)>0)
        .map(([, row]) => [normalize(clean(row.D)), { target85: number(row.E), target100: number(row.F) }]),
    ),
    quota = [...quotaRows.values()]
      .filter((r) => /^BU\s*\d+/i.test(clean(r.C)))
      .map((r) => ({
        codDel: clean(r.C),
        delegate: clean(r.D),
        quotaQ: number(r.E),
        objective1: number(r.F),
        objective2: number(r.G),
        objective3: number(r.H),
        sale1: number(r.I),
        sale2: number(r.J),
        sale3: number(r.K),
        coverageQ: number(r.O),
        gapQ: number(r.P),
      })),
    cycleRows = sheet("Ciclos Cerrados", 6, 60),
    cycleHeader = cycleRows.get(7) || {},
    cycleGroups = cycleRows.get(6) || {},
    cycleTotal = periodColumns(cycleHeader,cycleGroups,'VENTA TOTAL'),
    cyclePlatform = periodColumns(cycleHeader,cycleGroups,'V. PLATAFORMA CICLO'),
    cyclePush = periodColumns(cycleHeader,cycleGroups,'V. PUSH CICLO'),
    cycle200 = periodColumns(cycleHeader,cycleGroups,'Farmacias Cumplen > 200€'),
    cycleOrders = periodColumns(cycleHeader,cycleGroups,'Pedidos Directos'),
    cycleTransfers = periodColumns(cycleHeader,cycleGroups,'Pedidos Transfer'),
    cycleRatio = periodColumns(cycleHeader,cycleGroups,'% Directo sobre Transfer ( ni incluye P Negativas)'),
    cycleOpenings = periodColumns(cycleHeader,cycleGroups,'Aperturas Venta Push'),
    cycleOpeningSales = periodColumns(cycleHeader,cycleGroups,'VRN PUSH Aperturas'),
    cycleOpeningMean = periodColumns(cycleHeader,cycleGroups,'VRN PROMEDIO Aperturas'),
    cycleHeaders = headerMap(cycleHeader),
    cycles: any[] = [],
    delegates: any[] = [];
  if(latestQuarter(cycleTotal)!==currentQuarter || (quotaQuarter && quotaQuarter!==currentQuarter))
    throw new Error('Cuota, Cuadro Mando y Ciclos Cerrados no corresponden al mismo trimestre. No se sustituirá el cuadro vigente.');
  const periodValue=(row:Row,cols:ReturnType<typeof periodColumns>,quarter:string)=>number(row[cols.find(x=>x.quarter===quarter)?.column||'']);
  for (const [idx, row] of cycleRows) {
    if (idx === 7 || !/^BU\s*\d+/i.test(clean(row.C))) continue;
    const series: QuarterPoint[] = readPeriodSeries(row,cycleTotal,cyclePlatform,cyclePush,periodProgress),
      codDel = clean(row.C),
      delegate = clean(row.D),
      targets = client200Targets.get(normalize(delegate)) || { target85: 0, target100: 0 };
    series.forEach((point, i) => {
      point.pharmacies200 = periodValue(row,cycle200,point.quarter);
      point.openingsCount = periodValue(row,cycleOpenings,point.quarter);
      point.openingsSales = periodValue(row,cycleOpeningSales,point.quarter);
      point.openingsAverage = periodValue(row,cycleOpeningMean,point.quarter);
      if(!Number.isInteger(point.openingsCount)||point.openingsCount<0 || !Number.isInteger(point.pharmacies200)||point.pharmacies200<0)
        throw new Error(`Los contadores de farmacias no son válidos en ${point.quarter}.`);
      if (i === series.length - 1) {
        point.target200At85 = targets.target85;
        point.target200At100 = targets.target100;
      }
    });
    cycles.push({
      codDel,
      delegate,
      previousQ: series.at(-2)?.total||0,
      currentQ: series.at(-1)?.total||0,
      platform: series.at(-1)?.platform||0,
      push: series.at(-1)?.push||0,
      pharmacies200: series.at(-1)?.pharmacies200||0,
      directOrders: periodValue(row,cycleOrders,currentQuarter),
      transferOrders: periodValue(row,cycleTransfers,currentQuarter),
      directRatio: periodValue(row,cycleRatio,currentQuarter),
      clientsGrowing: number(fromHeader(row,cycleHeaders,'Nº Crecen')),
      clientsDeclining: number(fromHeader(row,cycleHeaders,'Nº Decrecen')),
      eurosGrowing: number(fromHeader(row,cycleHeaders,'€ Crecen')),
      eurosDeclining: number(fromHeader(row,cycleHeaders,'€ Decrecen')),
    });
    delegates.push({
      codDel,
      delegate,
      quarters: series,
      openingsCount: series.at(-1)?.openingsCount || 0,
      openingsSales: series.at(-1)?.openingsSales || 0,
    });
  }
  const productRows = sheet("Presentaciones por Farmacia", 6, 1000),
    productHeader = productRows.get(6) || {},
    products: any[] = [],
    productDetails: any[] = [],
    productNames = new Map<string, { presentation: string; brand: string }>(),
    monthNames = [
      "ene",
      "feb",
      "mar",
      "abr",
      "may",
      "jun",
      "jul",
      "ago",
      "sep",
      "oct",
      "nov",
      "dic",
    ];
  let latestMonth = "";
  const productMonth = (label: string) => {
    const m = label.match(/([A-Za-zÁÉÍÓÚáéíóú]{3})\s*(\d{2})/);
    if (!m) return "";
    const month = monthNames.indexOf(normalize(m[1]).slice(0, 3)) + 1;
    return month
      ? String(2000 + Number(m[2])) + String(month).padStart(2, "0")
      : "";
  };
  const productMonthCols=Object.keys(productHeader).filter(c=>Boolean(productMonth(clean(productHeader[c])))),
    productQuarterCols=Object.keys(productHeader).filter(c=>/^Q[1-4]$/i.test(clean(productHeader[c]))),
    productTotalCol=Object.keys(productHeader).find(c=>salesKey(productHeader[c])==='total');
  for (const c of productMonthCols) {
    const ym = productMonth(clean(productHeader[c]));
    if (ym > latestMonth) latestMonth = ym;
  }
  for (const [idx, row] of productRows) {
    if (idx === 6 || !clean(row.A)) continue;
    const nationalCode = clean(row.A),
      presentation = clean(row.B),
      brand = clean(row.C),
      months: Record<string, number> = {};
    for (const c of productMonthCols) {
      const ym = productMonth(clean(productHeader[c]));
      if (ym) months[ym] = number(row[c]);
    }
    const trend = productTrend(months, latestMonth);
    products.push({
      nationalCode,
      presentation,
      brand,
      commercialType: clean(row.D),
      focus: clean(row.F),
      unitsCurrent: trend.currentUnits,
      unitsQ1: trend.previousUnits,
      trendPct: trend.changePct,
    });
    productDetails.push({
      nationalCode,
      months,
      quarters: Object.fromEntries(productQuarterCols.map(c=>[clean(productHeader[c]),number(row[c])])),
      ...trend,
      total: number(row[productTotalCol||'']),
    });
    productNames.set(nationalCode, { presentation, brand });
  }
  const detailPath = book.paths["Cliente-Presentacion"],
    detailXml = strFromU8(book.files[detailPath]);
  delete book.files[detailPath];
  const clientProducts = parseClientProducts(
      detailXml,
      book.shared,
      productNames,
      latestMonth,
    ),
    recoveryMatchCount = clients.filter((c) => recovery.has(c.vdl)).length;
  if (!quota.length || !cycles.length)
    throw new Error("No se han encontrado datos válidos de cuota o ciclos.");
  if (recoveryMatchCount / Math.max(1, clients.length) < 0.95)
    throw new Error(
      "La coincidencia de VDL con Recuperaciones es inferior al 95 %. Revisa el esquema antes de importar.",
    );
  return {
    metadata: {
      sourceName,
      sourceDate,
      clientCount: clients.length,
      productCount: products.length,
      recoveryMatchCount,
      currentQuarter,
      productMonths: productMonthCols.map(c=>productMonth(clean(productHeader[c]))),
      schemaVersion: SALES_SCHEMA_VERSION,
    },
    quota: reconcileQuotaWithOfficialCycles(quota, delegates, currentQuarter, sourceDate),
    cycles,
    delegates,
    clients,
    clientDetails,
    products,
    productDetails,
    clientProducts,
    alerts: alerts.sort((a, b) => b.score - a.score),
  };
}

const bindMany = async (env: Env, statements: D1PreparedStatement[]) => {
    for (let i = 0; i < statements.length; i += 50)
      await env.DB.batch(statements.slice(i, i + 50));
  },
  TABLES = [
    "quota",
    "cycles",
    "clients",
    "products",
    "client_details",
    "delegate_details",
    "product_details",
    "client_products",
    "alerts",
    "sources",
  ];
export async function importSalesDashboard(
  env: Env,
  bytes: ArrayBuffer | Uint8Array,
  sourceName: string,
  sourceChannel: string,
  importedBy: string,
) {
  const payload = parseSalesDashboard(bytes, sourceName),
    id = `${payload.metadata.sourceDate}-${crypto.randomUUID()}`,
    stamp = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO sales_dashboard_imports(id,source_name,source_date,source_channel,imported_at,imported_by,client_count,product_count,recovery_match_count,current_quarter,parser_version,product_months,ready) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0)",
  )
    .bind(
      id,
      sourceName,
      payload.metadata.sourceDate,
      sourceChannel,
      stamp,
      importedBy,
      payload.metadata.clientCount,
      payload.metadata.productCount,
      payload.metadata.recoveryMatchCount,
      payload.metadata.currentQuarter,
      SALES_SCHEMA_VERSION,
      JSON.stringify(payload.metadata.productMonths),
    )
    .run();
  try {
    const sourceBytes=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    for(let offset=0;offset<sourceBytes.length;offset+=256*1024)
      await env.DB.prepare('INSERT INTO sales_dashboard_sources(import_id,chunk_index,content) VALUES(?,?,?)').bind(id,offset/(256*1024),sourceBytes.slice(offset,offset+256*1024).buffer).run();
    await bindMany(
      env,
      payload.quota.map((x) =>
        env.DB.prepare(
          "INSERT INTO sales_dashboard_quota VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          id,
          x.codDel,
          x.delegate,
          x.quotaQ,
          x.objective1,
          x.objective2,
          x.objective3,
          x.sale1,
          x.sale2,
          x.sale3,
          x.coverageQ,
          x.gapQ,
        ),
      ),
    );
    await bindMany(
      env,
      payload.cycles.map((x) =>
        env.DB.prepare(
          "INSERT INTO sales_dashboard_cycles VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          id,
          x.codDel,
          x.delegate,
          x.previousQ,
          x.currentQ,
          x.platform,
          x.push,
          x.pharmacies200,
          x.directOrders,
          x.transferOrders,
          x.directRatio,
          x.clientsGrowing,
          x.clientsDeclining,
          x.eurosGrowing,
          x.eurosDeclining,
        ),
      ),
    );
    await bindMany(
      env,
      payload.clients.map((x) =>
        env.DB.prepare(
          "INSERT INTO sales_dashboard_clients(import_id,vdl,cod_del,delegate,client,classification,client_type,previous_vrn,current_vrn,variation,variation_pct,objective,coverage,sow,acute_share,province,city,postal_code,region,route,units_total,priority) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          id,
          x.vdl,
          x.codDel,
          x.delegate,
          x.client,
          x.classification,
          x.clientType,
          x.previousVrn,
          x.currentVrn,
          x.variation,
          x.variationPct,
          x.objective,
          x.coverage,
          x.sow,
          x.acuteShare,
          x.province,
          x.city,
          x.postalCode,
          x.region,
          x.route,
          x.unitsTotal,
          x.priority,
        ),
      ),
    );
    await bindMany(
      env,
      payload.products.map((x) =>
        env.DB.prepare(
          "INSERT INTO sales_dashboard_products VALUES(?,?,?,?,?,?,?,?,?)",
        ).bind(
          id,
          x.nationalCode,
          x.presentation,
          x.brand,
          x.commercialType,
          x.focus,
          x.unitsCurrent,
          x.unitsQ1,
          x.trendPct,
        ),
      ),
    );
    await bindMany(
      env,
      payload.clientDetails.map((x) =>
        env.DB.prepare(
          "INSERT INTO sales_dashboard_client_details(import_id,vdl,monthly_sales,quarters_json,recovery_json,agreement_json,otc_json,purchase_pattern,direct_pct,forecast_gap) VALUES(?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          id,
          x.vdl,
          JSON.stringify(x.monthlySales),
          JSON.stringify(x.quarters),
          JSON.stringify(x.recovery),
          JSON.stringify(x.agreement),
          JSON.stringify(x.otc),
          x.purchasePattern,
          x.directPct,
          x.forecastGap,
        ),
      ),
    );
    await bindMany(
      env,
      payload.delegates.map((x) =>
        env.DB.prepare(
          "INSERT INTO sales_dashboard_delegate_details VALUES(?,?,?,?,?,?)",
        ).bind(
          id,
          x.codDel,
          x.delegate,
          JSON.stringify(x.quarters),
          x.openingsCount,
          x.openingsSales,
        ),
      ),
    );
    await bindMany(
      env,
      payload.productDetails.map((x) =>
        env.DB.prepare(
          "INSERT INTO sales_dashboard_product_details VALUES(?,?,?,?,?,?,?,?,?)",
        ).bind(
          id,
          x.nationalCode,
          JSON.stringify(x.months),
          JSON.stringify(x.quarters),
          x.status,
          x.currentAvg,
          x.previousAvg,
          x.changePct,
          x.total,
        ),
      ),
    );
    await bindMany(
      env,
      payload.clientProducts.map((x) =>
        env.DB.prepare(
          "INSERT INTO sales_dashboard_client_products VALUES(?,?,?)",
        ).bind(id, x.vdl, JSON.stringify(x.products)),
      ),
    );
    await bindMany(
      env,
      payload.alerts.map((x, i) =>
        env.DB.prepare(
          "INSERT INTO sales_dashboard_alerts VALUES(?,?,?,?,?,?,?,?,?)",
        ).bind(
          id,
          `${id}-${i}`,
          x.severity,
          x.type,
          x.vdl,
          x.codDel,
          x.client,
          x.title,
          x.detail,
        ),
      ),
    );
  } catch (e) {
    await env.DB.batch(
      TABLES.map((t) =>
        env.DB.prepare(
          `DELETE FROM sales_dashboard_${t} WHERE import_id=?`,
        ).bind(id),
      ),
    );
    await env.DB.prepare("DELETE FROM sales_dashboard_imports WHERE id=?")
      .bind(id)
      .run();
    throw e;
  }
  // Keep earlier periods. Never delete history when uploading a newer Q.
  await env.DB.prepare('UPDATE sales_dashboard_imports SET ready=1 WHERE id=?').bind(id).run();
  const result = {
    id,
    ...payload.metadata,
    sourceChannel,
    alerts: payload.alerts.slice(0, 12),
  };
  if (sourceChannel === "web" && result.alerts.length) {
    const chatId =
      env.OWNER_CHAT_ID || (await getSetting(env, "owner_chat_id"));
    if (chatId)
      await send(env, chatId, telegramDashboardSummary(result), {
        plain: true,
      }).catch(() => undefined);
  }
  return result;
}

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

/**
 * The workbook's Cuota sheet contains cached SUMIF results. Some editions of
 * the file have a shifted SUMIF range for one delegate, so the cached quarterly
 * sale can disagree with the official VRN total in Ciclos Cerrados. Keep the
 * monthly split from Cuota, but reconcile its total, coverage and gap against
 * the latest official quarter before persisting or returning dashboard data.
 */
export function reconcileQuotaWithOfficialCycles(
  quotaRows: any[],
  delegateRows: any[],
  currentQuarter?: string,
  sourceDate?: string,
) {
  const officialByDelegate = new Map<string, number>();
  for (const detail of delegateRows || []) {
    const codDel = clean(detail.codDel ?? detail.cod_del);
    const quarters = Array.isArray(detail.quarters)
      ? detail.quarters
      : parseJson<any[]>(detail.quarters_json, []);
    const latest = currentQuarter ? quarters.find((q:any)=>q.quarter===currentQuarter) : quarters.at(-1);
    const total = Number(latest?.total);
    if (codDel && Number.isFinite(total)) officialByDelegate.set(codDel, total);
  }
  return (quotaRows || []).map((row) => {
    const codDel = clean(row.codDel ?? row.cod_del);
    const official = officialByDelegate.get(codDel);
    if (official === undefined) return row;
    if ("quota_q" in row) {
      const quota = Number(row.quota_q || 0),
        sale1 = Number(row.sale_1 || 0),
        sale2 = Number(row.sale_2 || 0);
      const sales=[sale1,sale2,Number(row.sale_3||0)];
      const index=sourceDate&&quarterForMonth(sourceDate)===currentQuarter?(Number(sourceDate.slice(5,7))-1)%3:2;
      for(let i=index+1;i<3;i++)sales[i]=0;
      sales[index]=official-sales.slice(0,index).reduce((a,b)=>a+b,0);
      return {
        ...row,
        sale_1: sales[0],sale_2:sales[1],sale_3:sales[2],
        coverage_q: quota ? official / quota : 0,
        gap_q: official - quota,
      };
    }
    const quota = Number(row.quotaQ || 0),
      sale1 = Number(row.sale1 || 0),
      sale2 = Number(row.sale2 || 0);
    const sales=[sale1,sale2,Number(row.sale3||0)];
    const index=sourceDate&&quarterForMonth(sourceDate)===currentQuarter?(Number(sourceDate.slice(5,7))-1)%3:2;
    for(let i=index+1;i<3;i++)sales[i]=0;
    sales[index]=official-sales.slice(0,index).reduce((a,b)=>a+b,0);
    return {
      ...row,
      sale1:sales[0],sale2:sales[1],sale3:sales[2],
      coverageQ: quota ? official / quota : 0,
      gapQ: official - quota,
    };
  });
}
export async function listSalesImports(env:Env) {
  const items=(await env.DB.prepare('SELECT * FROM sales_dashboard_imports WHERE ready=1').all<any>()).results;
  return items.sort((a,b)=>quarterOrder(b.current_quarter||quarterForMonth(b.source_date))-quarterOrder(a.current_quarter||quarterForMonth(a.source_date))||String(b.source_date).localeCompare(String(a.source_date))||String(b.imported_at).localeCompare(String(a.imported_at)));
}
async function dashboardData(env: Env, url: URL) {
  const imports = await listSalesImports(env),
    selectedId = url.searchParams.get("import") || imports[0]?.id;
  if (!selectedId) return { ok: true, empty: true };
  const latest = imports.find((x) => x.id === selectedId) || imports[0],
    id = latest.id,
    currentQuarter = latest.current_quarter || quarterForMonth(latest.source_date),
    delegate = url.searchParams.get("delegate") || "",
    client = url.searchParams.get("client") || "",
    molecule = url.searchParams.get("molecule") || "",
    search = url.searchParams.get("product") || "",
    productSort = url.searchParams.get("product_sort") === "units_desc" ? "units_desc" : "alpha",
    evolution = url.searchParams.get("evolution") || "",
    inactive = Number(url.searchParams.get("inactive") || 0),
    filter = delegate ? " AND cod_del=?" : "",
    args = delegate ? [id, delegate] : [id];
  const [
    quota,
    cycles,
    classes,
    ytd,
    changes,
    clientOptions,
    delegates,
    delegateDetails,
    alerts,
    productRows,
    moleculeRows,
    productTimelineRows,
    patternRows,
    allClientRows,
    historicalDelegates,
    historicalProducts,
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM sales_dashboard_quota WHERE import_id=?${filter} ORDER BY coverage_q DESC`,
    )
      .bind(...args)
      .all<any>(),
    env.DB.prepare(
      `SELECT * FROM sales_dashboard_cycles WHERE import_id=?${filter} ORDER BY current_q DESC`,
    )
      .bind(...args)
      .all<any>(),
    env.DB.prepare(
      `SELECT classification,COUNT(*) clients,SUM(current_vrn) sales,SUM(variation) variation FROM sales_dashboard_clients WHERE import_id=?${filter} GROUP BY classification ORDER BY classification`,
    )
      .bind(...args)
      .all<any>(),
    env.DB.prepare(
      `SELECT COUNT(*) clients,SUM(current_vrn) current,SUM(previous_vrn) previous,SUM(variation) variation,SUM(CASE WHEN variation>0 THEN 1 ELSE 0 END) growing,SUM(CASE WHEN variation<0 THEN 1 ELSE 0 END) declining,SUM(CASE WHEN previous_vrn<=0 AND current_vrn>0 THEN 1 ELSE 0 END) openings FROM sales_dashboard_clients WHERE import_id=?${filter}`,
    )
      .bind(...args)
      .first<any>(),
    env.DB.prepare(
      `SELECT c.*,d.purchase_pattern,d.direct_pct FROM sales_dashboard_clients c LEFT JOIN sales_dashboard_client_details d ON d.import_id=c.import_id AND d.vdl=c.vdl WHERE c.import_id=?${filter} ORDER BY ABS(c.variation) DESC LIMIT 40`,
    )
      .bind(...args)
      .all<any>(),
    env.DB.prepare(
      `SELECT vdl,client,classification,cod_del FROM sales_dashboard_clients WHERE import_id=?${filter} ORDER BY client`,
    )
      .bind(...args)
      .all<any>(),
    env.DB.prepare(
      "SELECT cod_del,delegate FROM sales_dashboard_quota WHERE import_id=? ORDER BY delegate",
    )
      .bind(id)
      .all<any>(),
    env.DB.prepare(
      `SELECT * FROM sales_dashboard_delegate_details WHERE import_id=?${filter}`,
    )
      .bind(...args)
      .all<any>(),
    env.DB.prepare(
      `SELECT * FROM sales_dashboard_alerts WHERE import_id=?${filter} ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END,title LIMIT 30`,
    )
      .bind(...args)
      .all<any>(),
    env.DB.prepare(
      `SELECT p.*,d.months_json,d.quarters_json,d.status,d.current_avg,d.previous_avg,d.change_pct,d.total_units FROM sales_dashboard_products p JOIN sales_dashboard_product_details d ON d.import_id=p.import_id AND d.national_code=p.national_code WHERE p.import_id=? ORDER BY p.brand,p.presentation LIMIT 1000`,
    )
      .bind(id)
      .all<any>(),
    env.DB.prepare(
      "SELECT DISTINCT brand FROM sales_dashboard_products WHERE import_id=? AND brand<>'' ORDER BY brand",
    )
      .bind(id)
      .all<any>(),
    env.DB.prepare(
      "SELECT months_json FROM sales_dashboard_product_details WHERE import_id=?",
    )
      .bind(id)
      .all<any>(),
    env.DB.prepare(
      `SELECT d.purchase_pattern pattern,COUNT(*) count FROM sales_dashboard_client_details d JOIN sales_dashboard_clients c ON c.import_id=d.import_id AND d.vdl=c.vdl WHERE c.import_id=?${filter} GROUP BY d.purchase_pattern`,
    )
      .bind(...args)
      .all<any>(),
    env.DB.prepare(`SELECT c.*,d.quarters_json,d.monthly_sales FROM sales_dashboard_clients c JOIN sales_dashboard_client_details d ON d.import_id=c.import_id AND d.vdl=c.vdl WHERE c.import_id=?${filter}`).bind(...args).all<any>(),
    env.DB.prepare(`SELECT d.*,i.source_date,i.imported_at,i.parser_version FROM sales_dashboard_delegate_details d JOIN sales_dashboard_imports i ON i.id=d.import_id WHERE i.ready=1 AND (i.source_date<? OR (i.source_date=? AND i.imported_at<?))${delegate?' AND d.cod_del=?':''} ORDER BY i.source_date,i.imported_at`).bind(latest.source_date,latest.source_date,latest.imported_at,...(delegate?[delegate]:[])).all<any>(),
    client ? env.DB.prepare(`SELECT p.import_id,p.products_json,i.product_months FROM sales_dashboard_client_products p JOIN sales_dashboard_imports i ON i.id=p.import_id WHERE i.ready=1 AND p.vdl=? AND (i.source_date<? OR (i.source_date=? AND i.imported_at<?)) ORDER BY i.source_date,i.imported_at`).bind(client,latest.source_date,latest.source_date,latest.imported_at).all<any>()
      : env.DB.prepare(`SELECT p.import_id,p.national_code,p.presentation,p.brand,d.months_json,i.product_months FROM sales_dashboard_products p JOIN sales_dashboard_product_details d ON d.import_id=p.import_id AND d.national_code=p.national_code JOIN sales_dashboard_imports i ON i.id=p.import_id WHERE i.ready=1 AND (i.source_date<? OR (i.source_date=? AND i.imported_at<?)) ORDER BY i.source_date,i.imported_at`).bind(latest.source_date,latest.source_date,latest.imported_at).all<any>(),
  ]);
  const recoveredClients=allClientRows.results.map(c=>({...c,quarters:recoverShiftedClient(parseJson(c.quarters_json,[]),latest.source_date)}));
  let clientDetail: any = null,
    clientProducts: any[] = [];
  if (client) {
    clientDetail = await env.DB.prepare(
      "SELECT c.*,d.monthly_sales,d.quarters_json,d.recovery_json,d.agreement_json,d.otc_json,d.purchase_pattern,d.direct_pct,d.forecast_gap FROM sales_dashboard_clients c JOIN sales_dashboard_client_details d ON d.import_id=c.import_id AND d.vdl=c.vdl WHERE c.import_id=? AND c.vdl=?",
    )
      .bind(id, client)
      .first<any>();
    if (clientDetail) {
      clientDetail.quarters = recoverShiftedClient(parseJson(clientDetail.quarters_json, []),latest.source_date);
      clientDetail.monthlySales = recoverMonthlySales(parseJson(clientDetail.monthly_sales, {}),clientDetail.quarters,latest.source_date);
      clientDetail.recovery = parseJson(clientDetail.recovery_json, {});
      clientDetail.agreement = parseJson(clientDetail.agreement_json, {});
      clientDetail.otc = parseJson(clientDetail.otc_json, []);
    }
    const cp = await env.DB.prepare(
      "SELECT products_json FROM sales_dashboard_client_products WHERE import_id=? AND vdl=?",
    )
      .bind(id, client)
      .first<any>();
    clientProducts = parseJson<any[]>(cp?.products_json, []);
  }
  const needsRecovery=Number(latest.parser_version||0)<SALES_SCHEMA_VERSION&&recoveredClients.some(c=>parseJson<any[]>(c.quarters_json,[])[0]?.quarter?.startsWith('Trimestre'));
  const sourceMonth=latest.source_date.slice(0,7).replace('-','');
  const recoveredProductMonth=needsRecovery?(await env.DB.prepare(`SELECT json_extract(p.value,'$.nationalCode') national_code,SUM(COALESCE(json_extract(p.value,?),0)) units FROM sales_dashboard_client_products c,json_each(c.products_json) p WHERE c.import_id=? GROUP BY json_extract(p.value,'$.nationalCode')`).bind(`$.months."${sourceMonth}"`,id).all<any>()).results:[];
  const recoveredProductUnits=new Map(recoveredProductMonth.map(x=>[x.national_code,Number(x.units)]));
  const products = productRows.results.map((p: any) => ({
      ...p,
      nationalCode: p.national_code,
      presentation: p.presentation,
      brand: p.brand,
      months: {...parseJson(p.months_json, {}),...(needsRecovery?{[sourceMonth]:recoveredProductUnits.get(p.national_code)||0}:{})},
      quarters: parseJson(p.quarters_json, {}),
    })),
    rawProductsCurrent = client ? clientProducts : products,
    latestProductMonth =
      (needsRecovery?sourceMonth:'') || productTimelineRows.results
        .flatMap((p: any) => Object.keys(parseJson(p.months_json, {})))
        .filter((x: string) => /^\d{6}$/.test(x))
        .sort()
        .at(-1) || "",
    productMonths = latestProductMonth
      ? Array.from({ length: 8 }, (_, i) =>
          shiftMonth(latestProductMonth, i - 7),
        )
      : [],
    historicalVersions = new Map<string,{rows:any[];months:string[]}>();
  for(const row of historicalProducts.results){
    let version=historicalVersions.get(row.import_id);
    if(!version){version={rows:[],months:parseJson(row.product_months,[])};historicalVersions.set(row.import_id,version);}
    if(client)version.rows.push(...parseJson<any[]>(row.products_json,[]));
    else version.rows.push({...row,nationalCode:row.national_code,months:parseJson(row.months_json,{})});
  }
  for(const version of historicalVersions.values())if(!version.months.length)version.months=[...new Set(version.rows.flatMap(p=>Object.keys(p.months||{})))];
  const rawProducts=mergeProductHistory([...historicalVersions.values(),{rows:rawProductsCurrent,months:[...new Set(products.flatMap(p=>Object.keys(p.months)))]}]);
  const allMoleculeProducts=aggregateMoleculeProducts(rawProducts,latestProductMonth);
  const contains = (value: unknown, query: string) =>
      String(value || "")
        .toLowerCase()
        .includes(query.toLowerCase()),
    scopedMoleculeProducts = allMoleculeProducts.filter((group) => {
      const children = Array.isArray(group.children) ? group.children : [];
      const matchesBrand =
        !molecule ||
        contains(group.brand || group.molecule, molecule) ||
        children.some((child: any) => contains(child.molecule, molecule));
      const matchesProduct =
        !search ||
        contains(group.brand || group.molecule, search) ||
        children.some((child: any) =>
          contains(`${child.molecule || ""} ${child.nationalCode || ""}`, search),
        );
      return matchesBrand && matchesProduct;
    });
  let moleculeProducts = scopedMoleculeProducts;
  if (evolution)
    moleculeProducts = moleculeProducts.filter((x) => x.status === evolution);
  if (inactive)
    moleculeProducts = moleculeProducts.filter((x) =>
      inactive === 5
        ? x.monthsWithoutPurchase >= 5
        : x.monthsWithoutPurchase === inactive,
    );
  moleculeProducts = [...moleculeProducts]
    .map((group) => ({
      ...group,
      children: [...(group.children || [])].sort((a: any, b: any) =>
        productSort === "units_desc"
          ? Number(b.total || 0) - Number(a.total || 0) || String(a.molecule || "").localeCompare(String(b.molecule || ""), "es")
          : String(a.molecule || "").localeCompare(String(b.molecule || ""), "es"),
      ),
    }))
    .sort((a, b) =>
      productSort === "units_desc"
        ? Number(b.total || 0) - Number(a.total || 0) || String(a.brand || a.molecule).localeCompare(String(b.brand || b.molecule), "es")
        : String(a.brand || a.molecule).localeCompare(String(b.brand || b.molecule), "es"),
    );
  const productSummary = Object.fromEntries(
    [...new Set(scopedMoleculeProducts.map((x) => x.status))].map((status) => [
      status,
      scopedMoleculeProducts.filter((x) => x.status === status).length,
    ]),
  ),
    productAlerts = moleculeProducts
      .filter((x) => x.status === "Molécula perdida")
      .sort(
        (a, b) =>
          b.monthsWithoutPurchase - a.monthsWithoutPurchase ||
          b.previousUnits - a.previousUnits,
      )
      .slice(0, 10);
  const parsedDelegateDetails = delegateDetails.results.map((d: any) => {
      const current=recoverShiftedDelegate({...d,quarters:parseJson(d.quarters_json,[])},latest.source_date,recoveredClients.filter(c=>c.cod_del===d.cod_del).map(c=>c.quarters));
      const prior=historicalDelegates.results.filter(h=>h.cod_del===d.cod_del && !parseJson<any[]>(h.quarters_json,[]).some(q=>Number(q.openingsCount)>1000)).map(h=>parseJson<any[]>(h.quarters_json,[]));
      // Missing discarded cells in a legacy import may use an earlier observation
      // of the SAME closed quarter, never data from a different quarter.
      const versions=[...prior,current.quarters];
      const quarters=mergeQuarterHistory(versions,currentQuarter).map(q=>{
        const old=[...prior].reverse().flat().find(p=>p.quarter===q.quarter);
        return old?Object.fromEntries(Object.entries({...old,...q}).map(([k,v])=>[k,v==null?old[k]??null:v])):q;
      });
      return {...current,quarters};
    }),
    reconciledQuota = reconcileQuotaWithOfficialCycles(
      quota.results,
      parsedDelegateDetails,
      currentQuarter,
      latest.source_date,
    );
  const correctedCycles=cycles.results.map(c=>{
    const q=parsedDelegateDetails.find(d=>d.cod_del===c.cod_del)?.quarters.find((q:any)=>q.quarter===currentQuarter);
    const rows=recoveredClients.filter(r=>r.cod_del===c.cod_del);
    return q?{...c,current_q:q.total,platform:q.platform,push:q.push,pharmacies_200:q.pharmacies200,clients_growing:rows.filter(r=>r.variation>0).length,clients_declining:rows.filter(r=>r.variation<0).length,euros_growing:rows.reduce((s,r)=>s+Math.max(0,r.variation),0),euros_declining:rows.reduce((s,r)=>s+Math.min(0,r.variation),0)}:c;
  });
  return {
    ok: true,
    latest,
    imports,
    currentQuarter,
    periodVersion: SALES_PERIOD_VERSION,
    isHistorical:latest.id!==imports[0]?.id,
    requiresOriginal:parsedDelegateDetails.some(d=>d.requiresOriginal),
    selectedDelegate: delegate,
    selectedClient: client,
    selectedEvolution: evolution,
    selectedInactive: inactive,
    selectedProductSort: productSort,
    delegates: delegates.results,
    clientOptions: clientOptions.results,
    quota: reconciledQuota,
    cycles: correctedCycles,
    delegateDetails: parsedDelegateDetails,
    classifications: classes.results,
    ytd,
    changes: changes.results,
    alerts: alerts.results,
    products,
    productSummary,
    productMonths,
    moleculeProducts,
    productAlerts,
    purchasePatterns: patternRows.results,
    molecules: moleculeRows.results.map((x) => x.brand),
    productOptions: [...new Set(allMoleculeProducts.flatMap((x) => (x.children || []).map((child: any) => child.molecule).filter(Boolean)))].sort((a, b) => String(a).localeCompare(String(b), "es")),
    clientDetail,
    clientProducts,
  };
}

const pdfEscape = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/[\\()]/g, "\\$&");
function simplePdf(title: string, lines: string[]) {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 42) pages.push(lines.slice(i, i + 42));
  if (!pages.length) pages.push([]);
  const objects: string[] = ["", ""],
    fontId = 3 + pages.length * 2;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  pages.forEach((page, i) => {
    const pageId = 3 + i * 2,
      contentId = pageId + 1,
      content = [
        `BT /F1 17 Tf 48 794 Td (${pdfEscape(title)}) Tj`,
        `/F1 9 Tf 0 -26 Td`,
      ];
    for (const line of page)
      content.push(`(${pdfEscape(line).slice(0, 112)}) Tj 0 -16 Td`);
    content.push("ET");
    const stream = content.join("\n");
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] =
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let pdf = "%PDF-1.4\n",
    offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++)
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
export async function salesDashboardApi(
  req: Request,
  env: Env,
  email: string,
): Promise<Response> {
  const reply = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: { "cache-control": "no-store" } }),
    url = new URL(req.url);
  try {
    if (req.method === "POST") {
      if (email.toLowerCase() !== env.OWNER_EMAIL?.toLowerCase())
        return reply(
          { error: "Solo la propietaria puede cargar el cuadro de mando." },
          403,
        );
      const form = await req.formData(),
        file = form.get("file");
      if (
        !file ||
        typeof file === "string" ||
        file.size > 20 * 1024 * 1024 ||
        !file.name.toLowerCase().endsWith(".xlsx")
      )
        return reply({ error: "Adjunta un XLSX de hasta 20 MB." }, 400);
      return reply({
        ok: true,
        import: await importSalesDashboard(
          env,
          await file.arrayBuffer(),
          file.name,
          "web",
          email,
        ),
      });
    }
    if (req.method !== "GET")
      return reply({ error: "Método no permitido" }, 405);
    const data: any = await dashboardData(env, url);
    if (url.pathname.endsWith("/report.pdf")) {
      if (data.empty) return new Response("Sin datos", { status: 404 });
      const sum = (rows: any[], key: string) =>
          rows.reduce((n, x) => n + Number(x[key] || 0), 0),
        quota = sum(data.quota, "quota_q"),
        sales =
          sum(data.quota, "sale_1") +
          sum(data.quota, "sale_2") +
          sum(data.quota, "sale_3"),
        lines = [
          `Datos: ${data.latest.source_date} | ${data.selectedDelegate || "Todo el equipo"} | ${data.clientDetail?.client || "Todas las farmacias"}`,
          `Venta trimestre: ${sales.toFixed(0)} EUR | Objetivo: ${quota.toFixed(0)} EUR | Falta: ${Math.max(0, quota - sales).toFixed(0)} EUR`,
          `YTD: ${Number(data.ytd.current || 0).toFixed(0)} EUR | Variacion: ${Number(data.ytd.variation || 0).toFixed(0)} EUR | Crecen: ${data.ytd.growing || 0} | Decrecen: ${data.ytd.declining || 0} | Aperturas: ${data.ytd.openings || 0}`,
          "",
          "ALERTAS Y ACUERDOS",
          ...data.alerts.map(
            (x: any) => `[${x.severity}] ${x.client}: ${x.title}. ${x.detail}`,
          ),
          "",
          "MAYORES CAMBIOS YTD",
          ...data.changes
            .slice(0, 20)
            .map(
              (x: any) =>
                `${x.client} | ${x.classification} | ${Number(x.variation).toFixed(0)} EUR | ${x.purchase_pattern}`,
            ),
          "",
          "EVOLUCION POR MOLECULA",
          ...Object.entries(data.productSummary).map(([k, v]) => `${k}: ${v}`),
          ...data.moleculeProducts
            .filter((x: any) => x.status === "Molécula perdida")
            .slice(0, 20)
            .map(
              (x: any) =>
                `Molécula perdida: ${x.molecule} | ${x.monthsWithoutPurchase} meses sin compra | ${Number(x.previousUnits || 0).toFixed(0)} uds en el Q anterior`,
            ),
        ];
      return new Response(
        simplePdf("GERENTE DE ALTO IMPACTO - Informe comercial", lines),
        {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `attachment; filename="informe-comercial-${data.latest.source_date}.pdf"`,
          },
        },
      );
    }
    return reply(data);
  } catch (e) {
    return reply(
      {
        error:
          e instanceof Error
            ? e.message
            : "No se pudo procesar el cuadro de mando",
      },
      400,
    );
  }
}
export function telegramDashboardSummary(result: {
  sourceDate: string;
  clientCount: number;
  productCount: number;
  recoveryMatchCount: number;
  alerts?: any[];
}) {
  const alerts = (result.alerts || []).slice(0, 6);
  return `Cuadro de mando actualizado al ${result.sourceDate}: ${result.clientCount} farmacias y ${result.productCount} presentaciones. Coincidencia de datos: ${result.recoveryMatchCount}/${result.clientCount}.${alerts.length ? `\n\nAtención comercial:\n${alerts.map((x) => `• ${x.client}: ${x.title}. ${x.detail}`).join("\n")}` : ""}\n\nYa está disponible en GERENTE DE ALTO IMPACTO, dentro de la pestaña Cuadro de mando.`;
}
