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
      const frame = detector.process(data);
      const disturbed = frame.status === 'motion' || frame.status === 'unstable' || frame.status === 'adapting';
      let blob = null;
      let event;
      if (disturbed) {
        // A flash changes one spot and nothing else. If the scene moved or the
        // lighting changed while a hit was forming, the hit is not trusted.
        lastDisturbedT = t;
        event = grouper.cancel('motion');
      } else {
        if (frame.status === 'ok' && t - lastDisturbedT >= params.settleMs) blob = frame.best;
        event = grouper.push(t, blob);
      }
      return {
        status: frame.status,
        candidateFraction: frame.candidateFraction,
        motionFraction: frame.motionFraction,
        blob,
        event: decorate(event),
      };
    },

    flush() {
      return decorate(grouper.flush());
    },
  };
}
