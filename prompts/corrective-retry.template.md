The previous attempt did not meet the target for this item.

Measured result: {{MEASURED_BYTES}} bytes (UTF-8, serialized as JSON).
Required band:  {{TARGET_MIN_BYTES}}–{{TARGET_MAX_BYTES}} bytes.

{{DIAGNOSIS}}

Regenerate the document completely, applying the corrected counts below. Keep the
per-step and summary character budgets from the original request UNCHANGED — correct
the size by changing the NUMBER of structural elements, never their length.

| Element | Corrected required count |
|---|---|
| `nutrition.nutrients` | exactly {{NUTRIENT_COUNT}} |
| `extendedIngredients` | exactly {{INGREDIENT_COUNT}} |
| `analyzedInstructions` (instruction sets) | exactly {{INSTRUCTION_SET_COUNT}} |
| total steps across all sets | exactly {{STEP_COUNT}} |
