import { describe, expect, it } from 'vitest';
import { checkCameraSupport, describeCameraError } from './errors.js';
import { analyzePixels } from './frameSampler.js';
import { buildConstraints, withoutDeviceIds } from './stream.js';

describe('checkCameraSupport', () => {
  it('flags an insecure (http) page before anything else', () => {
    const result = checkCameraSupport({ isSecureContext: false, hasMediaDevices: false });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('insecure-context');
  });

  it('flags a browser without getUserMedia', () => {
    expect(checkCameraSupport({ isSecureContext: true, hasMediaDevices: false }).code).toBe('unsupported');
  });

  it('passes when both preconditions hold', () => {
    expect(checkCameraSupport({ isSecureContext: true, hasMediaDevices: true })).toEqual({ ok: true });
  });
});

describe('describeCameraError', () => {
  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['SecurityError', 'permission-denied'],
    ['NotFoundError', 'no-camera'],
    ['NotReadableError', 'camera-busy'],
    ['OverconstrainedError', 'unsupported-settings'],
    ['AbortError', 'aborted'],
  ])('maps %s to %s', (name, code) => {
    const problem = describeCameraError({ name });
    expect(problem.code).toBe(code);
    expect(problem.title.length).toBeGreaterThan(0);
    expect(problem.detail.length).toBeGreaterThan(0);
  });

  it('falls back to a generic message that includes the original error', () => {
    const problem = describeCameraError(new TypeError('boom'));
    expect(problem.code).toBe('unknown');
    expect(problem.detail).toContain('boom');
  });

  it('copes with non-error values', () => {
    expect(describeCameraError(undefined).code).toBe('unknown');
  });
});

describe('buildConstraints', () => {
  it('asks for the rear camera with ideal (never exact) values', () => {
    const { audio, video } = buildConstraints({ frameRate: 60, width: 1920, height: 1080 });
    expect(audio).toBe(false);
    expect(video).toEqual({
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60 },
    });
  });
});

describe('withoutDeviceIds', () => {
  it('removes device identifiers and keeps everything else', () => {
    expect(withoutDeviceIds({ deviceId: 'abc', groupId: 'def', width: 640, frameRate: 30 })).toEqual({ width: 640, frameRate: 30 });
  });

  it('passes null through', () => {
    expect(withoutDeviceIds(null)).toBeNull();
  });
});

describe('analyzePixels', () => {
  const rgba = (...pixels) => new Uint8ClampedArray(pixels.flatMap(([r, g, b]) => [r, g, b, 255]));

  it('handles an empty frame', () => {
    expect(analyzePixels(new Uint8ClampedArray(0))).toEqual({ meanLuma: 0, peakRedness: 0, saturatedFraction: 0 });
  });

  it('reports zero redness for neutral greys', () => {
    const result = analyzePixels(rgba([100, 100, 100], [200, 200, 200]));
    expect(result.peakRedness).toBe(0);
    expect(result.meanLuma).toBeCloseTo(150, 6);
    expect(result.saturatedFraction).toBe(0);
  });

  it('picks out a single red pixel among grey ones', () => {
    const result = analyzePixels(rgba([90, 90, 90], [240, 40, 30], [90, 90, 90], [90, 90, 90]));
    expect(result.peakRedness).toBe(200);
  });

  it('does not treat a white (blown-out) pixel as red, but counts it as saturated', () => {
    const result = analyzePixels(rgba([255, 255, 255], [10, 10, 10]));
    expect(result.peakRedness).toBe(0);
    expect(result.saturatedFraction).toBe(0.5);
  });
});
