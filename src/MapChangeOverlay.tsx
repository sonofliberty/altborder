import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { BatchedBoundaryPaths } from "./boundaryEdges";
import type { MapChangeAnimation, MapChangePiece } from "./mapChange";
import type { ProjectedBounds } from "./mapZoom";

export function MapChangeOverlay({
  change, pieces, backgroundPieces, viewport, screenScale, onSweepComplete, onComplete,
}: {
  change: MapChangeAnimation;
  pieces: MapChangePiece[];
  backgroundPieces: MapChangePiece[];
  viewport: ProjectedBounds;
  screenScale: number;
  onSweepComplete: (id: number) => void;
  onComplete: (id: number) => void;
}) {
  const rootRef = useRef<SVGGElement | null>(null);
  useLayoutEffect(() => {
    if (!change.settling || !rootRef.current) return;
    let cancelled = false;
    // Tie the final fade to its own completion and cancel it on interruption.
    const animation = rootRef.current.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 140 : 220,
      easing: "ease-out",
      fill: "forwards",
    });
    void animation.finished.then(() => {
      if (!cancelled) onComplete(change.id);
    }).catch(() => { /* An interrupted transfer owns its replacement animation. */ });
    return () => {
      cancelled = true;
      animation.cancel();
    };
  }, [change.id, change.settling, onComplete]);

  const maskId = `map-change-mask-${change.id}`;
  const frontId = `map-change-front-mask-${change.id}`;
  const bounds = {
    x: Math.max(change.bounds.minX, viewport.minX),
    y: Math.max(change.bounds.minY, viewport.minY),
    width: Math.max(0, Math.min(change.bounds.maxX, viewport.maxX) - Math.max(change.bounds.minX, viewport.minX)),
    height: Math.max(0, Math.min(change.bounds.maxY, viewport.maxY) - Math.max(change.bounds.minY, viewport.minY)),
  };
  const revealPath = change.reveal.kind === "edge" ? change.reveal.path : `M${change.reveal.x},${change.reveal.y}h0.01`;

  return (
    <g
      ref={rootRef}
      className={`map-change${change.settling ? " map-change-settling" : ""}`}
      data-phase={change.settling ? "settling" : change.sweepComplete ? "waiting" : "sweeping"}
      aria-hidden="true"
      style={{
        "--creep-extent": `${change.reveal.extent}px`,
        "--map-change-front-width": `${1.6 / Math.max(screenScale, 0.01)}px`,
      } as CSSProperties}
      onAnimationEnd={(event) => {
        if (event.animationName === "map-change-sweep" || event.animationName === "map-change-cover-reduced") onSweepComplete(change.id);
      }}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" {...bounds}>
          <rect {...bounds} fill="white" />
          <path className="map-change-reveal" d={revealPath} fill="none" stroke="black" />
        </mask>
        <mask id={frontId} maskUnits="userSpaceOnUse" {...bounds}>
          <rect {...bounds} fill="black" />
          <path className="map-change-front-outer" d={revealPath} fill="none" stroke="white" />
          <path className="map-change-front-inner" d={revealPath} fill="none" stroke="black" />
        </mask>
      </defs>
      {backgroundPieces.map((piece, index) => <path key={`background-${index}`} d={piece.path} fill={piece.toColor} fillRule="nonzero" />)}
      {pieces.map((piece, index) => (
        <g key={index}>
          <path className="map-change-destination" d={piece.path} fill={piece.toColor} fillRule="nonzero" />
          <path className="map-change-cover" d={piece.path} fill={piece.fromColor} fillRule="nonzero" mask={`url(#${maskId})`} />
          <path className="map-change-front" d={piece.path} fill="var(--color-primary-hover)" fillRule="nonzero" mask={`url(#${frontId})`} />
        </g>
      ))}
    </g>
  );
}

export function MapChangeBorders({ previous, next, settling }: {
  previous: BatchedBoundaryPaths;
  next: BatchedBoundaryPaths;
  settling: boolean;
}) {
  return (
    <g className={`map-change-borders${settling ? " map-change-borders-settling" : ""}`} aria-hidden="true">
      {[previous, next].map((paths, index) => (
        <g key={index} className={index === 0 ? "map-change-border-before" : "map-change-border-after"}>
          <path className="country-border-line" d={paths.countryPath} />
          <path className="administrative-border-line" d={paths.administrativePath} />
          <path className="administrative-border-line administrative-border-active" d={paths.activeAdministrativePath} />
        </g>
      ))}
    </g>
  );
}
