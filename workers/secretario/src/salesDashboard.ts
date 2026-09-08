import { strFromU8, Unzip, UnzipInflate } from "fflate";
import type { Env } from "./env";
import { getSetting } from "./db";
import { send } from "./telegram";

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;
type QuarterPoint = {
  quarter: string;
  total: number;
  platform: number;
  push: number;
  directPct: number | null;
  projected?: number;
};
export interface DashboardPayload {
  metadata: {
    sourceName: string;
    sourceDate: string;
    clientCount: number;
    productCount: number;
    recoveryMatchCount: number;
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
    projectedUnits = (currentUnits / Math.max(1, currentKeys.length)) * 3,
    previousHistory = Object.entries(months).some(
      ([key, value]) => key < latestMonth && number(value) > 0,
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
    changePct = previousUnits ? projectedUnits / previousUnits - 1 : null;
  const status =
    monthsWithoutPurchase > 0 && previousHistory
      ? "Molécula perdida"
      : previousUnits <= 0 && currentUnits > 0
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
      };
      grouped.set(key, row);
    }
    for (const [month, value] of Object.entries(item.months || {}))
      row.months[month] = (row.months[month] || 0) + number(value as Cell);
    if (item.presentation) row.presentations.add(clean(item.presentation));
    if (item.nationalCode || item.national_code)
      row.codes.add(clean(item.nationalCode || item.national_code));
  }
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      presentations: [...row.presentations],
      codes: [...row.codes],
      presentationCount: row.presentations.size,
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
    monthCols = colRange("W", "AZ").filter((c) => Number(headerRow[c]) > 0),
    totalCols = colRange("BZ", "CI"),
    platformCols = colRange("CJ", "CS"),
    pushCols = colRange("CT", "DC"),
    quarterLabels = totalCols.map((c, i) => quarterLabel(headerRow[c], i)),
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
      objective = number(row.BB),
      classification = clean(row.H) || "Sin clasificar",
      quarters = quarterSeries(
        row,
        quarterLabels,
        totalCols,
        platformCols,
        pushCols,
        progress,
      ),
      monthlySales = Object.fromEntries(
        monthCols.map((c) => [
          excelDate(headerRow[c]).slice(0, 7),
          number(row[c]),
        ]),
      ),
      otc = colRange("BN", "BY").map((c) => ({
        name: clean(headerRow[c]),
        quantity: number(row[c]),
        purchased: number(row[c]) > 0,
      })),
      commitment = nullableNumber(row.BF),
      accumulated = nullableNumber(row.BK),
      start = excelDate(row.BG),
      end = excelDate(row.BH),
      condition = clean(row.BE),
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
        vigency: clean(row.BI),
        service: clean(row.BJ),
        grossAccumulated: nullableNumber(row.BL),
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
        progress,
      ),
      directPct: quarters.at(-1)?.directPct ?? null,
      forecastGap: number(row.BC),
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
      province: clean(row.EF),
      city: clean(row.EG),
      postalCode: clean(row.EH),
      region: clean(row.EI),
      route: clean(row.EJ),
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
  const quota = [...sheet("Cuota", 7, 30).values()]
      .filter((r) => clean(r.C))
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
    cycleRows = sheet("Ciclos Cerrados", 7, 30),
    cycleHeader = cycleRows.get(7) || {},
    cycles: any[] = [],
    delegates: any[] = [];
  for (const [idx, row] of cycleRows) {
    if (idx === 7 || !clean(row.C)) continue;
    const labels = colRange("E", "J").map((c, i) =>
        quarterLabel(cycleHeader[c], i),
      ),
      series = quarterSeries(
        row,
        labels,
        colRange("E", "J"),
        colRange("K", "P"),
        colRange("Q", "V"),
        progress,
      ),
      codDel = clean(row.C),
      delegate = clean(row.D),
      openings = clients.filter(
        (c) => c.codDel === codDel && c.previousVrn <= 0 && c.currentVrn > 0,
      );
    cycles.push({
      codDel,
      delegate,
      previousQ: number(row.I),
      currentQ: number(row.J),
      platform: number(row.P),
      push: number(row.V),
      pharmacies200: number(row.AB),
      directOrders: number(row.AH),
      transferOrders: number(row.AN),
      directRatio: number(row.AT),
      clientsGrowing: number(row.AU),
      clientsDeclining: number(row.AV),
      eurosGrowing: number(row.AW),
      eurosDeclining: number(row.AX),
    });
    delegates.push({
      codDel,
      delegate,
      quarters: series,
      openingsCount: openings.length,
      openingsSales: openings.reduce((n, c) => n + c.currentVrn, 0),
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
  for (const c of colRange("G", "N")) {
    const ym = productMonth(clean(productHeader[c]));
    if (ym > latestMonth) latestMonth = ym;
  }
  for (const [idx, row] of productRows) {
    if (idx === 6 || !clean(row.A)) continue;
    const nationalCode = clean(row.A),
      presentation = clean(row.B),
      brand = clean(row.C),
      months: Record<string, number> = {};
    for (const c of colRange("G", "N")) {
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
      unitsCurrent: number(row.R),
      unitsQ1: number(row.Q),
      trendPct: trend.changePct,
    });
    productDetails.push({
      nationalCode,
      months,
      quarters: {
        Q3: number(row.O),
        Q4: number(row.P),
        Q1: number(row.Q),
        Q2: number(row.R),
      },
      ...trend,
      total: number(row.S),
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
    },
    quota,
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
    "INSERT INTO sales_dashboard_imports(id,source_name,source_date,source_channel,imported_at,imported_by,client_count,product_count,recovery_match_count) VALUES(?,?,?,?,?,?,?,?,?)",
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
    )
    .run();
  try {
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
  const old = await env.DB.prepare(
    "SELECT id FROM sales_dashboard_imports ORDER BY source_date DESC,imported_at DESC LIMIT -1 OFFSET 16",
  ).all<{ id: string }>();
  for (const item of old.results) {
    await env.DB.batch(
      TABLES.map((t) =>
        env.DB.prepare(
          `DELETE FROM sales_dashboard_${t} WHERE import_id=?`,
        ).bind(item.id),
      ),
    );
    await env.DB.prepare("DELETE FROM sales_dashboard_imports WHERE id=?")
      .bind(item.id)
      .run();
  }
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
async function dashboardData(env: Env, url: URL) {
  const imports = (
      await env.DB.prepare(
        "SELECT * FROM sales_dashboard_imports ORDER BY source_date DESC,imported_at DESC LIMIT 16",
      ).all<any>()
    ).results,
    selectedId = url.searchParams.get("import") || imports[0]?.id;
  if (!selectedId) return { ok: true, empty: true };
  const latest = imports.find((x) => x.id === selectedId) || imports[0],
    id = latest.id,
    delegate = url.searchParams.get("delegate") || "",
    client = url.searchParams.get("client") || "",
    molecule = url.searchParams.get("molecule") || "",
    search = url.searchParams.get("product") || "",
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
      `SELECT p.*,d.months_json,d.quarters_json,d.status,d.current_avg,d.previous_avg,d.change_pct,d.total_units FROM sales_dashboard_products p JOIN sales_dashboard_product_details d ON d.import_id=p.import_id AND d.national_code=p.national_code WHERE p.import_id=? AND (?='' OR lower(p.brand) LIKE '%'||lower(?)||'%' OR lower(p.presentation) LIKE '%'||lower(?)||'%') AND (?='' OR lower(p.presentation) LIKE '%'||lower(?)||'%' OR lower(p.brand) LIKE '%'||lower(?)||'%' OR lower(p.national_code) LIKE '%'||lower(?)||'%') ORDER BY ABS(COALESCE(d.change_pct,0)) DESC LIMIT 1000`,
    )
      .bind(id, molecule, molecule, molecule, search, search, search, search)
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
  ]);
  let clientDetail: any = null,
    clientProducts: any[] = [];
  if (client) {
    clientDetail = await env.DB.prepare(
      "SELECT c.*,d.monthly_sales,d.quarters_json,d.recovery_json,d.agreement_json,d.otc_json,d.purchase_pattern,d.direct_pct,d.forecast_gap FROM sales_dashboard_clients c JOIN sales_dashboard_client_details d ON d.import_id=c.import_id AND d.vdl=c.vdl WHERE c.import_id=? AND c.vdl=?",
    )
      .bind(id, client)
      .first<any>();
    if (clientDetail) {
      clientDetail.monthlySales = parseJson(clientDetail.monthly_sales, {});
      clientDetail.quarters = parseJson(clientDetail.quarters_json, []);
      clientDetail.recovery = parseJson(clientDetail.recovery_json, {});
      clientDetail.agreement = parseJson(clientDetail.agreement_json, {});
      clientDetail.otc = parseJson(clientDetail.otc_json, []);
    }
    const cp = await env.DB.prepare(
      "SELECT products_json FROM sales_dashboard_client_products WHERE import_id=? AND vdl=?",
    )
      .bind(id, client)
      .first<any>();
    clientProducts = parseJson<any[]>(cp?.products_json, []).filter(
      (p) =>
        (!molecule ||
          String(p.brand || "")
            .toLowerCase()
            .includes(molecule.toLowerCase()) ||
          String(p.presentation || "")
            .toLowerCase()
            .includes(molecule.toLowerCase())) &&
        (!search ||
          `${p.presentation || ""} ${p.brand || ""} ${p.nationalCode || ""}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    );
  }
  const products = productRows.results.map((p: any) => ({
      ...p,
      nationalCode: p.national_code,
      presentation: p.presentation,
      brand: p.brand,
      months: parseJson(p.months_json, {}),
      quarters: parseJson(p.quarters_json, {}),
    })),
    rawProducts = client ? clientProducts : products,
    latestProductMonth =
      productTimelineRows.results
        .flatMap((p: any) => Object.keys(parseJson(p.months_json, {})))
        .filter((x: string) => /^\d{6}$/.test(x))
        .sort()
        .at(-1) || "",
    productMonths = latestProductMonth
      ? Array.from({ length: 8 }, (_, i) =>
          shiftMonth(latestProductMonth, i - 7),
        )
      : [],
    allMoleculeProducts = aggregateMoleculeProducts(
      rawProducts,
      latestProductMonth,
    );
  let moleculeProducts = allMoleculeProducts;
  if (evolution)
    moleculeProducts = moleculeProducts.filter((x) => x.status === evolution);
  if (inactive)
    moleculeProducts = moleculeProducts.filter((x) =>
      inactive === 5
        ? x.monthsWithoutPurchase >= 5
        : x.monthsWithoutPurchase === inactive,
    );
  const productSummary = Object.fromEntries(
    [...new Set(allMoleculeProducts.map((x) => x.status))].map((status) => [
      status,
      allMoleculeProducts.filter((x) => x.status === status).length,
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
  return {
    ok: true,
    latest,
    imports,
    selectedDelegate: delegate,
    selectedClient: client,
    selectedEvolution: evolution,
    selectedInactive: inactive,
    delegates: delegates.results,
    clientOptions: clientOptions.results,
    quota: quota.results,
    cycles: cycles.results,
    delegateDetails: delegateDetails.results.map((d: any) => ({
      ...d,
      quarters: parseJson(d.quarters_json, []),
    })),
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
