// LaserRange short-flash sweep. UNO-compatible board, LED on D8.
// D8 -> 220/330 ohm resistor -> LED anode; LED cathode -> GND. (Same wiring as FlashTest.)
//
// Reset or power-on: wait 15 s, then
//   1. a marker: 3 flashes of 100 ms, half a second apart
//   2. six sets of 20 flashes, each set shorter than the last: 50, 30, 20, 10, 5, 2 ms
// with a 3 s pause after the marker and after every set. Then it stays off.
// 123 flashes in all, about 2 min 40 s from reset to the last flash.
//
// Why the odd 1037 ms between flashes: the camera takes a frame every 16.67 ms,
// and 1000 ms is exactly 60 frames. Flashing once a second would hit the same
// point in the camera's frame cycle every time, so a short flash would be
// caught every time or missed every time by luck. 1037 ms moves each flash
// 3.67 ms along the cycle, so a set of 20 samples it evenly.
//
// Nothing is sent over serial on purpose: sending blinks the board's own TX
// light, which the camera could see. The counts are fixed instead.
//
// This is an LED, not the laser cartridge. It shows which flash lengths the
// camera and the app can catch from this light; it does not show that the
// cartridge will be detected.
const byte LED_PIN = 8;
const unsigned long START_DELAY_MS = 15000;

const byte MARKER_COUNT = 3;
const unsigned int MARKER_FLASH_MS = 100;
const unsigned int MARKER_PERIOD_MS = 500;

const unsigned int FLASH_LENGTHS_MS[] = {50, 30, 20, 10, 5, 2};
const byte SET_COUNT = sizeof(FLASH_LENGTHS_MS) / sizeof(FLASH_LENGTHS_MS[0]);
const byte FLASHES_PER_SET = 20;
const unsigned int PERIOD_MS = 1037;
const unsigned int SET_GAP_MS = 3000;

// Each flash starts at a planned time counted from the first marker flash, so
// small delays inside the loop do not add up over the run.
unsigned long startUs = 0;

void waitUntilMs(unsigned long sinceStartMs) {
  const unsigned long targetUs = sinceStartMs * 1000UL;
  while (micros() - startUs < targetUs) {
  }
}

void flashAt(unsigned long sinceStartMs, unsigned int lengthMs) {
  waitUntilMs(sinceStartMs);
  digitalWrite(LED_PIN, HIGH);
  waitUntilMs(sinceStartMs + lengthMs);
  digitalWrite(LED_PIN, LOW);
}

void setup() {
  digitalWrite(LED_PIN, LOW);
  pinMode(LED_PIN, OUTPUT);
  delay(START_DELAY_MS);

  startUs = micros();
  unsigned long t = 0;
  for (byte i = 0; i < MARKER_COUNT; ++i) {
    flashAt(t, MARKER_FLASH_MS);
    t += MARKER_PERIOD_MS;
  }
  t += SET_GAP_MS;

  for (byte set = 0; set < SET_COUNT; ++set) {
    for (byte i = 0; i < FLASHES_PER_SET; ++i) {
      flashAt(t, FLASH_LENGTHS_MS[set]);
      t += PERIOD_MS;
    }
    t += SET_GAP_MS;
  }
}

void loop() {
  // Deliberately stopped. Press RESET to repeat the test.
}
