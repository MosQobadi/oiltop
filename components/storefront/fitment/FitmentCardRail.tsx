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

export function FitmentCardRail({
  label,
  cards,
  restLayout,
  cardWidthClass,
  className = "",
}: {
  /** Names the list for a screen reader — the category, plus its climate if it has one. */
  label: string;
  cards: ReactNode[];
  /** What the track becomes from `sm` up, e.g. `sm:grid sm:grid-cols-2`. */
  restLayout: string;
  /**
   * `FITMENT_CARD_WIDTH_CLASS`, handed down rather than imported: this module is
   * `"use client"`, so a constant exported from here reaches the Server
   * Component that renders the section as a client reference, not a string.
   */
  cardWidthClass: string;
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
          <li key={index} className={`flex-none snap-start ${cardWidthClass}`}>
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
