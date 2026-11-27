# Android Gemini Nano check: Samsung Remote Test Lab, 27 Nov 2026

**Device:** Samsung Galaxy S26 (SM-S942B, "m1s"), remote unit SM-S942B_IN1 in India (Noida). Android 16 (API 36).
**AICore:** 26.10.15.11.release.samsungslsi.prod_aicore_20261015.00_RC11
**App:** LabelGate Nano check (com.labelgate.android), versions 0.2 to 0.4. It uses Firebase AI Logic (`firebase-ai` 18.2.0 + `firebase-ai-ondevice` 16.0.0-beta08) with `InferenceMode.ONLY_ON_DEVICE`, and runs all tests automatically when it opens.

## Results (read from the phone screen)

| Step | Result |
|---|---|
| First status check (fresh phone) | `DOWNLOADABLE` (1730 ms); model name `nano-v3` |
| Model download | Started at 4219 MB, about 8 MB/s |
| Status after the download | `AVAILABLE` (140 ms) |
| Warm-up | 1487 ms |
| Text test, "Reply with exactly one word: ready" | "Ready." — source **On Device**, 1695 ms |
| English spec photo (B1, 1134×838) | source **On Device**, 2748 ms, **0 bytes sent by the app** during the read; language "en" |
| Spanish spec photo (SEAS-01 rev2, 1134×838) | source **On Device**, 2670 ms, **0 bytes sent**; language "es"; first ingredient read as "Sal - Salt" |

Bytes sent are counted with Android `TrafficStats.getUidTxBytes` for the app, before and after each read.

## Problems found (honest)

1. **The answers were cut off** after roughly 30 tokens. Examples: `"Pap…`, `"Maltodext…`. The app did not set `maxOutputTokens`, and the default on-device limit is small. Version 0.5 sets `maxOutputTokens = 512` but has **not been run yet**, because the remote screen stream froze.
2. **Model name is `nano-v3`.** The hackathon rules ask Android entries to integrate Gemini Nano 4. Version 0.5 also checks `OnDeviceModelOption.PREVIEW`; this is **not tested yet**.
3. **Samsung Remote Test Lab quirks:**
   - The browser upload sends the file as `application/octet-stream`, so installs fail until the type is changed to `application/vnd.android.package-archive`.
   - Touch input from automation does not register.
   - The screen stream freezes when the log panel is open.

## Second phone: Galaxy S25 (SM-S931, unit IN3, India), Android 16, app version 0.5 (16:51 PKT)

At the time, Samsung Remote Test Lab had no Galaxy S26 free in India, so this run used a Galaxy S25.

- Nano status: **UNAVAILABLE**. The model name could not be read: `[ErrorCode -101] AICore is either not installed or the installed version is too low`.
- PREVIEW model: also UNAVAILABLE, with the same error.
- Both photo reads stopped with `FirebaseAIOnDeviceNotAvailableException: On-device model is not available`. **Nothing went to the cloud.** This is the privacy rule working on Android: with ONLY_ON_DEVICE, private documents never fall back to the cloud.
- The fix for the cut-off answers (`maxOutputTokens = 512`) still has **not** been checked on a phone where Nano works.

Takeaway: Gemini Nano depends on the exact phone and its AICore version, even within one phone family. The S26 unit had it; this S25 unit did not.

## Third run: Galaxy S26 (unit IN1, India), app version 0.5 with `maxOutputTokens = 512`

This is the same phone as the first run; the model was already downloaded. Results are read from the phone screen. Screenshots: `evidence/s26-v5-*`.

| Read | Result |
|---|---|
| Spanish spec SEAS-01 rev2 | **Complete**. All 8 ingredients, in the same order and spelling as printed, each with an English translation. The allergen statement was read in full: "Contiene: leche. Elaborado en una planta que también procesa sésamo." → "Contains: milk. Manufactured in a facility that also processes sesame." Source **On Device**, **12.2 s**, **0 bytes** sent. |
| English spec B1 | **Complete**. All 6 ingredients (Salt, Sugar, Paprika, Garlic powder, Yeast extract, Rosemary extract) and the full facility statement. Source **On Device**. |
| PREVIEW model option | UNAVAILABLE on this phone. Only the stable `nano-v3` model was present. |

**Same answer as the Chrome version.** We compared both readings with the Gemini Nano readings from desktop Chrome, which the acceptance run recorded (`results-B-run1-2026-11-26.json`, `RECORDED_SPEC_RAW`). The ingredients and allergen statements are identical. Only the output format differs: Android printed "Spanish - English" strings, while the web app uses a JSON schema with separate fields.

## Summary

| Device | Gemini Nano | Private photo read | Complete answer | Sent to the cloud |
|---|---|---|---|---|
| Galaxy S26, Android 16 | Available (`nano-v3`, after a 4.2 GB download) | On device: 2.7 s with the default output limit, 12.2 s for the full answer | Yes; matches the Chrome reading | 0 bytes |
| Galaxy S25, Android 16 (unit IN3) | Unavailable (AICore missing or too old) | Stopped with an error | — | Nothing; no cloud fallback |
| Galaxy S26+ (US model SM-S947U, unit VN2, Vietnam), app 0.5 | Unavailable (`[ErrorCode -101] AICore is either not installed or the installed version is too low`) | Stopped with an error | — | Nothing; no cloud fallback |

**What we can claim:** LabelGate's private on-device reading step runs on Android through Firebase AI Logic and gives the same reading as Chrome.

**What we cannot claim:** that LabelGate is an Android app. The full workflow (impact card, artwork check, sign-off, audit log) has only been built and tested on Web/Chrome.
