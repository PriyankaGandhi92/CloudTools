import { renderPage } from './pdfRenderer';
import { fetchApiKey } from './license';

export type ElementCategory =
  | 'wall'
  | 'room'
  | 'duct'
  | 'pavement'
  | 'electrical-zone'
  | 'bridge-deck'
  | 'bridge-bent-cap'
  | 'foundation'
  | 'concrete-slab'
  | 'irregular-shape'
  | 'door'
  | 'window'
  | 'column';

export const ELEMENT_CATEGORIES: { id: ElementCategory; label: string; description: string; color: string }[] = [
  { id: 'wall',            label: 'Walls',            description: 'Identify walls (lines/shaded fills)', color: '#3b82f6' },
  { id: 'room',            label: 'Rooms',            description: 'Identify enclosed rooms with area',  color: '#10b981' },
  { id: 'duct',            label: 'Ducts',            description: 'HVAC duct runs',                     color: '#f59e0b' },
  { id: 'pavement',        label: 'Pavement',         description: 'Pavement / paved regions',           color: '#6b7280' },
  { id: 'electrical-zone', label: 'Electrical Zones', description: 'Panel / circuit / electrical areas', color: '#eab308' },
  { id: 'bridge-deck',     label: 'Bridge Decks',     description: 'Bridge deck regions',                color: '#8b5cf6' },
  { id: 'bridge-bent-cap', label: 'Bridge Bent Cap',  description: 'Bridge bent cap elements',           color: '#a855f7' },
  { id: 'foundation',      label: 'Foundations',      description: 'Foundation/footing drawings',        color: '#92400e' },
  { id: 'concrete-slab',   label: 'Concrete Slabs',   description: 'Slab regions on the sheet',          color: '#0ea5e9' },
  { id: 'irregular-shape', label: 'Irregular Shapes', description: 'Curves, pools, landscape',           color: '#ec4899' },
  { id: 'door',            label: 'Doors',            description: 'Doors (plan view)',                  color: '#22c55e' },
  { id: 'window',          label: 'Windows',          description: 'Windows on walls',                   color: '#06b6d4' },
  { id: 'column',          label: 'Columns',          description: 'Structural columns',                 color: '#dc2626' },
];

export interface DetectedElement {
  id: string;
  pageIndex: number;  // The PDF page index this element belongs to
  category: ElementCategory;
  label: string;        // human-readable label, e.g. "Wall #3"
  /** Polygon points in PDF user-space coordinates (origin top-left, same as annotation points). */
  polygon: { x: number; y: number }[];
  /** Optional bounding rect for quick hover preview. */
  bbox: { x: number; y: number; w: number; h: number };
  /** Estimated quantity, length, or area. */
  quantification?: string;
  confidence?: number;
}

interface RawDetection {
  category: string;
  label?: string;
  polygon?: number[][];       // [[x_frac, y_frac], ...] in 0..1
  bbox?: number[];            // [x, y, w, h] all in 0..1
  quantification?: string;
  confidence?: number;
}

/**
 * Use Gemini Vision to detect engineering / architectural elements on the
 * given page and return polygons / bboxes in PDF user-space coordinates.
 *
 * If `useAi` is false, performs a heuristic fallback (returns empty list with
 * an informational message via thrown Error).
 */
export async function identifyElementsOnPage(
  pageIndex: number,
  pageWidth: number,
  pageHeight: number,
  categories: ElementCategory[],
  options: { useAi?: boolean } = { useAi: true },
): Promise<DetectedElement[]> {
  if (!categories.length) return [];

  if (!options.useAi) {
    // Heuristic fallback: not implemented — surface a clear message
    throw new Error(
      'Non-AI detection is not yet supported for these element types. Enable AI to use this feature.'
    );
  }

  const apiKey = await fetchApiKey();
  if (!apiKey) {
    throw new Error(
      'AI features require an active subscription. Please contact admin to enable AI access.'
    );
  }

  // Render the page to an image for Gemini
  const canvas = document.createElement('canvas');
  await renderPage(pageIndex, canvas, 2);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const base64 = dataUrl.split(',')[1];

  const labels = categories
    .map((c) => ELEMENT_CATEGORIES.find((e) => e.id === c)?.label || c)
    .join(', ');

  const prompt = `You are an expert in reading architectural and engineering drawings.
Identify these element types on the page: ${labels}.

CRITICAL REQUIREMENTS:
1. Detect EVERY single instance of the selected element types on the page. Do not miss any.
2. For windows and doors: Detect EACH INDIVIDUAL window/door separately. Do not group multiple windows together - each window must have its own detection.
3. Scan the entire page systematically - check all rooms, walls, and areas thoroughly.
4. If there are multiple similar elements (e.g., 10 windows), you must return 10 separate detection objects.

For EACH detected element return one JSON object with:
- "category": one of ${JSON.stringify(categories)}
- "label": a short human-friendly label (e.g. "Exterior wall", "Conference Room A", "Window #1", "Window #2")
- "polygon": array of [x, y] points (each value 0..1 fractions of image width/height) outlining the element. Provide 4-12 points. For non-polygonal items provide a tight bounding rectangle as 4 corners.
- "bbox": [x, y, w, h] tight bounding box (fractions 0..1).
- "quantification": optional measurement description (e.g. "12 ft length", "180 sq ft", "3 windows").
- "confidence": optional 0..1.

Output ONLY a JSON array, no markdown, no commentary:
[{"category":"wall","label":"...","polygon":[[0.1,0.2],[0.3,0.2],[0.3,0.4],[0.1,0.4]],"bbox":[0.1,0.2,0.2,0.2]}]`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${t.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const finishReason: string | undefined = data.candidates?.[0]?.finishReason;

  const detections = robustParseDetectionArray(raw);
  if (!detections) {
    // Surface a more helpful error including the first chunk of raw output for debugging
    const preview = raw.replace(/\s+/g, ' ').slice(0, 250);
    const truncated = finishReason && finishReason !== 'STOP'
      ? ` (response ${finishReason})`
      : '';
    console.error('Gemini raw response:', raw);
    throw new Error(
      `Failed to parse AI response${truncated}. Try fewer categories or re-run. Raw: ${preview}`
    );
  }

  // Map fractional coords → user-space coords
  const out: DetectedElement[] = [];
  for (const d of detections) {
    const cat = (d.category as ElementCategory);
    if (!categories.includes(cat)) continue;

    let polygon: { x: number; y: number }[] = [];
    if (Array.isArray(d.polygon) && d.polygon.length >= 3) {
      polygon = (d.polygon as number[][])
        .filter((p: number[]) => Array.isArray(p) && p.length >= 2)
        .map((p: number[]) => ({ x: p[0] * pageWidth, y: p[1] * pageHeight }));
    }

    let bbox = { x: 0, y: 0, w: 0, h: 0 };
    if (Array.isArray(d.bbox) && d.bbox.length >= 4) {
      bbox = {
        x: d.bbox[0] * pageWidth,
        y: d.bbox[1] * pageHeight,
        w: d.bbox[2] * pageWidth,
        h: d.bbox[3] * pageHeight,
      };
    } else if (polygon.length) {
      const xs = polygon.map((p) => p.x);
      const ys = polygon.map((p) => p.y);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      const maxX = Math.max(...xs), maxY = Math.max(...ys);
      bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    if (!polygon.length && bbox.w > 0 && bbox.h > 0) {
      polygon = [
        { x: bbox.x, y: bbox.y },
        { x: bbox.x + bbox.w, y: bbox.y },
        { x: bbox.x + bbox.w, y: bbox.y + bbox.h },
        { x: bbox.x, y: bbox.y + bbox.h },
      ];
    }
    if (!polygon.length) continue;

    out.push({
      id: crypto.randomUUID(),
      pageIndex,
      category: cat,
      label: d.label || ELEMENT_CATEGORIES.find((e) => e.id === cat)?.label || cat,
      polygon,
      bbox,
      quantification: d.quantification,
      confidence: typeof d.confidence === 'number' ? d.confidence : undefined,
    });
  }
  return out;
}

/**
 * Robustly parse a JSON array of detections from raw model output.
 * Handles:
 *  - markdown code fences
 *  - leading/trailing prose
 *  - truncated arrays (closes the last partial object and the array)
 *  - object-wrapped responses like { detections: [...] } or { results: [...] }
 * Returns null if nothing parseable can be recovered.
 */
function robustParseDetectionArray(raw: string): RawDetection[] | null {
  if (!raw) return null;
  let s = raw.trim();

  // Strip markdown code fences if any
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  }

  // 1) Direct parse
  const tryParse = (str: string): unknown => {
    try { return JSON.parse(str); } catch { return undefined; }
  };
  const asArray = (v: unknown): RawDetection[] | null => {
    if (Array.isArray(v)) return v as RawDetection[];
    if (v && typeof v === 'object') {
      // common wrapper keys
      for (const key of ['detections', 'results', 'elements', 'data', 'items']) {
        const inner = (v as Record<string, unknown>)[key];
        if (Array.isArray(inner)) return inner as RawDetection[];
      }
    }
    return null;
  };

  let parsed = tryParse(s);
  let arr = asArray(parsed);
  if (arr) return arr;

  // 2) Slice from first [ to last ]
  const first = s.indexOf('[');
  const last = s.lastIndexOf(']');
  if (first >= 0 && last > first) {
    const slice = s.substring(first, last + 1);
    parsed = tryParse(slice);
    arr = asArray(parsed);
    if (arr) return arr;
  }

  // 3) Slice from first { to last } in case wrapped
  const fObj = s.indexOf('{');
  const lObj = s.lastIndexOf('}');
  if (fObj >= 0 && lObj > fObj) {
    parsed = tryParse(s.substring(fObj, lObj + 1));
    arr = asArray(parsed);
    if (arr) return arr;
  }

  // 4) Recover from a truncated array: keep only complete top-level objects
  if (first >= 0) {
    const head = s.substring(first + 1); // after the opening [
    const objs: string[] = [];
    let depth = 0;
    let start = -1;
    let inStr = false;
    let esc = false;
    for (let i = 0; i < head.length; i++) {
      const c = head[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          objs.push(head.substring(start, i + 1));
          start = -1;
        }
      }
    }
    if (objs.length) {
      const rebuilt = '[' + objs.join(',') + ']';
      parsed = tryParse(rebuilt);
      arr = asArray(parsed);
      if (arr) return arr;
    }
  }

  return null;
}

export function summarizeDetections(detections: DetectedElement[]): string {
  if (!detections.length) return 'No elements detected on this sheet.';
  const byCat = new Map<ElementCategory, DetectedElement[]>();
  for (const d of detections) {
    if (!byCat.has(d.category)) byCat.set(d.category, []);
    byCat.get(d.category)!.push(d);
  }
  const parts: string[] = [];
  for (const [cat, list] of byCat) {
    const label = ELEMENT_CATEGORIES.find((e) => e.id === cat)?.label || cat;
    parts.push(`Selected all ${label.toLowerCase()} on this sheet (${list.length}).`);
  }
  return parts.join('\n');
}
