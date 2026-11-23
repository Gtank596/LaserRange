import { createEventGrouper } from './eventGrouper.js';
import { createFrameDetector } from './frameDetector.js';
import { DEFAULT_DETECTION_PARAMS, hitConfidence } from './params.js';

/**
 * Frame detector + event grouper as one unit: feed it frames, get hits.
 * @param {number} width  working image width in pixels
 * @param {number} height working image height in pixels
 * @param {Partial<typeof DEFAULT_DETECTION_PARAMS>} [overrides]
 */
export function createFlashPipeline(width, height, overrides = {}) {
  const params = { ...DEFAULT_DETECTION_PARAMS, ...overrides };
  const detector = createFrameDetector(width, height, params);
  const grouper = createEventGrouper(params);

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
      const blob = frame.status === 'ok' ? frame.best : null;
      return {
        status: frame.status,
        candidateFraction: frame.candidateFraction,
        blob,
        event: decorate(grouper.push(t, blob)),
      };
    },

    flush() {
      return decorate(grouper.flush());
    },
  };
}
