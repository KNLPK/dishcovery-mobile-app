Generate {{BATCH_COUNT}} recipe documents in one JSON array, in the order listed below.

## Diversity requirement (items share this context — do not let them converge)

The {{BATCH_COUNT}} documents must be clearly distinct from one another:

- Each has a different cuisine and a different dish type, as assigned below.
- No two share the same primary ingredient (the ingredient the dish is built around).
- No two share the same principal cooking technique (for example: braising, grilling,
  steaming, deep-frying, fermenting, baking, raw assembly).
- Titles, summaries and step text must be written independently for each item. Do not
  reuse sentences, phrasings or step sequences across items.

## Per-item assignments

Follow each row exactly. Counts are the independent variable of the study.

| # | Cuisine | Dish type | Distinguishing angle | nutrients | ingredients | instruction sets | total steps |
|---|---|---|---|---|---|---|---|
{{ITEMS_TABLE}}

Do not restate the cuisine, dish type or angle labels verbatim in the output; use them to
shape the recipe. Each title must be specific to its row and must not repeat a common
generic name.

## Structural rules (every item)

- `nutrition.nutrients`, `extendedIngredients` and `analyzedInstructions` must contain
  EXACTLY the counts in the row.
- Distribute the total steps across the instruction sets as evenly as the recipe logic
  allows. Every set must contain at least two steps.

## Text length budgets

These are held CONSTANT across all size tiers and all items. Do not lengthen text to
reach a size.

- Each `step` string: {{STEP_CHARS_MIN}}–{{STEP_CHARS_MAX}} characters.
- `summary`: {{SUMMARY_CHARS_MIN}}–{{SUMMARY_CHARS_MAX}} characters, including its
  `<b>` tags.
- Each ingredient `name`: 3–40 characters, lowercase, no quantities inside the name.

## Other fields

- `readyInMinutes`: an integer consistent with the number of steps.
- `servings`: an integer between 2 and 12.
- Nutrients: begin with Calories, Fat, Saturated Fat, Carbohydrates, Sugar, Protein,
  Cholesterol, Sodium, Fiber, then continue with vitamins and minerals until the
  required count is reached. `unit` is one of `kcal`, `g`, `mg`, `µg`, `IU`, or `%`.
  `percentOfDailyNeeds` is a number between 0 and 400.

## Output

Return ONLY a JSON array of exactly {{BATCH_COUNT}} objects conforming to the response
schema, in row order. No wrapper object, no prose.
