// LaserRange physical LED test. UNO-compatible board, LED on D8.
// D8 -> 220/330 ohm resistor -> LED anode; LED cathode -> GND.
// Reset or power-on: wait 15 s, emit 30 pulses, then remain off.
const byte LED_PIN = 8;
const unsigned int FLASH_MS = 100;
const unsigned int PERIOD_MS = 1000;
const byte FLASH_COUNT = 30;
const unsigned long START_DELAY_MS = 15000;
static_assert(FLASH_MS < PERIOD_MS, "Flash must be shorter than period");

void setup() {
  digitalWrite(LED_PIN, LOW);
  pinMode(LED_PIN, OUTPUT);
  delay(START_DELAY_MS);
  for (byte i = 0; i < FLASH_COUNT; ++i) {
    digitalWrite(LED_PIN, HIGH);
    delay(FLASH_MS);
    digitalWrite(LED_PIN, LOW);
    delay(PERIOD_MS - FLASH_MS);
  }
}

void loop() {
  // Deliberately stopped. Press RESET to repeat the test.
}
