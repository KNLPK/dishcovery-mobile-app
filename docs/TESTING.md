# Testing the Dishcovery demo

Dishcovery is a recipe app built for a thesis that compares three ways of
sending data to a phone: JSON, MessagePack and Protocol Buffers. This demo
lets you measure them on your own phone and compare with the thesis results.
It takes about five minutes.

You need an Android phone (Android 7 or newer). There is no iPhone version.

## 1. Install

1. On your phone, open the demo release page, or scan this QR code with the
   phone's camera:
   https://github.com/KNLPK/dishcovery-mobile-app/releases/tag/demo-v2

   ![QR code for the demo-v2 release page](qr-demo-v2.png)

2. Under **Assets**, tap **dishcovery-demo.apk** to download it, then open it.
   (Direct download:
   https://github.com/KNLPK/dishcovery-mobile-app/releases/download/demo-v2/dishcovery-demo.apk)

   If GitHub does not work for you, the release notes also link the same
   build on Expo, for two weeks after the release.
3. Android will warn that the app comes from an unknown source, because it is
   not from the Play Store. Allow it: tap **Settings**, turn on **Allow from
   this source** for your browser, go back and tap **Install**.
4. If Play Protect asks you to scan the app, you can scan it or tap
   **Install anyway**.

You can turn **Allow from this source** off again after installing.

The app installs as **Dishcovery Demo**. It is a separate app from the
thesis measurement build, so both can be on the same phone. If you already
have an older Dishcovery Demo, this one installs over it.

## 2. First launch

There is no login and no account.

1. A short animation plays: the Dishcovery logo, then the app slides in.
   Tap anywhere to skip it. Later launches play a shorter version.
2. A four-step tutorial follows. Swipe or tap **Next**; **Skip** jumps to the
   last step.
   - **Recipes, and a speed test**: what the app is for.
   - **Three ways to send a recipe**: JSON, MessagePack and Protocol Buffers.
   - **The quick test**: what it measures.
   - **What should we call you?**: type a name if you like (it stays on the
     phone), then tap **Run a quick test now** or **Browse recipes**.

You can see the tutorial again later: **Profile → Replay tutorial**.

## 3. Get around

The bar at the bottom has **Home**, **Search** and **Profile**, with a round
chef-hat button in the middle for **Cook**.

- **Home**: a "Test it yourself" card at the top with **Start quick test**
  and **Paper results**, then the format selector, recipe categories and
  recipes.
- **Search**: type a recipe name or an ingredient.
- **Cook**: type an ingredient and press Enter, or tap one of the common
  ones, and each becomes a chip; tap a chip's × to remove it. Recipes that
  use most of your ingredients appear as you go, with their cook time and
  how many of your ingredients they use. **Category** and **Cook time**
  narrow the list.
- **Profile**: your name, saved recipes, and the links **Results**,
  **Server settings**, **About** and **Replay tutorial**.

Tap a recipe to open it. The heart saves it to Profile. Long descriptions
show **Read more**.

## 4. Run the quick test

1. On Home, tap **Start quick test**, then **Start quick test** again on the
   next screen. It takes under a minute. Keep the app open and the screen
   on; the bar shows which payload size and format it is on and roughly how
   long is left. **Stop** cancels it and saves nothing.
2. When it finishes you see **Quick test finished** and a short summary. Tap
   **View results** for the charts, or **Run again**.
3. The quick test uses recipes built into the app, so it works without
   internet.

## 5. Read the results

Open them from the quick test, or **Profile → Results**. There are two tabs.

- **This phone**: your quick tests. One line per payload size (low, medium,
  high) says which format decoded fastest on your phone and by how much.
  **Share as file** sends a test as a file; **Delete** removes it.
- **Paper results**: the numbers from the thesis, measured with the full
  protocol on the test phone.

Each chart shows one measure, with its unit in the title:

- **Decode time** (ms): how long the phone took to turn the received bytes
  into a recipe. Lower is better.
- **Memory (heap allocation)** (kB): memory used while decoding. Lower is
  better.
- **Payload size** (kB): how many bytes were sent. Lower is better.

On **This phone**, solid bars are your phone and the thin outlined bars under
them are the paper. Every bar is labelled with its format, so you do not need
to tell the colours apart. **How to read this** explains the charts.

### What "Quick test — not the paper protocol" means

Your results carry this label on purpose. The quick test decodes 30 of the
150 generated recipes, with fewer repetitions, no cooldown between runs and
no check that the phone's speed stayed steady. The paper used 250 recipes,
many more repetitions, and enforced both. It uses the same decoding and
measuring code, so your numbers show the same kind of comparison, but they
are indicative only: they are never added to the thesis data, and small
differences between formats may not mean much.

## 6. Recipes and the server

Home, Search and Cook load recipes from the demo server over the
internet. The first request can take a few seconds while the server starts;
if it takes longer the app says "Connecting to the server…". Later requests
are quick.

All recipes you can browse are the 150 test recipes from the thesis dataset.
They were written by an AI model (Google Gemini), not by cooks, and are marked
**AI-generated recipe (Gemini)** on the recipe page. They have no photos of
their own, so the app shows a food photo that matches the kind of dish, marked
**Illustrative photo** (credits in [IMAGE_CREDITS.md](IMAGE_CREDITS.md)).
Search looks at recipe names,
ingredients and descriptions; Cook lists the recipes that use most of
the ingredients you enter.

If the app says there were too many requests from this phone, wait a few
minutes and try again. The quick test and Paper results keep working.

**Profile → Server settings** chooses where recipes come from:

- **Online** (the default): the demo server over the internet.
- **Laptop**: a server on a computer on the same Wi-Fi. For development only.
- **Offline**: no server. Recipe browsing is off; the quick test and the
  paper results still work.

Until you pick one, the screen says "Using the default for this build
(Online)."


## Problems or questions

Open an issue at https://github.com/KNLPK/dishcovery-mobile-app/issues, or
message the thesis author (GitHub: KNLPK) directly. A screenshot and your
phone model help.
