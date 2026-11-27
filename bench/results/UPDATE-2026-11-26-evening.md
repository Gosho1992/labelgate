# LabelGate — evening update, 26 Nov 2026 (after GPT + Nemotron reviews)

All measured on Zain's laptop (Chrome 158, Intel iGPU) against the hosted app. 131 automated tests pass.

## Built
1. **Gate 2: differences must be checked before confirming.** Before an artwork reading can be confirmed, every line that differs from the approved label is listed (new words highlighted) and must be ticked "found on the artwork". A deliberately wrong reading claiming milk now cannot pass without the reviewer ticking "CONTAINS: WHEAT, **MILK**" as present on the image. The ticked differences are stored in the audit log.
2. **Blind reviewer test v2** (`/?reviewer-test=1`, results at `/?reviewer-test=results`). Same real artwork (B6), one of four readings at random: V0 correct (control), V1 milk in ingredients + Contains, V2 Contains only, V3 ingredients only. The supplier reading is a recorded real Nano output, so a run takes ~2 minutes. Outcome is not shown to the tester. Mechanics checked once with a self-test run (V3, corrected → CAUGHT), which was then deleted. **No human runs yet.**
3. **Audit pack.** Each decision is stored with the SHA-256 of its canonical JSON and of the previous entry. The history shows "Audit chain intact"; editing one stored entry in the browser made it show "Audit chain broken at entry 8 — entry content was changed" (tested live, then restored). Export as JSON (entries + verified label records + chain check) or CSV. Entries now include the confirmed reading text, document SHA-256, supplier revision, ruleset, evidence and artwork fingerprint. Wording: tamper-evident, not signed.
4. **QA workspace summary bar.** Products affected / print blocked / need review / checks clear / approved for revision 2, plus one "Next action" line.
5. **Live privacy evidence per read.** inferenceSource on every streamed chunk and the final response, plus every request to another server during the read (Resource Timing). Live result on the Spanish spec: `on_device` on all chunks and final, **no outside requests during the read**. The page cannot see request bodies; this shows which servers were contacted.
6. **Model warm-up on page open.** Measured: cold `LanguageModel.create` **23.8 s** + first tiny prompt **14.2 s**; warm **9 ms** + **1.6 s**. The app now loads the model when the page opens (fixed one-word prompt, no document content). Honest limit: this removes the model-load cost from the first read of a visit; it does not make a read faster once the model is loaded. A warm spec read still took **73 s** (first live text after 16 s). Prompt/output were not changed (that would invalidate acceptance evidence).

## GPT's three checks
- "May contain" — already explained in the result: "milk appears only in a precautionary ("may contain") statement, which does not declare an ingredient", plus an "ignored: advisory" pill in the evidence. No change needed.
- Original language — new tests: with a wrong or missing English translation, "leche"/"soja" (ES) and 大豆/小麦/乳 (JA) still give milk/soy/wheat; "leche de coco" and 乳化剤 do not. 5/5 pass.
- Automatic retry — new tests with a simulated model: empty → retried once → second answer used; good answer not retried; two empty answers leave an empty field with an `empty_reading` problem that blocks confirmation; empty spec also retried. 4/4 pass.

## Not done
- Nemotron's "keyboard-first": checkboxes and buttons work with Tab/Space/Enter; no custom hotkeys added.
- "Read next label in background": reads already queue (artwork can be loaded while the spec is being read); no extra pre-fetch.
- Offline test: needs Wi-Fi turned off on the laptop (Zain).
