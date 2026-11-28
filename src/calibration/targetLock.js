// Decides when the target has really been found at the start of a session.
//
// One look at one frame is not enough: the camera may still be settling its
// exposure, or the phone may still be moving in someone's hand. The square
// has to be found in consecutive looks, in the same place each time, before
// a session lines itself up on it.

/**
 * @param {{ agreeWithin?: number, needed?: number }} [options]
 *   agreeWithin: how far any corner may move between looks, as a share of the picture
 *   needed: consecutive looks that must agree
 */
export function createTargetLock({ agreeWithin = 0.008, needed = 2 } = {}) {
  /** @type {{ x: number, y: number }[] | null} */
  let previous = null;
  let agreed = 0;

  return {
    /**
     * @param {{ found: boolean, corners?: { x: number, y: number }[] }} result from findTargetSquare
     * @returns {{ locked: boolean, corners: { x: number, y: number }[] | null }}
     */
    offer(result) {
      if (!result.found) {
        previous = null;
        agreed = 0;
        return { locked: false, corners: null };
      }
      const same =
        previous !== null && result.corners.every((corner, i) => Math.hypot(corner.x - previous[i].x, corner.y - previous[i].y) <= agreeWithin);
      agreed = same ? agreed + 1 : 1;
      previous = result.corners;
      return { locked: agreed >= needed, corners: result.corners };
    },
  };
}
