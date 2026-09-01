"use client";

import { useRef, type ReactNode } from "react";
import { RailDots, RAIL_TRACK_CLASS, useRailScroll } from "../rail";

// A fitment section's cards, as a rail on a phone and as the grid they have
// always been from `sm` up.
//
// The results page routinely answers with four oils in a column — and with a
// HOT and a COLD column, eight. Stacked full-width on a 375px screen that is
// eight screenfuls of scrolling to read one category, and the engine-oil
// section alone measured 3,388px tall. Sideways, the same four are one
// screenful with the next one peeking, which is also the honest shape for what
// they are: co-equal options to swipe through, not a ranking to read down.
//
// One DOM, two layouts. `restLayout` is what the track becomes at `sm` — a grid
// for a standard section, a column for a climate one — so nothing re-renders at
// the breakpoint and the desktop page is byte-for-byte the markup it was. The
// dots need no breakpoint of their own: a grid does not overflow, so it
// measures one dot, and one dot renders nothing.

// Narrow enough that the second card is visibly cut off rather than merely
// close to the edge — the cut is the only affordance a touch rail gets.
const RAIL_ITEM_CLASS = "w-[62vw] max-w-[240px] min-w-[168px] flex-none snap-start";

// Every mobile-only measurement above has to be given back, or it leaks into
// the grid: `flex-none` is inert in a grid but the widths are not.
const RAIL_ITEM_RESET_CLASS = "sm:w-auto sm:max-w-none sm:min-w-0";

export function FitmentCardRail({
  label,
  cards,
  restLayout,
  className = "",
}: {
  /** Names the list for a screen reader — the category, plus its climate if it has one. */
  label: string;
  cards: ReactNode[];
  /** What the track becomes from `sm` up, e.g. `sm:grid sm:grid-cols-2`. */
  restLayout: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const rail = useRailScroll(trackRef);

  return (
    <div className={className}>
      <ul
        ref={trackRef}
        onScroll={rail.onScroll}
        aria-label={label}
        data-testid="card-rail"
        className={`gap-4 pb-1 sm:gap-5 sm:overflow-x-visible sm:pb-0 ${RAIL_TRACK_CLASS} ${restLayout}`}
      >
        {cards.map((card, index) => (
          <li key={index} className={`${RAIL_ITEM_CLASS} ${RAIL_ITEM_RESET_CLASS}`}>
            {card}
          </li>
        ))}
      </ul>

      <RailDots
        count={rail.dotCount}
        active={rail.activeDot}
        onSelect={rail.scrollToDot}
        className="mt-0.5"
      />
    </div>
  );
}
