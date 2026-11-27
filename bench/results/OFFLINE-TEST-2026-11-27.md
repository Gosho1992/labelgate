# Offline test, 27 Nov 2026 (Zain's laptop, Chrome 158, hosted app)

## Procedure
1. The app was opened while online, and Gemini Nano finished its warm-up ("Model loaded and ready", 34 s). The demo spec image was fetched into the page's memory.
2. Zain turned Wi-Fi off. The page confirmed `navigator.onLine = false`.
3. A script in the page (written before Wi-Fi was turned off) then ran these steps with no network:
   - gave the spec image to Gate 1;
   - waited for the reading;
   - confirmed it;
   - ran the public recall notice.

   Everything was logged to `localStorage`.
4. Wi-Fi was turned back on, and the log was read.

## Result (all steps ran while `navigator.onLine = false`)

| Step | Result |
|---|---|
| Private spec read (Spanish photo) | **Read on this device in 67 s**. `inferenceSource` was `on_device` on every chunk and on the final response. **No requests to other servers during the read.** |
| Confirm, then rules and impact | **2 blocked, 1 clear, checked in 6 ms** |
| Public recall notice (`PREFER_ON_DEVICE`) | **Ran on this device (Gemini Nano), 39 s, `on_device`**. The cloud fallback was not needed. |

## Log (as saved)
```
05:10:49 online true  armed; spec image prefetched (130320 bytes)
05:11:47 online false WIFI OFF detected
05:11:53 online false device note: Model loaded and ready (warm-up took 34 s, no document content used).
05:11:53 online false spec image given to Gate 1 (offline)
05:13:19 online false spec read finished: Read on this device in 67 s · Firebase AI Logic reported on_device · no outside requests during this read
05:14:19 online false confirmed offline; impact: 2 blocked / 1 clear — checked in 6 ms by fixed rules
05:16:19 online false recall finished: ran on this device Gemini Nano · inferenceSource on_device · 39.0 s · PREFER_ON_DEVICE
05:16:19 online false DONE
```

## Limits
- The page must already be open. The app has no offline install (service worker), so loading it for the first time without internet does not work.
- The demo image was fetched before going offline. In real use the document comes from the user's own computer.
- One run.
