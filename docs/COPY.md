# Copy and terms

How the app words things, so every screen says the same thing the same way.

## Rules

- English only.
- Sentence case for every title, button, tab and label: "Find recipes",
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
| last response | The most recent request on the current screen, shown under the format selector: "Last response: 1.1 KB · decoded in 2.08 ms · 75.5 KB memory". When the format had to change, it names the one used: "Last response (JSON): …". With Protobuf selected, list screens add "Lists are sent as JSON. Protobuf is used on recipe pages." Never truncated. | |
| session measurements | Every request since the app was opened, grouped by format (from the Σ sheet). | |
| tier | Low, medium or high: how complex a recipe payload is. | |
| illustrative photo | One of the 28 bundled food photos shown in place of a recipe photo; it shows the kind of dish, not the dish. | |
| AI-generated recipe (Gemini) | The label on every recipe in the online catalog. | |
| Guest | What the app calls the person when no name was given. | |

## Buttons

One of each, from `components/Buttons.tsx`:

- Primary: dark teal fill, white label. One per screen or card, for the main
  action ("Start quick test", "Find recipes", "Continue").
- Secondary: teal outline. Other actions ("Run again", "Skip", "Share as
  file").
- Text link: teal underlined text. Small or inline actions ("Search all",
  "Paper results", "Close").

Selected chips and the selected format use the same dark teal fill. There is
no light-teal button; light teal is only used as a card background.

## Numbers

Units come from `constants/units.ts`: `formatKB()` and `formatMs()`, and
`KB_DIGITS` / `MS_DIGITS` for charts and tables. Percentages are against JSON,
one decimal: "+12.3%".
