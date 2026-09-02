"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

// The shared parts of a horizontal card rail: the scroll bookkeeping, and the
// dots that read it out.
//
// A rail here is never a carousel library and never a transform — it is a
// native scroll container with CSS scroll-snap. Touch, trackpad, keyboard
// focus, RTL and reduced motion are then the browser's job rather than ours,
// and the same markup can be a rail on a phone and a plain grid on a desktop
// with no JavaScript involved in the switch.
//
// Two callers, two shapes, one set of rules: the home page's deals shelf is a
// rail at every width, and a fitment section is a rail only below `sm`. The
// hook can't tell the difference and doesn't need to — it measures whatever
// the CSS produced, and a container that isn't overflowing reports one dot,
// which renders nothing.

// Ceiling on the dots. A dot per screenful is honest on a wide screen (five of
// them), but a phone fits barely more than one card at a time — twenty deals
// would be fifteen dots, wider than the rail they sit under. Past this many,
// each dot stands for an equal slice of the rail instead of a screenful.
const MAX_DOTS = 8;

export interface RailScroll {
  /** True at either end of the travel; what the arrows disable on. */
  atStart: boolean;
  atEnd: boolean;
  /** 1 when the track isn't scrollable, which is how the dots hide themselves. */
  dotCount: number;
  activeDot: number;
  /** Attach to the track's `onScroll`. */
  onScroll: () => void;
  /** Nudges by `ratio` of a screenful; direction 1 is "further along the rail". */
  scrollByPage: (direction: 1 | -1, ratio: number) => void;
  scrollToDot: (dot: number) => void;
}

export function useRailScroll(trackRef: RefObject<HTMLElement | null>): RailScroll {
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [dotCount, setDotCount] = useState(1);
  const [activeDot, setActiveDot] = useState(0);

  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    // RTL scroll positions run negative in every browser that matters now, so
    // the distance travelled is the absolute value either way.
    const travelled = Math.abs(track.scrollLeft);
    const max = track.scrollWidth - track.clientWidth;
    setAtStart(travelled <= 1);
    setAtEnd(travelled >= max - 1);

    // One dot per screenful, capped (see MAX_DOTS). Spacing them across the
    // scrollable range rather than in fixed page widths keeps the first and
    // last dot pinned to the two ends however the cap lands — the last
    // screenful is always a part-page, so page widths would overshoot it.
    const width = track.clientWidth;
    const dots = width > 0 ? Math.min(MAX_DOTS, Math.ceil(max / width) + 1) : 1;
    const step = dots > 1 ? max / (dots - 1) : 0;
    setDotCount(dots);
    setActiveDot(step > 0 ? Math.min(dots - 1, Math.round(travelled / step)) : 0);
  }, [trackRef]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    onScroll();
    // A resize changes how much of the rail fits — and, at the `sm` breakpoint,
    // whether it is a rail at all. Re-measuring on resize is what retires the
    // dots when the track becomes a grid.
    const observer = new ResizeObserver(onScroll);
    observer.observe(track);
    return () => observer.disconnect();
  }, [onScroll, trackRef]);

  // In an RTL container "further along" is a negative scrollLeft delta.
  const directionSign = (track: HTMLElement) =>
    getComputedStyle(track).direction === "rtl" ? -1 : 1;

  const scrollByPage = (direction: 1 | -1, ratio: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * directionSign(track) * track.clientWidth * ratio });
  };

  const scrollToDot = (dot: number) => {
    const track = trackRef.current;
    if (!track || dotCount < 2) return;
    const max = track.scrollWidth - track.clientWidth;
    track.scrollTo({ left: (directionSign(track) * dot * max) / (dotCount - 1) });
  };

  return { atStart, atEnd, dotCount, activeDot, onScroll, scrollByPage, scrollToDot };
}

// Hidden from assistive tech, like the rail arrows are: the track is already a
// list a screen reader walks item by item, and these only move the viewport
// over content that is in the DOM either way.
export function RailDots({
  count,
  active,
  onSelect,
  className = "",
}: {
  count: number;
  active: number;
  onSelect: (dot: number) => void;
  className?: string;
}) {
  if (count < 2) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="rail-dots"
      className={`flex items-center justify-center gap-0.5 ${className}`}
    >
      {Array.from({ length: count }, (_, dot) => (
        <button
          key={dot}
          type="button"
          tabIndex={-1}
          onClick={() => onSelect(dot)}
          className="group flex h-7 w-6 items-center justify-center"
        >
          <span
            className={
              dot === active
                ? "bg-accent-solid h-1.5 w-5 rounded-full transition-all"
                : "h-1.5 w-1.5 rounded-full bg-fg-faint transition-all group-hover:bg-fg-faint"
            }
          />
        </button>
      ))}
    </div>
  );
}

// The track's own classes, shared so a rail scrolls and hides its scrollbar the
// same way everywhere. Callers add the layout: how wide the items are, and —
// where the rail is a phone-only shape — what the container becomes at `sm`.
export const RAIL_TRACK_CLASS =
  "flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";
