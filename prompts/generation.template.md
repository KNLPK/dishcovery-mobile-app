Generate one recipe document.

## Subject (for variety — do not restate these labels in the output)

- Cuisine: {{CUISINE}}
- Dish type: {{DISH}}
- Distinguishing angle: {{ANGLE}}

The title must be specific to this combination and must not repeat a common
generic name.

## Exact structural counts

| Element | Required count |
|---|---|
| `nutrition.nutrients` | exactly {{NUTRIENT_COUNT}} |
| `extendedIngredients` | exactly {{INGREDIENT_COUNT}} |
| `analyzedInstructions` (instruction sets) | exactly {{INSTRUCTION_SET_COUNT}} |
| total steps across all sets | exactly {{STEP_COUNT}} |

Distribute the {{STEP_COUNT}} steps across the {{INSTRUCTION_SET_COUNT}} instruction
sets as evenly as the recipe logic allows. Every set must contain at least two steps.

## Text length budgets

These are held CONSTANT across all size tiers. Do not lengthen text to reach a size.

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
