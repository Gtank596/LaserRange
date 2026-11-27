import { createEventGrouper } from './eventGrouper.js';
import { createFrameDetector } from './frameDetector.js';
import { DEFAULT_DETECTION_PARAMS, hitConfidence } from './params.js';

/**
 * Frame detector + event grouper as one unit: feed it frames, get hits.
 * @param {number} width  working image width in pixels
 * @param {number} height working image height in pixels
 * @param {Partial<typeof DEFAULT_DETECTION_PARAMS>} [overrides]
 * @param {{ mask?: Uint8Array | null }} [options] see createFrameDetector
 */
export function createFlashPipeline(width, height, overrides = {}, options = {}) {
  const params = { ...DEFAULT_DETECTION_PARAMS, ...overrides };
  const detector = createFrameDetector(width, height, params, options);
  const grouper = createEventGrouper(params);
  let lastDisturbedT = -Infinity;
  let largeSince = null;
  let firstT = null;

  const decorate = (event) => {
    if (!event) return null;
    // Something that stays lit is part of the scene now: let the background take it.
    if (!event.accepted && event.reason === 'persistent') detector.absorb();
    if (event.accepted) event.confidence = hitConfidence(event, params);
    return event;
  };

  return {
    width,
    height,
    params,

    /**
     * @param {Uint8ClampedArray | Uint8Array} data RGBA pixels
     * @param {number} t frame time in ms
     */
    process(data, t) {
      if (firstT === null) firstT = t;
      if (t - firstT < params.warmupMs) {
        // The camera has just started and is still settling. Count nothing,
        // and let the background follow the picture so that whatever is in
        // view when the warm-up ends is the starting point.
        detector.absorb(1);
        const settling = detector.process(data);
        lastDisturbedT = t;
        return {
          status: 'warming',
          candidateFraction: settling.candidateFraction,
          motionFraction: settling.motionFraction,
          largest: null,
          largestFraction: 0,
          blob: null,
          event: null,
        };
      }
      const frame = detector.process(data);
      const disturbed = frame.status === 'motion' || frame.status === 'large' || frame.status === 'unstable' || frame.status === 'adapting';
      let blob = null;
      let event;
      if (disturbed) {
        // A flash changes one spot and nothing else. If the scene moved or the
        // lighting changed while a hit was forming, the hit is not trusted.
        lastDisturbedT = t;
        event = grouper.cancel(frame.status === 'large' ? 'large' : 'motion');
        // A big lit area that stays is part of the scene now (a lamp switched
        // on, something red put in view): let the background take it, or
        // nothing would be detected for as long as it stays.
        if (frame.status === 'large') {
          if (largeSince === null) largeSince = t;
          else if (t - largeSince > params.maxEventMs) {
            detector.absorb();
            largeSince = null;
          }
        }
      } else {
        largeSince = null;
        if (frame.status === 'ok' && t - lastDisturbedT >= params.settleMs) blob = frame.best;
        event = grouper.push(t, blob);
      }
      return {
        status: frame.status,
        candidateFraction: frame.candidateFraction,
        motionFraction: frame.motionFraction,
        largest: frame.largest,
        largestFraction: frame.largest ? frame.largest.fraction : 0,
        blob,
        event: decorate(event),
      };
    },

    flush() {
      return decorate(grouper.flush());
    },
  };
}
