# LaserRange

A private, installable web app that watches a printed target through the phone camera, detects the flash from a
laser dry-fire training cartridge, scores hits, and saves sessions on the device. A gift project; no backend, no
accounts, no uploads.

**Status (Nov 27, 2026): milestones 1 to 5 of 7 built, 6 under way.** The dashboard shows clearly labeled
sample data. The camera check is real and measures frame timing. Flash detection works on simulated flashes and
stays quiet on a still real camera. With an LED test light, the app on the phone counted 30 of 30 flashes of
100 ms, and in a sweep of shorter ones every flash from 50 ms down to 5 ms and 19 of 20 at 2 ms, with no false
hits (one run each; see "First real flashes" and "Short flashes"). An LED is not the laser: a real cartridge is
untested. Target calibration and ring scoring
work on the test pattern; they have not been tried on a printed target. Live sessions, on-device saving and
History are built. Two sessions have been run on the phone against the LED sweep, the second one with no
connection: 123 of 123 flashes counted each time, saved, and read back from History. A third session tried
pause on the phone: the nine flashes sent during the pause and the warm-up after it were left out, as intended.
History's trend charts and the first-run welcome with its safety reminder are built and checked in a desktop
browser only. A scored session (with a calibration on a printed target) has not been run.

## What works today

| Area | State |
|---|---|
| Dashboard (stats, target overlay, navigation) | Built. Shows the most recent saved session; until one exists, sample data that is labeled as such |
| Camera check: start/stop, permission and HTTPS errors, frame timing, processing cost, brightness, report export | Built; run on an iPhone (see "Measured so far") |
| Test pattern source (no camera needed) | Built; software-only |
| Flash detection: red-spot finder, one hit per flash, rejection of lighting changes, movement and lingering red objects | Built; 33 deterministic unit tests on synthetic frames |
| Detection lab: runs detection on the test pattern and scores it against the flashes it drew; can also watch the rear camera | Built; run on an iPhone on the test pattern, on a still camera scene and on the LED test light (see "Measured so far"). **LED flashes: 30 of 30 at 100 ms; 20 of 20 at each of 50, 30, 20, 10 and 5 ms; 19 of 20 at 2 ms; no false hits. One run each. A laser is untested** |
| LED test light (Arduino): 30 flashes of 100 ms, one per second; a sweep of shorter flashes | Built by hand; sketches in `hardware/`. Both have been run against the phone |
| Printable target: 180 mm square with a 5 mm black border (added Nov 28 so the app can find it; earlier prints have only a thin line and must be reprinted), 10 rings, 50 mm check bar inside the square; the measured length of the bar can be entered so millimetre figures are right at any print size | Built. The first print (Nov 27, the earlier 190 x 210 mm sheet) came out at 95%: the bar measured 47.5 mm. The sheet was then cut down to 183 x 183 mm, and the second print's bar measured 1 15/16 in (49.2 mm, 98.4%) on a ruler marked in sixteenths. On that ruler 50 mm falls halfway between the 1 15/16 and 2 inch marks, so this is between about 97% and 100%. The measurement can be entered in millimetres or inches, of the bar or of one side of the square. **A measurement of the square's side, which would settle it, has not been taken** |
| Calibration: the app finds the printed square by its black border and places four markers on its corners; the markers can also be dragged, with a magnifier and keyboard nudging; rings are drawn over the picture to confirm the fit; saved on the device | Built. Finding the square: 18 unit tests on drawn pictures of the sheet (angled, noisy, unevenly lit, on light and dark walls, and things that must not be mistaken for it), corners within 1.5 pixels; on the app's test pattern it places the markers exactly. **Never run on a photo of the printed sheet, and nothing has been tried on a phone or a printed target** |
| Perspective correction and ring scoring | Built; 19 unit tests with known points seen at an angle. In the lab on the calibrated test pattern, 8 of 8 hits got the expected ring, positions within 0.05% of the ring radius |
| Detection limited to the calibrated target area | Built and unit tested |
| Live session: counts each flash once, places it on the target and scores it when a calibration is in use, asks the phone to keep its screen awake | Built; run on the test pattern in a desktop browser, with and without a calibration, and twice on the iPhone without a calibration (see "A session on the phone" and "A session with no connection"). **A scored session on a printed target has not been run** |
| Pause and resume: counting and the session clock stop, the camera stays open, and resuming starts with the 2-second warm-up again | Built; 6 unit tests on the clock. In a desktop browser on the test pattern the clock stood still while paused, nothing was counted, and hits were counted again after resuming. Run once on the iPhone (see "A paused session on the phone") |
| Saved sessions (IndexedDB on the device) and History: list, one session in full, copy as JSON, delete | Built; 15 unit tests against a stand-in database, and saved, reloaded and deleted in a desktop browser. On the iPhone two sessions were saved and exported from History. **Whether they survive closing the app or restarting the phone is not recorded** |
| Trend charts in History: accuracy, group size and hits per session, oldest to newest, simulated sessions left out | Built; 13 unit tests on which sessions go into which chart and where the points are drawn. Checked in a desktop browser with made-up records, since removed. **Not seen on the iPhone, and never with real scored sessions** |
| Offline use: a service worker keeps a copy of each build on the device; opening the app asks the network first and falls back to the saved copy; the home screen shows whether a copy is saved | Built; 5 unit tests on how the file list is made. In a desktop browser with the server switched off, the built app reloaded, ran and saved a test-pattern session, and showed History. On the iPhone it was reported working, and a camera session was run and saved with no connection (see "A session with no connection") |
| First-run welcome: what the app does, the safety reminder, what to expect from the camera prompt. Shown in place of every screen until acknowledged on the device, and readable again from the dashboard | Built; 6 unit tests on remembering the acknowledgement. Checked in a desktop browser. **Not seen on the iPhone** |
| Printable guide, QR card | Not built |

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

### Detection lab on the iPhone (test pattern only)

Five runs on Nov 23, 2026, build `b69ef11`, installed app, Normal sensitivity unless noted. Simulated flashes
drawn by the app itself, so this checks the software path at the phone's real frame rate (about 60 fps), not a
camera. Each run is only 14 to 23 flashes.

| Test flash | Found | Missed | False hits |
|---|---|---|---|
| 100 ms, full strength | 15 of 15 | 0 | 0 |
| 33 ms, full strength | 14 of 14 | 0 | 0 |
| 1 screen frame, full strength | 11 of 15 | 4 | 0 |
| 1 screen frame, full strength, High sensitivity | 10 of 14 | 4 | 0 |
| 1 screen frame, 15% strength | 0 of 23 | 23 (expected: below the threshold) | 0 |

- Detection plus frame copy cost **3.5 ms per frame** at 320 px wide, about a fifth of the 16.7 ms budget.
- Position error was 0.1% of the frame.
- Flashes spanning two or more frames were always found. A flash living in a single screen frame was missed about
  a quarter of the time, and raising sensitivity did not help. The likely reason is that the frame never reached
  the detector (the test pattern's own video capture can skip a frame), but those runs did not record frame
  delivery, so that is not confirmed. Lab reports from version 2 on include delivery figures.
- The point to carry forward: **a flash that fits inside one frame is the fragile case.** How long the real
  cartridge's flash lasts is the number that matters most, and it is still unknown.

**Cause of the single-frame misses, confirmed** (build `1c6d686`, 40 flashes): the test pattern was being drawn at
120 fps (the screen's refresh rate) while video reached the detector at 58 fps with no missed frames. A flash
drawn for one 8 ms screen frame is gone before the next video frame about half the time: 26 of 40 never reached
the detector, and all 14 that did were found at full strength. The shortest test flash is now one video frame.

### First runs on the real rear camera

Nov 23, 2026, build `1c6d686`, installed app, phone propped, pointed at a plain still scene. Daylight with the
shades closed (medium brightness). Detection at 320 x 569 pixels.

| Run | Sensitivity | Length | Hits | Rejected | Notes |
|---|---|---|---|---|---|
| Still scene | Normal | 2610 frames (~44 s) | 0 | 0 | |
| Still scene | High | 3164 frames (~53 s) | 0 | 0 | 2 frames not delivered |
| Hand waved twice, room light switched off and on | Normal | 2126 frames (~35 s) | **3 false** | 7 | |

- Frames arrived at 59.85 fps; detection plus frame copy cost 5.7 to 5.9 ms per frame.
- On a still scene there were no false hits even at High sensitivity, over about 97 seconds in total. One scene,
  one lighting condition.
- The three false hits during the disturbance run were all barely over the threshold (peak 60.5 to 62.7 against a
  threshold of 60), one frame long, 2 to 9 pixels. Which disturbance caused them was not recorded; skin tones
  moving through view are the likely source.
- In response the detector now skips frames where anything other than the spot itself changed, and discards a hit
  if the scene was disturbed while it was forming.
- **Retest with that change** (build `cd9f33e`, same scene, same disturbance, 2802 frames, ~47 s): **0 hits**.
  22 frames were flagged as movement and skipped. Between-frame change was 0% of the picture at the median and
  reached 43% at its peak (the light switch). One run, so this shows the fix works here, not how often it would
  fail.
- No real red flash had been shown to the camera at this point.

### First real flashes: the LED test light

Nov 25, 2026, build `67f1933`, installed app, evening indoor light. The test light is a red LED on a breadboard
driven by `hardware/FlashTest`: after a 15 second wait it sends 30 flashes, each 100 ms long, one per second, then
stops. Lab settings: Source Rear camera, Sensitivity Normal, no calibration. An LED is not a laser; these runs say
nothing about the cartridge.

| Run | Setup | Length | Hits | Rejected | Notes |
|---|---|---|---|---|---|
| 1 | Phone held by hand, LED on a white surface | 2441 frames (~41 s) | 29 | 51 | Not interpretable: the phone was moving |
| 2 | Phone propped, breadboard on grey carpet in front of a white wall | 2543 frames (~42 s) | 1 | 20 | The one hit came from bumping the phone before the flashes began. **None of the 30 flashes was counted** |

What run 2 showed, from the report and a screen recording of the same run:

- **The camera delivered every flash.** All 30 are in the screen recording, each visible for 4 to 6 recorded
  frames, one second apart. Frames reached the detector at 59.85 fps with none missed.
- **The detector saw them and threw them away.** 188 frames were flagged "movement", about six per flash. The lit
  LED did not look like a dot: it lit the white breadboard under it and the wall behind it, a red area of about 2%
  of the picture. The limit for a dot is 1%, and at the time anything larger was filed under movement.
- **Replaying the recording through the detector on a PC** (16 seconds, 10 flashes, cropped and shrunk to 320
  pixels wide) reproduced this: 0 hits with the 1% limit, **10 of 10 hits with a 5% limit**, each 83 to 100 ms
  long, 1000 ms apart, at the same place. A screen recording is a re-compressed copy of the preview, so this is
  strong evidence, not the measurement itself; the phone run with the new build is still to do.
- In the same replay a flash's own glow used up most of the allowance for "movement elsewhere" (up to 0.29% of the
  picture against a limit of 0.3%).

Changes made in response:

- A lit area too big to be a dot is now reported as that ("large"), on screen and in the report, instead of as
  movement. If it stays for more than 400 ms the background absorbs it, so it cannot block detection for good.
- The movement check now allows for a flash's own glow: near a spot, change in one direction only (brighter when it
  comes on, darker when it goes off) is part of the flash. Change in both directions near the spot, or any change
  away from it, still counts as movement. In the replay the unexplained change fell from 0.29% to 0.12%.
- The lab has a "Dot size limit" setting (Normal 1%, Large 5%) so a bare LED can be used for timing tests.
- Lab reports (version 5) now carry a time for every hit, the details of every rejection, and every stretch of
  ignored video with its cause and size.

**Run 3, with those changes** (build `09c8b02`, phone propped, bare LED, Sensitivity Normal, Dot size limit Large,
2182 frames, ~36 s):

| Flashes sent | Hits | Missed | False hits | Frames missed by the camera |
|---|---|---|---|---|
| 30 | **30** | 0 | 0 | 0 of 2182 |

- Every hit was 6 or 7 frames long (82 to 109 ms measured, against 100 ms sent) and the hits were 982 to 1009 ms
  apart, which is 1000 ms to within one frame.
- All 30 were placed within 0.3% of the picture's width and height of each other.
- The lit area was 683 to 753 pixels, about 0.4% of the view. That is under the normal 1% limit, unlike run 2
  (about 2%): the same LED can look five times bigger or smaller depending on distance and what it shines on. This
  run did not test the Normal limit.
- In the first 1.5 seconds, before any flash, two short stretches were flagged as movement and two red spots near
  the LED were rejected for staying lit over 400 ms. Nothing was counted as a hit. The cause was not recorded; the
  camera settling its exposure after starting is one possibility.
- One run, one LED, one lighting condition, 100 ms flashes. It shows the whole chain works on a real red flash of
  that length. It says nothing yet about short flashes.

### Short flashes: the LED sweep

Nov 27, 2026, build `14e2ee1`, installed app, phone propped, bare LED. Lab settings: Source Rear camera,
Sensitivity Normal, Dot size limit Large, no calibration. `hardware/FlashSweep` sends a 3-flash marker (100 ms)
and then 20 flashes each of 50, 30, 20, 10, 5 and 2 ms, 1037 ms apart so they do not stay in step with the camera's
frames. 123 flashes over 143 seconds; the run was 9422 frames (~157 s). The report gives a time for every hit, and
each hit was matched to the sketch's schedule by that time.

| Flash length | Sent | Hits | Frames per hit | Lit area (pixels of 182,080) |
|---|---|---|---|---|
| 100 ms (marker) | 3 | **3** | 6 | 4395 to 4685 |
| 50 ms | 20 | **20** | 3 or 4 | 4362 to 4766 |
| 30 ms | 20 | **20** | 2 or 3 | 2501 to 4566 |
| 20 ms | 20 | **20** | 2 | 2144 to 5201 |
| 10 ms | 20 | **20** | 1 or 2 | 636 to 2447 |
| 5 ms | 20 | **20** | 1 or 2 | 277 to 1154 |
| 2 ms | 20 | **19** | 1 | 147 to 329 |
| All | 123 | **122** | | |

- **No false hits.** Every one of the 122 hits falls on a scheduled flash; nothing was counted in the pauses
  between sets or in the 12 seconds after the last flash. The camera missed no frames (59.87 fps).
- **One 2 ms flash was missed**, the fifth of that set. Nine flashes later another 2 ms flash was only just
  caught (147 pixels, half the usual area, and about three quarters of the usual brightness). See the next point
  for why nine.
- **The flashes did step through the camera's frame cycle, but more slowly than designed.** The phone delivers a
  frame every 16.70 ms, not 16.67, so each flash moved roughly 1.5 to 2 ms along the cycle instead of 3.7 ms. In
  the 10, 5 and 2 ms sets the lit area rises and falls in a pattern that repeats about every 9 flashes, so each
  set of 20 covered the whole cycle about twice. The miss and the near-miss are one repeat apart, so there is a
  point in the cycle, a few milliseconds wide, where a 2 ms flash from this LED is weak or lost. Whether that is
  a gap between exposures or the flash being split across two frames was not determined.
- **A shorter flash looks smaller and dimmer, not just briefer.** The camera adds up light over each frame, so a
  2 ms flash lit about 300 pixels where a 50 ms flash lit about 4500. Detection of a short flash therefore
  depends on how bright the light is, which is exactly what differs between this LED and a laser.
- **The reported position moved with flash length.** Long flashes were placed at about (0.49, 0.54), the centre
  of the LED plus everything it lit up; 2 ms flashes at (0.50, 0.51), the LED itself. That is 3.5% of the
  picture's height. A position is the weighted centre of everything that lit up, so glow pulls it. Whether a
  laser dot on paper has enough glow for this to matter is unknown.
- The marker flashes lit about 2.5% of the view here against 0.4% in run 3, with the same LED. The Normal 1% limit
  would have thrown the longer flashes away.
- **The start-of-run artefact came back.** In the first 0.8 seconds, before any flash, 7 frames were flagged as
  movement and a red spot at the LED's position was rejected for staying lit over 400 ms. Nothing was counted.
  Same pattern as run 3, so it is not chance. The unlit LED has a red body; the camera settling after it starts
  is the likely cause, not confirmed. A shorter-lived version of this could be counted as a hit, so the detector
  should not count anything while the camera settles.
- **Change made in response (same day):** nothing is counted in the first 2 seconds of a run, and the background
  follows the picture closely during that time, so whatever is in view when the warm-up ends is the starting
  point. Two seconds, not one, because in run 3 the artefact lasted until 1.85 s. Checked on synthetic frames and
  on the test pattern in a desktop browser; **not yet run on the phone's camera**, so whether it removes the
  artefact there is unconfirmed. Lab reports are now version 6 and carry the warm-up length.
- One run, one LED, one distance, one lighting condition.

### A session on the phone

Nov 27, 2026, build `947e163`, installed app. The new session screen, not the lab: Source Rear camera, Sensitivity
Normal, Dot size limit Large, no calibration, bare LED, `hardware/FlashSweep` again. The session ran 167 seconds
and was exported from History as JSON.

| Flash length | Sent | Hits |
|---|---|---|
| 100 ms (marker) | 3 | **3** |
| 50, 30, 20, 10 and 5 ms | 20 each | **20 each** |
| 2 ms | 20 | **20** |
| All | 123 | **123** |

- Every hit falls on a scheduled flash, and the first hit is the first marker flash, 14.5 s in. Nothing was
  counted during the 2-second warm-up or anywhere else.
- This does not show the warm-up removed the start-of-run red spot: a session export lists hits only, and that
  spot was never counted as a hit before either. It shows the warm-up did no harm.
- The 2 ms set was 20 of 20 this time against 19 of 20 in the lab run. Two runs are too few to call 2 ms
  reliable or unreliable.
- The reported position again moved with flash length: about 3% of the picture's height between the longest and
  shortest flashes.
- The phone stayed awake for the whole 167 seconds. Whether that was the app's request or the phone's own
  Auto-Lock setting was not recorded.
- Saving and History work on the iPhone for this one session. Closing and reopening the app was not recorded.

### A session with no connection

Nov 27, 2026, build `275b675`, the first build that keeps a copy of itself on the phone. The test asked for:
open the app online once, close it, turn on Airplane Mode with Wi-Fi off, open it again from the home screen,
and run a session with Source Rear camera, Sensitivity Normal, Dot size limit Large, no calibration, against
`hardware/FlashSweep`. Gabriel reported that offline worked and sent the session exported from History.

| Flash length | Sent | Hits |
|---|---|---|
| 100 ms (marker) | 3 | **3** |
| 50, 30, 20, 10 and 5 ms | 20 each | **20 each** |
| 2 ms | 20 | **20** |
| All | 123 | **123** |

- The camera opened and the session was saved with no connection: the export exists, with `source` set to the
  rear camera and build `275b675`.
- Every hit falls on a scheduled flash. The first marker flash came 3.0 s into the session, one second after the
  warm-up ended, and was counted.
- The 2 ms set has now been 19, 20 and 20 of 20 in three runs: 59 of 60.
- The reported position moved more than before: the three 100 ms markers sit about 5.5% of the picture's height
  away from the 50 ms flashes, and the shortest flashes fall in between. This is a bare LED with a glow around
  it, so it says little about a small dot on paper, but it is a reminder that position has only been checked on
  the test pattern.
- Not reported back: which of the steps were done exactly as asked, what the home screen's offline label and the
  session's screen-awake line said, and whether the earlier session was still in History.

### A paused session on the phone

Nov 27, 2026, build `cc4e036`. Session screen, Source Rear camera, Sensitivity Normal, Dot size limit Large, no
calibration, `hardware/FlashSweep`. The session was paused once, part of the way through the 50 ms set, for
7.5 seconds, and exported from History.

| Flash length | Sent | Hits | Not counted |
|---|---|---|---|
| 100 ms (marker) | 3 | **3** | |
| 50 ms | 20 | **11** | 9, sent during the pause or the 2-second warm-up after it |
| 30, 20, 10 and 5 ms | 20 each | **20 each** | |
| 2 ms | 20 | **19** | 1 missed |
| All | 123 | **113** | |

- Pause did what it should. Flashes 1 to 4 of the 50 ms set were counted, the next nine were not, and counting
  picked up again with flash 14. The gap between the last hit before and the first hit after is 10.4 s, the
  right size for a 7.5 s pause plus the 2 s warm-up.
- The clock is right: length 153.0 s plus 7.5 s paused is 160.4 s, the same as the time between the saved start
  and end. After the pause the hits still land on their scheduled flashes, to within about one video frame,
  once the pause is taken out (checked at the start and end of each set, not hit by hit).
- The camera stayed open through the pause and carried on afterwards.
- One 2 ms flash was missed (the 13th), and the 4th, nine flashes earlier, was the only weak one of the run.
  The first lab sweep showed the same thing: its miss and its weak flash were also nine flashes apart. The
  flashes step through the camera's frame cycle and come back to the same place about every nine flashes, so
  there looks to be a short part of each frame cycle where a 2 ms flash is mostly not seen. Over four runs the
  2 ms set is 78 of 80.
- This matters for the laser: if the cartridge's pulse is only a few milliseconds, an occasional miss of this
  kind should be expected at 60 frames a second. The pulse length is still not known.

Still unknown: how big and bright a laser dot on paper looks to this camera, which decides whether 1% is the right
limit and whether a short pulse is caught; the cartridge's actual pulse length; flashes under 2 ms.

## How detection works

Each frame is shrunk to 320 pixels wide and compared with a slowly updating memory of the scene. Nothing is
counted in the first 2 seconds after starting, while the camera settles.

1. **Per pixel:** how much redder is it than it was (red minus the larger of green and blue)? A pixel also counts
   if it is blown out and much brighter than before, which is how the white centre of a bright dot is kept.
2. **Per frame:** changed pixels are grouped into regions. A region must be small (a dot, not a red shirt) and
   contain at least one genuinely red pixel. If a large share of the frame changes at once, the frame is treated
   as a lighting change or camera movement and skipped.
3. **Size check:** if any lit region is too big to be a dot, the frame is skipped and reported as "large".
4. **Movement check:** a flash changes its own spot and the glow around it, in one direction: brighter when it
   comes on, darker when it goes off. If other parts of the frame changed since the previous frame, or the area
   around the spot got both brighter and darker (an object arriving in one place and leaving another), something
   is moving in view; the frame is skipped and any hit that was forming is discarded.
5. **Across frames:** spots in consecutive frames at the same place become one hit. Something that stays lit
   longer than 400 ms is rejected as an object, and a second hit within 120 ms of the last is suppressed.

Known gap: a small reddish object entering the view slowly, with no trailing edge yet in frame, can still look
like a flash for a frame or two. Limiting detection to the calibrated target area (milestone 4) should reduce
this.

All thresholds live in `src/detection/params.js` and are untuned starting guesses. `src/simulation/exposureModel.js`
is an illustrative model of how a short flash overlaps a frame's exposure; it is for building test sequences and
must not be quoted as a capture rate.

## How calibration works

The printed target is a square with the rings centred inside it. Seen by a camera at an angle, the square appears
as a general four-sided shape. From the square's four corners, the app computes the perspective mapping
(a homography) between the picture and the flat sheet, so any spot in the picture can be placed on the target as if
viewed square-on. Because the printed sizes are known (180 mm square, 80 mm outer ring), a placed spot gets a ring
score, and distances can later be given in millimetres.

- The corners are the outer corners of the square's black border. Marker 1 goes on the top-left one, then
  clockwise.
- **Finding the square.** When the camera starts, and whenever "Find the square" is pressed, the app looks for the
  border in one frame (`src/calibration/findSquare.js`). It marks pixels clearly darker than their surroundings,
  groups the ones that touch, reduces each big hollow group's outline to four corners, re-draws each side as the
  best straight line through the outline, and accepts the result only if the picture is dark along the border
  band and light just inside and just outside it on all four sides. If nothing passes, it says so and the
  markers stay where they were. The markers can always be dragged afterwards.
- It needs the whole border in the picture, white paper showing all round it, and the square at least an eighth
  of the picture's shorter side. At 960 pixels across, the 5 mm border is about four pixels thick with the phone
  a metre away; much further and it becomes too thin to find.
- **It cannot tell how big the sheet printed.** A smaller sheet nearer the camera makes exactly the same picture
  as a bigger one further away, so size still comes from a ruler (see the print screen). The paper's own edges
  could serve as a known size (Letter is 215.9 mm wide), but only where they stand out from the wall, and trimmed
  paper would give a wrong answer; this is not built.
- A calibration is tied to the camera position. If the phone or the target moves, it is wrong until redone; the
  app cannot detect that yet.
- A calibration is only used with the source and picture size it was made with.
- With a calibration in use, detection watches only the target area, so movement elsewhere is ignored.

## Unverified assumptions

- **Calibration accuracy.** Checked against known points in software only. How precisely corners can be placed
  by hand on a phone, lens distortion, and a sheet that is not flat are all unmeasured.
- **Finding the square on real paper.** Tested on drawn pictures only. Glare on the ink, shadows across the
  border, curled paper, a patterned wall and other black-bordered things in view (a picture frame, a monitor)
  are all untried. The check for white paper outside the border means a sheet trimmed to the border, or mounted
  on something dark with no white showing, will not be found.
- **Print scale.** The first print came out at 95% (the 50 mm bar measured 47.5 mm). What shrank it is not
  known: a page cannot see the print window's or the printer's scaling, and the browser and settings used were
  not recorded. Two things were changed in response. The sheet's drawing went from 190 x 210 mm to 183 x 183 mm
  (the bar and caption moved inside the square), which fits inside half-inch margins on Letter and A4, so a
  browser has less reason to shrink it. And the print screen takes the bar's measured length, which corrects
  millimetre figures whatever the print size. Ring scores never depended on print size. The new sheet's bar
  measured 1 15/16 in (49.2 mm) on a sixteenth-inch ruler: closer, and within that ruler's reach of full size,
  but not shown to be exactly 100%. Measuring a side of the square (7 3/32 in at full size) would be about three
  and a half times finer. Even at 98.4% a 40 mm group would be off by well under a millimetre.
- **Detection settings.** Chosen against synthetic frames, plus one recording of an LED. The true size and
  brightness of a laser dot on paper are unmeasured, so the 1% dot size limit is a guess. With a calibration the
  limit is 1% of the target area, which is smaller still and has never been tried on a real light.
- **The LED is not the laser.** It is far longer (100 ms so far), a different brightness, and lights up its
  surroundings. It can show whether the camera and detector catch a red flash of a given length; it cannot show
  that the cartridge will be detected.
- **Saved sessions staying saved.** Sessions are in the browser's own on-device database. Safari can clear a
  website's storage after weeks without a visit; an app on the home screen is treated more generously. Not yet
  checked on the iPhone: closing and reopening the app, and a restart of the phone.
- **Offline use on the iPhone.** Reported working once, with a camera session run and saved (see "A session with
  no connection"). Not checked: how long the iPhone keeps the saved copy, Safari as opposed to the home-screen
  app, and picking up a new build after a spell offline.
- **Pause on the iPhone.** Worked for one 7.5-second pause. Whether the iPhone leaves the camera open for a
  pause of several minutes has not been tried. Locking the phone still ends the session.
- **Keeping the screen awake.** A session asks the phone not to lock, because a locked phone stops the camera and
  ends the session. Whether the iPhone grants this, in Safari and as a home-screen app, has not been checked. The
  session screen says whether it was granted.
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
hardware/               Arduino sketches for the LED test light (LedBlink: wiring check; FlashTest: 30 flashes of 100 ms; FlashSweep: 50 ms down to 2 ms)
public/                 manifest and icons (PNG icons generated by scripts/make-icons.mjs)
scripts/make-icons.mjs  dependency-free icon generator: npm run icons
src/
  main.js               entry: routes -> screens
  app/                  router, shared state, build label, wake lock, the first-run welcome's memory, screens (welcome, home, session, history, calibrate, print, camera, lab)
  camera/               stream, video session, frame loop, frame statistics, pixel sampler, feature probe, error messages
  detection/            frame detector, region finder, hit grouping, settings, scoring against ground truth
  calibration/          perspective mapping, finding the printed square in a picture, target definitions and printable sheet, print scale, ring scoring, saved calibration
  sessions/             session records and totals, the session clock (pauses left out), trend numbers for History, on-device storage (IndexedDB), sample data for the empty dashboard
  pwa/                  service worker template, the build step that fills it in, registration
  simulation/           test-pattern video source, synthetic frames for tests, illustrative exposure model
  ui/                   icons, target overlay, session summary, trend charts
  styles/               design tokens and app styles
```

Tests live next to the code they cover as `*.test.js`. Logic that can be pure (statistics, scoring, error
classification, pixel analysis) is kept free of DOM access so it can be tested in Node.

## Scoring definitions (open to change)

- **Score**: sum of ring values, 10 at the centre down to 1 at the outer ring; a hit on a line gets the higher ring.
- **Accuracy**: points scored / points possible for the hits that were detected. It cannot account for shots the
  camera never saw.
- **Group size**: the widest distance between any two hits, in millimetres, taken from the target's printed size.
  It is right if the sheet printed at 100%, or if the check bar's measured length was entered on the print screen
  before the session (each scored session keeps the print scale it was run with).
- **Not scored**: a session run without a calibration. Hits are counted and their place in the picture is kept;
  no score, accuracy or group size is given.
- **Simulated**: a session run on the test pattern. It is saved and labeled as simulated wherever it appears.
- **Length and hit times**: time spent watching. Pauses are left out of both, and the total time paused is
  saved separately.
- **Trend charts**: one point per saved session, oldest on the left, each chart on its own scale starting at
  zero. Simulated sessions are left out; accuracy and group size use scored sessions only; a chart needs two
  sessions; the latest 20 are drawn.
- A session is saved automatically when it ends with at least one hit, and can be deleted afterwards. A session
  with no hits is not saved.

## Roadmap

1. ~~Scaffold, theme, dashboard~~
2. ~~Camera permission flow, preview, frame telemetry~~ (iPhone run pending)
3. ~~Simulation: controllable synthetic flashes and deterministic detection fixtures~~ (full-frame-rate run pending)
4. ~~Calibration: four-corner overlay, homography, known-point tests~~ (printed-target run pending)
5. ~~Arduino LED fixture~~: built; 30 of 30 flashes of 100 ms and 122 of 123 in the short-flash sweep counted (a dot-sized light still to run)
6. Real pipeline: detection on camera frames, thresholds, measured hit/miss rates (**go/no-go Dec 5**)
7. ~~Sessions, IndexedDB, history, trend charts, pause, offline service worker~~ (a scored session, pause and
   the charts still to try on the phone), ~~first-run welcome with the safety reminder~~; still to build:
   printable guide and QR card
