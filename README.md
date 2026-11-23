# LaserRange

A private, installable web app that watches a printed target through the phone camera, detects the flash from a
laser dry-fire training cartridge, scores hits, and saves sessions on the device. A gift project; no backend, no
accounts, no uploads.

**Status (Nov 23, 2026): milestones 1 to 3 of 7.** The dashboard shows clearly labeled sample data. The camera
check is real and measures frame timing. Flash detection works on simulated flashes; it has not been measured
against a real camera, LED, or cartridge, and nothing is scored or saved yet.

## What works today

| Area | State |
|---|---|
| Dashboard (stats, target overlay, navigation) | Built, using sample data that is labeled as such |
| Camera check: start/stop, permission and HTTPS errors, frame timing, processing cost, brightness, report export | Built; run on an iPhone (see "Measured so far") |
| Test pattern source (no camera needed) | Built; software-only |
| Flash detection: red-spot finder, one hit per flash, rejection of lighting changes and lingering red objects | Built; 20 deterministic unit tests on synthetic frames |
| Detection lab: runs detection on the test pattern and scores it against the flashes it drew; can also watch the rear camera | Built; test pattern checked on desktop at about 1 frame per second only (throttled background tab). **Not yet run at full frame rate or on a camera** |
| Ring scoring maths | Built and unit tested; not yet connected to a camera |
| Calibration, sessions, history, offline service worker | Not built |

## Setup (Windows 11)

Requires Node.js 18 or newer (developed on 18.18). Node 18 is past end-of-life, so upgrading to the current LTS is
worthwhile when convenient; newer Vite versions need Node 20+.

```powershell
npm install
npm run dev        # http://localhost:5173 on this PC
npm test           # unit tests
npm run build      # production build into dist/
```

## Live site

**https://gtank596.github.io/LaserRange/**

Every push to `main` runs the tests, builds, and publishes here through GitHub Actions
(`.github/workflows/deploy.yml`). This is the simplest way to test on the iPhone: open the address in Safari, go to
**Camera check**, press **Start camera**, hold still for ~10 seconds, then **Copy report**.

## Testing on the iPhone from the local dev server (optional)

Browsers only allow camera access on `https://` pages (or `localhost`), so the phone cannot use the plain
`http://` dev address. Use this route to try changes on the phone before pushing them.

1. PC and iPhone on the same Wi-Fi.
2. Run `npm run dev:https`. Vite prints one or more `Network: https://<address>:5173/` lines.
3. The first time, Windows may ask whether to allow Node.js through the firewall. It needs access on **private**
   networks for the phone to connect.
4. On the iPhone, open the `https://` Network address in Safari. The certificate is self-signed, so Safari warns
   that the connection is not private: choose **Show Details**, then **visit this website**.
5. Open **Camera check**, press **Start camera**, allow the camera, hold still for ~10 seconds, then
   **Copy report** and save the text.

Not yet verified on a real iPhone: that Safari grants the camera after the certificate warning is accepted. If it
refuses, use the live site above, which has a properly trusted certificate (the offline service worker will need
that too).

### What to record from the first iPhone run

Run the camera check in **both** a Safari tab and the installed home-screen app, at each requested rate
(30 / 60 / 120), and keep the reports. The questions that decide the detection design:

- What frame rate is actually *observed* at each requested rate?
- Does the browser report `capabilities` (frame rate range, exposure, focus, torch, zoom)? Which ones?
- Are there long frame intervals or missed frames while the phone sits still?
- Does anything differ between the Safari tab and the installed app?

## Measured so far

Two short runs on Nov 23, 2026, both on the iPhone in the installed home-screen app, rear camera, 120 fps
requested. Two runs is thin evidence: treat these as first readings, not settled facts.

| | Run 1 | Run 2 |
|---|---|---|
| Conditions | Default Safari settings; 160 px analysis; report rebuilt every refresh; screen was scrolled during the run | After changing a Safari frame-rate setting and restarting the phone; 640 px analysis; build `b596ed9` |
| Frames measured | 236 (~4.5 s) | 511 (~8.5 s) |
| Camera's maximum frame rate | 60 | 60 |
| Observed rate | 52 fps | 59.99 fps |
| Frames missed | 34 of ~270 (13%) | **0** |
| Late frames (interval > 1.5x median) | 33 | 0 |
| Analysis cost per frame | 7.2 ms at 160 px | 7.0 ms at 640 px (copy in 1.5, read back 4.6, maths 1.0) |

What both runs agree on:

- **60 fps is the camera's ceiling in Safari.** `capabilities.frameRate.max` is 60 in both; a 120 request is
  delivered as 60. The Safari settings change did not move this.
- **No exposure control is exposed.** Capabilities list focus distance, torch, white balance mode and zoom, but no
  exposure mode, exposure time or ISO.
- **Media-clock timestamps are not usable.** Media time did not advance, so timing relies on callback timestamps,
  which Safari rounds to whole milliseconds.
- **Worker-based frame access exists.** `MediaStreamTrackProcessor` is available inside a worker (not on the main
  thread), with `VideoFrame`. Not used yet.

**Follow-up (reported verbally, no report saved):** with the Safari setting switched back to its default, a third
run was still a steady 60 fps with no missed frames. So the setting was not the cause, and a phone with default
Safari settings should behave the same. The missed frames in run 1 most likely came from scrolling during the run
or from rebuilding the report on every refresh (both were removed at once, so which one is not known).

Still unmeasured: whether a short flash is actually captured at 60 fps with automatic exposure. That needs the
LED fixture.

## How detection works

Each frame is shrunk to 320 pixels wide and compared with a slowly updating memory of the scene.

1. **Per pixel:** how much redder is it than it was (red minus the larger of green and blue)? A pixel also counts
   if it is blown out and much brighter than before, which is how the white centre of a bright dot is kept.
2. **Per frame:** changed pixels are grouped into regions. A region must be small (a dot, not a red shirt) and
   contain at least one genuinely red pixel. If a large share of the frame changes at once, the frame is treated
   as a lighting change or camera movement and skipped.
3. **Across frames:** spots in consecutive frames at the same place become one hit. Something that stays lit
   longer than 400 ms is rejected as an object, and a second hit within 120 ms of the last is suppressed.

All thresholds live in `src/detection/params.js` and are untuned starting guesses. `src/simulation/exposureModel.js`
is an illustrative model of how a short flash overlaps a frame's exposure; it is for building test sequences and
must not be quoted as a capture rate.

## Unverified assumptions

- **Detection settings.** Chosen against synthetic frames only. Real camera noise, auto-exposure shifts, the true
  size and brightness of the laser dot, and hand movement are all unmeasured.
- **Frame rate.** Requested values are hints. 120 fps was not available in the one run so far (see above); a Safari
  tab has not been measured separately from the installed app.
- **Flash capture.** Frame timing says when frames reach the page, not how long the sensor exposed each frame.
  Whether a short flash is caught depends on exposure and rolling-shutter timing, which the page may not be able
  to read or control. This has to be measured with the LED fixture, not inferred from frame rate.
- **Pulse duration.** The Pink Rhino's pulse length is unknown. Nothing in the code assumes one.
- **Frame metadata.** `requestVideoFrameCallback` fields for camera streams differ between browsers; "frames
  missed" shows "not reported" when the browser does not supply the count.
- **Installed mode.** Camera behaviour in the home-screen app can differ from a Safari tab.
- **Hardware.** Compatibility with the cartridge and the firearm is unverified until tested safely after the
  gift exchange. The app never claims a firearm is safe or unloaded.

## Project layout

```text
index.html
public/                 manifest and icons (PNG icons generated by scripts/make-icons.mjs)
scripts/make-icons.mjs  dependency-free icon generator: npm run icons
src/
  main.js               entry: routes -> screens
  app/                  router, shared state, build label, screens (home, camera, lab, placeholders)
  camera/               stream, frame loop, frame statistics, pixel sampler, feature probe, error messages
  detection/            frame detector, region finder, hit grouping, settings, scoring against ground truth
  calibration/          ring scoring (homography arrives in milestone 4)
  sessions/             sample data (real sessions arrive in milestone 7)
  simulation/           test-pattern video source, synthetic frames for tests, illustrative exposure model
  ui/                   icons, target overlay
  styles/               design tokens and app styles
```

Tests live next to the code they cover as `*.test.js`. Logic that can be pure (statistics, scoring, error
classification, pixel analysis) is kept free of DOM access so it can be tested in Node.

## Scoring definitions (open to change)

- **Score**: sum of ring values, 10 at the centre down to 1 at the outer ring; a hit on a line gets the higher ring.
- **Accuracy**: points scored / points possible for the hits that were detected. It cannot account for shots the
  camera never saw.

## Roadmap

1. ~~Scaffold, theme, dashboard~~
2. ~~Camera permission flow, preview, frame telemetry~~ (iPhone run pending)
3. ~~Simulation: controllable synthetic flashes and deterministic detection fixtures~~ (full-frame-rate run pending)
4. Calibration: four-corner overlay, homography, known-point tests
5. Arduino LED fixture with counted pulses over serial
6. Real pipeline: detection on camera frames, thresholds, measured hit/miss rates (**go/no-go Dec 5**)
7. Sessions, IndexedDB, history, offline service worker, printable guide and QR card
