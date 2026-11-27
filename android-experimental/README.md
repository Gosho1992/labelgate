# Android experiment: Gemini Nano on real Samsung phones

**Status: the on-device reading step works on a real Galaxy S26 (see `bench/android/`).** The rest of the LabelGate workflow (impact card, artwork check, sign-off, audit log) runs in the Web/Chrome app in the repository root today and is next for Android.

## What this is

A small native Android app (Kotlin) that runs LabelGate's **private supplier-spec reading** on an Android phone through **Firebase AI Logic** (`firebase-ai` 18.2.0 + `firebase-ai-ondevice` 16.0.0-beta08) with `InferenceMode.ONLY_ON_DEVICE`. It uses the same prompt as the web app (`src/proof/read.js`).

When it opens, it runs every step by itself:
- checks whether the on-device model is ready, and downloads it if needed;
- warms the model up;
- reads two supplier spec photos;
- logs, for each read, where it ran (`inferenceSource`) and how many bytes the app sent during the read (Android `TrafficStats`).

## What it does not do (yet)

- It does not run the rest of the workflow: impact card, artwork check, sign-off or audit log.
- It does not use a JSON schema for the answer.

Full results: [`../bench/android/ANDROID-NANO-CHECK-2026-11-27.md`](../bench/android/ANDROID-NANO-CHECK-2026-11-27.md). Screenshots: [`../bench/android/evidence/`](../bench/android/evidence/).

## Build

1. Register an Android app with the package name `com.labelgate.android` in your Firebase project.
2. Put its `google-services.json` in `app/`. It is not committed.
3. Run `gradle :app:assembleRelease`. The build uses Android SDK 36, JDK 17, AGP 8.13 and Kotlin 2.4.

## Testing on Samsung Remote Test Lab

We had no supported phone, so we installed the APK on real phones through Samsung Remote Test Lab.

The lab's browser upload sends the APK as `application/octet-stream`, and installs failed until we changed the type to `application/vnd.android.package-archive`.
