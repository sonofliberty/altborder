import { countryLabelMaxScreenFontSize } from "./labelConstants";
import type { ProjectedBounds } from "./mapZoom";

export function getCountryLabelScale(fontSize: number, zoomScale: number, viewScale: number): number {
  return Math.min(1, countryLabelMaxScreenFontSize / (fontSize * zoomScale * viewScale));
}

export type LabelZoomState = {
  x: number;
  y: number;
  k: number;
};

export type LabelBoxSize = {
  width: number;
  height: number;
};

export type ScreenLabelCandidate = {
  id: string;
  x: number;
  y: number;
  priority: number;
};

export type LabelBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export function getLabelBox(
  label: Pick<ScreenLabelCandidate, "x" | "y">,
  zoom: LabelZoomState,
  size: LabelBoxSize,
  gap = 0,
): LabelBox {
  const x = zoom.x + label.x * zoom.k;
  const y = zoom.y + label.y * zoom.k;
  return {
    left: x - size.width / 2 - gap,
    right: x + size.width / 2 + gap,
    top: y - size.height / 2 - gap,
    bottom: y + size.height / 2 + gap,
  };
}

const minCountryLabelScreenFontSize = 3.8;

export function getCountryLabelMinScreenFontSize(baseMinFontSize: number, zoomScale: number): number {
  if (!Number.isFinite(zoomScale) || zoomScale <= 1) return baseMinFontSize;
  const zoomProgress = Math.min(Math.max((zoomScale - 1) / 3, 0), 1);
  return baseMinFontSize - (baseMinFontSize - minCountryLabelScreenFontSize) * zoomProgress;
}

export function filterLabels<T extends ScreenLabelCandidate>(
  labels: T[],
  zoom: LabelZoomState,
  options: {
    maxLabels: number;
    minGap: number;
    viewportWidth?: number;
    viewportHeight?: number;
    viewportBounds?: ProjectedBounds;
    reservedBoxes?: LabelBox[];
    getBoxSize: (label: T) => LabelBoxSize;
    getSortText?: (label: T) => string;
  },
): T[] {
  const accepted: Array<T & { box: LabelBox }> = [];
  const sorted = [...labels].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (options.getSortText?.(a).length ?? 0) - (options.getSortText?.(b).length ?? 0);
  });
  const viewport = options.viewportBounds ?? (options.viewportWidth !== undefined && options.viewportHeight !== undefined
    ? { minX: 0, minY: 0, maxX: options.viewportWidth, maxY: options.viewportHeight }
    : undefined);

  for (const label of sorted) {
    if (accepted.length >= options.maxLabels) break;
    const box = getLabelBox(label, zoom, options.getBoxSize(label), options.minGap);

    if (viewport && (box.right < viewport.minX || box.left > viewport.maxX || box.bottom < viewport.minY || box.top > viewport.maxY)) {
      continue;
    }

    if (
      accepted.every((existing) => !boxesOverlap(box, existing.box)) &&
      (options.reservedBoxes ?? []).every((reserved) => !boxesOverlap(box, reserved))
    ) {
      accepted.push({ ...label, box });
    }
  }

  return accepted.sort((a, b) => a.id.localeCompare(b.id)).map((acceptedLabel) => {
    const label = { ...acceptedLabel };
    delete (label as Partial<typeof label>).box;
    return label as T;
  });
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
