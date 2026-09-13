The previous batch for this size tier did not meet its target.

{{DIAGNOSIS}}

Required band per document: {{TARGET_MIN_BYTES}}–{{TARGET_MAX_BYTES}} bytes (UTF-8,
serialized as JSON).

Generate a NEW batch of {{BATCH_COUNT}} recipe documents in one JSON array, in the order
listed below, applying the corrected counts. Keep the per-step and summary character
budgets UNCHANGED — correct the size by changing the NUMBER of structural elements,
never their length.

## Diversity requirement (items share this context — do not let them converge)

The {{BATCH_COUNT}} documents must be clearly distinct from one another:

- Each has a different cuisine and a different dish type, as assigned below.
- No two share the same primary ingredient.
- No two share the same principal cooking technique.
- Titles, summaries and step text must be written independently for each item. Do not
  reuse sentences, phrasings or step sequences across items.

## Per-item assignments (corrected)

| # | Cuisine | Dish type | Distinguishing angle | nutrients | ingredients | instruction sets | total steps |
|---|---|---|---|---|---|---|---|
{{ITEMS_TABLE}}

## Structural rules (every item)

- `nutrition.nutrients`, `extendedIngredients` and `analyzedInstructions` must contain
  EXACTLY the counts in the row.
- Distribute the total steps across the instruction sets as evenly as the recipe logic
  allows. Every set must contain at least two steps.

## Text length budgets (unchanged)

- Each `step` string: {{STEP_CHARS_MIN}}–{{STEP_CHARS_MAX}} characters.
- `summary`: {{SUMMARY_CHARS_MIN}}–{{SUMMARY_CHARS_MAX}} characters, including its
  `<b>` tags.

## Output

Return ONLY a JSON array of exactly {{BATCH_COUNT}} objects conforming to the response
schema, in row order. No wrapper object, no prose.
