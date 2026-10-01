import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface NotePosition {
  x: number;
  y: number;
}

const LABEL = "text-[11px] font-bold uppercase leading-snug tracking-wide";

// One note on the board. Placement, colour and tilt come in as CSS variables
// read by .note in globals.css; `handle` is the strip of tape on top.
export function PostIt({
  label,
  labelFor,
  color,
  tilt,
  position,
  handle,
  isSlapping = false,
  slapDelay = 0,
  isDragging = false,
  isRaised = false,
  children,
}: {
  label: string;
  labelFor?: string;
  color: string;
  tilt: number;
  position: NotePosition;
  handle: ReactNode;
  isSlapping?: boolean;
  slapDelay?: number;
  isDragging?: boolean;
  isRaised?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("note", isSlapping && "is-slapping", isDragging && "is-dragging", isRaised && "is-raised")}
      style={
        {
          "--note": color,
          "--tilt": `${tilt}deg`,
          "--x": String(position.x),
          "--y": String(position.y),
          "--slap-delay": `${slapDelay}s`,
        } as CSSProperties
      }
    >
      {handle}
      {labelFor ? (
        <label htmlFor={labelFor} className={LABEL}>
          {label}
        </label>
      ) : (
        <p className={LABEL}>{label}</p>
      )}
      {children}
    </div>
  );
}
