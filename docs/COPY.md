# Copy and terms

How the app words things, so every screen says the same thing the same way.

## Rules

- English only.
- Sentence case for every title, button, tab and label: "Run a quick test now",
  "Start quick test", "Browse recipes", "Popular recipes". Only the first word
  and names are capitalised.
- Names keep their own spelling: JSON, MessagePack, Protocol Buffers,
  Google Gemini, Unsplash, Hermes, Spoonacular, GitHub.
- Screen names are written as on screen when the text points to them:
  Home, Search, Cook, Profile, Results, Server settings, About.
- Plain words first. When a technical term is needed, use the one in the
  glossary below and no other ("decode time", not "deserialization",
  "parse time" or "decode").
- Say what happens and what to do next. No exclamation marks.

## Glossary

| Term | Meaning | Unit and format |
| --- | --- | --- |
| quick test | The short test anyone can run on their own phone: 30 recipes, all three formats, usually under a minute. Not the paper protocol. Written "quick test" in a sentence and "Quick test" only at the start of one (screen title "Quick test"). | |
| paper results | The numbers published with the thesis, measured with the full protocol on the test phone. | |
| paper protocol | The full measurement procedure used for the paper (250 payloads, more repetitions, cooldown and drift checks). Used on the benchmark runner and where the quick test is compared with it. | |
| format | How the server sends a recipe: JSON, MessagePack or Protocol Buffers. Short labels on the format selector: JSON, MsgPack, Protobuf. | |
| payload | The data for one recipe in one format, as sent over the network. | |
| payload size | How much data a payload takes on the network. | KB, one decimal: "4.9 KB". 1 KB = 1,000 bytes, as in the paper. |
| decode time | How long the phone takes to turn a payload back into a recipe. | ms, two decimals: "2.08 ms". |
| memory (heap allocation) | Memory the app allocates while decoding one payload (Hermes `js_totalAllocatedBytes`). Not peak memory use. Written in full as a chart or section title; "memory" alone in running text and in the line under the format selector. | KB, one decimal: "75.5 KB". |
| last response | The most recent request on the current screen. On Home and the recipe page it is shown under the format selector: "Last response: 1.1 KB · 2.08 ms · 75.5 KB memory" (memory only when the engine reports it). When the format had to change, it names the one used: "Last response (JSON): …". With Protobuf selected, list screens add "Lists are sent as JSON. Protobuf is used on recipe pages." Never truncated. On Cook and Search it is the format pill in the header: "JSON · 1.1 KB · 2.08 ms", "JSON · measuring…", or the format alone before a measurement. | |
| session measurements | Every request since the app was opened, grouped by format (from the Σ sheet). | |
| tier | Low, medium or high: how complex a recipe payload is. | |
| illustrative photo | One of the 28 bundled food photos shown in place of a recipe photo; it shows the kind of dish, not the dish. | |
| AI-generated recipe (Gemini) | The label on every recipe in the online catalog. | |
| Guest | What the app calls the person when no name was given. | |

## Buttons

One of each, from `components/Buttons.tsx`:

- Primary: dark teal fill, white label. One per screen or card, for the main
  action ("Start quick test", "Run a quick test now", "Done").
- Secondary: teal outline. Other actions ("Run again", "Back", "Browse
  recipes", "Share as file").
- Text link: teal underlined text. Small or inline actions ("Search all",
  "Paper results", "Close").

Selected chips and the selected format use the same dark teal fill. There is
no light-teal button; light teal is only used as a card background.

## Tutorial

The four steps of `app/welcome.tsx`, shown on first launch and from "Replay
tutorial" (Profile and About, which also brings back the one-time hints).
Controls: "Skip" (steps 1 to 3, jumps to step 4), "Back" (steps 2 and 3),
"Next", and on step 4 "Run a quick test now" (primary) and "Browse recipes"
(secondary). Progress is four dots; screen readers hear "Step 1 of 4".

| Step | Title | Text |
| --- | --- | --- |
| 1 | Recipes, and a speed test | Find recipes for what's in your kitchen. Dishcovery times how fast this phone reads each one. |
| 2 | Three ways to send a recipe | The same recipe, packed three ways. **JSON** is a readable letter, **MessagePack** the same letter packed tighter, **Protocol Buffers** a form with fixed fields. Caption under the picture: "Average small recipe in the study (low tier)." |
| 3 | The quick test | The same recipes in all three formats: size, decode time and memory. Under a minute, offline. |
| 4 | What should we call you? | Optional. It stays on this phone. Field placeholder: "Your name". |

The analogy has to stay accurate: MessagePack keeps the field names (it is
the same structure in a binary code), and Protocol Buffers sends field
numbers because both sides share the schema (`recipe.proto`).

Profile row: "Replay tutorial", detail "The four intro steps, and the tips
again". About: the link "Replay tutorial" under "What this app is".

## Cook

`app/ChefHat.tsx`. Title "Cook", subtitle "Find recipes from what you have".

| Element | Copy |
| --- | --- |
| Ingredient field | Placeholder "Add an ingredient"; while typing, "Enter to add" at its end |
| Row of one-tap ingredients | Label "Common"; each chip "+ chicken" |
| Filters | "All categories" or the category; "Any time" or "≤ 30 min" |
| Result card | Title; under it "25 min" (clock icon) and "Uses 2 of your ingredients" (the count of your ingredients the recipe uses, from the server) |
| Count | "57 recipes" (the catalog's total); under a long list, "Showing the first 10. Add an ingredient or a filter to narrow it down." |
| Empty | "What's in your kitchen?" / "Add an ingredient or tap one above. Recipes appear here as you go." |
| Loading | "Finding recipes" (skeletons, then the loader after 600 ms) |
| No match | "No recipes match" / "Nothing with chicken or salmon as a dessert in 30 minutes or less." One button per active filter: "Remove “Dessert”", "Any cook time". With no filter: "… Try another ingredient." Ingredients are never removed for the user. |
| Category sheet | Title "Category": All, Breakfast, Main course, Snack, Dessert; "Tap to apply." |
| Cook time sheet | Title "Cook time": Any time, 30 min or less, 45 min or less, 60 min or less; "Tap to apply." |

"or" in the no-match line is deliberate: the catalog finds recipes with any
of the ingredients, so nothing came back for each of them.

## Format pill

`components/FormatPill.tsx`, in the header of Cook and Search (Home and the
recipe page keep the full format bar). The pill: the short format label and
the last response, "JSON · 1.1 KB · 2.08 ms". An empty result set shows
the time alone, "JSON · < 0.01 ms". Everywhere in the app a time under
0.01 ms reads "< 0.01 ms", never "0.00 ms". Its sheet:

- Title "Data format"; "Every recipe is sent in this format. Numbers are
  from the last response in each."
- One row per format with its full name and "1.1 KB · 2.08 ms" or "not
  measured yet"; under Protocol Buffers, "Lists are sent as JSON. Protobuf is
  used on recipe pages." (true on both screens: they only load lists).
- "Done", and the link "What these numbers mean" (the Σ sheet).

## Loading

The brand loader (`components/BrandLoader.tsx`) always sits above or beside
a label that says what is happening; the loader alone never explains a wait.

| Where | Size | Label |
| --- | --- | --- |
| First connection to the server, after about 3 s | 96, full screen | "Connecting to the server…" |
| A list or card wait past 600 ms (skeletons before that) | 48 | The wait's own label, e.g. "Loading popular recipes", "Searching for “pasta”", "Finding recipes" |
| A busy button | 24 | The button's busy label (`busyLabel`), e.g. "Finding recipes…". No button uses it since Cook searches on its own. |
| Quick test, while it runs | 96, still | The phase line under it: "Loading payloads", "Warming up the engine · JSON", "Calibrating the memory counter", then the payload being measured |

## Numbers

Units come from `constants/units.ts`: `formatKB()` and `formatMs()`, and
`KB_DIGITS` / `MS_DIGITS` for charts and tables. Percentages are against JSON,
one decimal: "+12.3%".

## Less text (round 7)

After the phone review the copy was cut to what a first-time user needs; the
detail lives behind Σ, "How to read this" and About. Home: shorter banner
line, no "Browse recipes" link, one "Search all", no "View recipe →", no Tips
and tricks, a one-line format hint ("Pick how recipes are sent. Tap Σ to see
what the numbers mean."), and the last-response line drops "decoded in" and
"memory not reported". Recipe page: the summary shows four lines with "Read
more". Quick test: a one-line lead and a two-line footnote. Session
measurements: one line on lists sent as JSON. Onboarding steps 1, 3 and 4:
shorter bodies.
