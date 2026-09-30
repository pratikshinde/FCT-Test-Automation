/** Scenario matrix — planner.md Section 7.3. One shared step-execution engine (engine.ts)
 * is driven by this table rather than bespoke code per scenario. */
export const SCENARIOS = [
  "all_pass",
  "verify_fail",
  "led_open",
  "wrong_led_colour",
  "relay_contact_high",
  "wrong_variant",
  "fixture_fault",
  "confirm_timeout",
  "board_removed_mid_test",
  "wifi_drop_mid_test",
] as const;

export type Scenario = (typeof SCENARIOS)[number];

/** Which test-plan `block` a step-level fault scenario targets. */
export const SCENARIO_TARGET_BLOCK: Partial<Record<Scenario, string>> = {
  led_open: "LED_SCAN",
  wrong_led_colour: "LED_SCAN",
  relay_contact_high: "RELAY_TEST",
};
