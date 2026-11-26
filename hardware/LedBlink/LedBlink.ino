// Wiring: D8 -> 220/330 ohm resistor -> LED anode; cathode -> GND.
// First hardware check: one second on, one second off.
const byte LED_PIN = 8;
void setup() {
  digitalWrite(LED_PIN, LOW);
  pinMode(LED_PIN, OUTPUT);
}
void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  delay(1000);
}
