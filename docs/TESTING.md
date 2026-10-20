# Testing the Dishcovery demo

Dishcovery is a recipe app built for a thesis that compares three ways of
sending data to a phone: JSON, MessagePack and Protocol Buffers. This demo
lets you measure them on your own phone and compare with the thesis results.
It takes about five minutes.

You need an Android phone (Android 7 or newer). There is no iPhone version.

## 1. Install

1. Open the install link you were sent on your phone, or scan the QR code with
   the phone's camera.
2. Tap **Install** on the Expo page to download the APK file, then open it.
3. Android will warn that the app comes from an unknown source, because it is
   not from the Play Store. Allow it: tap **Settings**, turn on **Allow from
   this source** for your browser, go back and tap **Install**.
4. If Play Protect asks you to scan the app, you can scan it or tap
   **Install anyway**.

You can turn **Allow from this source** off again after installing.

## 2. First launch

1. Three short cards explain what the app is for. Read them or tap **Skip**.
2. On the login screen tap **Continue as guest**. This is a demo login:
   nothing you type is stored or sent anywhere.

## 3. Run the Quick test

1. On Home, tap **Start Quick test** in the "Test it yourself" card.
2. Tap **Start Quick test** again. It takes about a minute. Keep the app open
   and the screen on; the bar shows which payload size and format it is on and
   roughly how long is left. **Stop** cancels it and saves nothing.
3. The Quick test uses recipes built into the app, so it works without
   internet.

## 4. Read the results

The Results screen has two tabs.

- **This phone**: your Quick test. One line per payload size (low, medium,
  high) says which format decoded fastest on your phone and by how much.
- **Paper results**: the numbers from the thesis, measured with the full
  protocol on the test phone.

Each chart shows one measure, with its unit in the title:

- **Decode time** (ms): how long the phone took to turn the received bytes
  into a recipe. Lower is better.
- **Heap allocation** (kB): memory used while decoding. Lower is better.
- **Payload size** (kB): how many bytes were sent. Lower is better.

On **This phone**, solid bars are your phone and the thin outlined bars under
them are the paper. Every bar is labelled with its format, so you do not need
to tell the colours apart.

### What "Quick test — not the paper protocol" means

Your results carry this label on purpose. The Quick test decodes 30 of the 150
generated recipes, with fewer repetitions, no cooldown between runs and no
check that the phone's speed stayed steady. The paper used 250 recipes, many
more repetitions, and enforced both. It uses the same decoding and measuring
code, so your numbers show the same kind of comparison, but they are
indicative only: they are never added to the thesis data, and small
differences between formats may not mean much.

## 5. Browse recipes

Home, Search and the Cook tab load recipes from the demo server over the
internet. The first request can take a few seconds while the server starts;
if it takes longer the app says "Waking the server…". Later requests are
quick.

All recipes you can browse are the 150 test recipes from the thesis dataset.
They were written by an AI model (Google Gemini), not by cooks, and are marked
**AI-generated recipe (Gemini)** on the recipe page. They have no photos, so
the app shows a plain placeholder instead. Search looks at recipe names,
ingredients and descriptions; the Cook tab lists the recipes that use most of
the ingredients you enter.

If the app says there were too many requests from this phone, wait a few
minutes and try again. The Quick test and Paper results keep working.

## Problems or questions

Open an issue at https://github.com/KNLPK/dishcovery-mobile-app/issues, or
message the thesis author (GitHub: KNLPK) directly. A screenshot and your
phone model help.
