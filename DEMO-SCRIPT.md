# LabelGate — 3-minute demo script

There is about 400 words of voice-over (about 2:45 at a calm pace). Sped-up parts are labelled on screen as "sped up".

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Impact Card headline: **"Supplier added Milk → 2 labels PRINT BLOCKED · 1 clear"** | "A supplier quietly changes one ingredient in a seasoning. Three of your products use it, and two of their approved labels no longer declare milk. If those labels get printed, that's an allergen recall. LabelGate catches it before print." |
| 0:15–0:45 | Gate 1: the Spanish spec photo. Click **Use demo document**. "Gemini Nano is reading this supplier spec on this device" (**sped up ×8**). Then: *"Read on this device · Firebase AI Logic reported on_device · no outside requests"* | "Supplier specs and formulas are confidential, so Gemini Nano reads the photo on this laptop through Firebase AI Logic, on-device only. It works in Spanish, English and Japanese. The app records that the read ran on the device and that no request left the page while it ran." |
| 0:45–1:05 | The reading next to the photo. Type the reviewer name and click **Confirm this reading**. | "A named QA reviewer checks the reading against the photo and confirms it. The AI only reads; it never decides." |
| 1:05–1:25 | Impact Card: the change "natural flavour → Aroma natural (… leche)" with **New allergen source: Milk**. Three rows: 2 PRINT BLOCKED, 1 CHECKS CLEAR. "checked in 7 ms by fixed rules". | "Fixed rules then check every affected label against its verified label record in a few milliseconds. Crackers and Pretzel Bites are blocked: milk is missing. The croutons label already declares milk, so it's clear but still needs a person's sign-off." |
| 1:25–2:00 | Gate 2: click **Check new artwork** for Crackers, then **Use demo document** (sped up). The A/B question "Which wording is actually printed?", answered by looking at the image. Click **Sign off** → "LBL-1001@4 approved for revision 2". | "For the corrected artwork, Nano reads the label and LabelGate asks the reviewer neutral either-or questions about what's actually printed, instead of tick boxes. People ticked through tick boxes in our first user test, so we replaced them. Then QA signs off this exact artwork revision." |
| 2:00–2:15 | History: **Audit chain intact**, then click **Test tamper detection** → "Detected". | "Every decision goes into a hash-chained log. Edit any entry and the chain breaks." |
| 2:15–2:35 | Recall notices tab: **Read notice**, then the badge "ran on this device" (cloud-fallback badge mentioned). Then a short shot of the offline-test result or the "no Nano → stops" message. | "Public recall notices use the hybrid mode: on-device when Nano is available, cloud fallback when it isn't. Private supplier documents never fall back; without Nano they simply stop." |
| 2:35–2:52 | Screenshot of the Galaxy S26: on-device read, **0 bytes sent**, full Spanish reading. | "We also ran the same on-device reading step on a real Galaxy S26 through Firebase AI Logic for Android. It gave the identical reading, with nothing sent off the phone. That's an experiment, not a full Android app yet." |
| 2:52–3:00 | Title card: **LabelGate — supplier changes, label consequences, before print.** | "LabelGate: supplier changes, label consequences, before print." |

## Recording plan (Zain: about 15 minutes)
1. **Screen:** Claude drives the demo in your Chrome. You only start and stop Windows screen recording (Win+Alt+R).
2. **Voice:** record the voice-over column on your phone (voice memo), in one go. Any small mistakes are fine; Claude cuts them.
3. Claude edits: cuts the waits, speeds up the Nano reads (labelled "sped up"), adds captions, joins the voice, and keeps the video under 3:00.
4. You upload the final MP4 to YouTube as **Public**, or **Unlisted** if the rules allow it, and send Claude the link.
