# Presidential Fit

A personal stylist web app for iPhone. It opens on one question, "What is the fit for?", and builds the outfit from the answer, only from your own closet and under your own standing rules.

- Answer in your own words ("dinner tonight, then drinks", "Monday class with the fedora, no jeans") or tap an occasion.
- Every fit comes with a check list: the hours it is worn, the live hour by hour weather for those hours, metals, belt and shoes, tuck, dress level, and what each audience has already seen.
- Works offline once added to the Home Screen. The weather check needs a connection and says so when it has none.
- Your closet, log, photos and any API key stay on the device. Nothing personal is stored in this repository.
- Each fit is shown as a realistic mockup with you as the model, made by ChatGPT's image engine, and a new one is made whenever the fit changes. Three ways, in this order:
  1. Your own OpenAI API key, saved in the app. Works anywhere.
  2. Your own Mac. `mac/helper.mjs` runs in the background, makes each mockup with the image tool inside the ChatGPT desktop app (your ChatGPT plan, no key), and sends it to the phone. `mac/install.sh` sets it up. The Mac has to be awake.
  3. A hand off to the ChatGPT app, with the finished image pasted back.
- The phone and the Mac talk through the public relay ntfy.sh. Every message is encrypted end to end with a key derived from your closet's private profile, and each picture with a fresh key that is thrown away afterwards. The relay sees neither outfits nor pictures. An app with a personal profile and no API key asks that relay once per start whether its Mac is there.

Open the site in Safari, tap Share, then Add to Home Screen. Load your closet file from More, Your data, Import file.
