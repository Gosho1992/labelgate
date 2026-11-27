# LabelGate: architecture (27 Nov 2026)

## 1. Data classes and where they may go
| Data | Class | Inference allowed | Code |
|---|---|---|---|
| Supplier spec photos/scans, label artwork, spec text, formulas, label records | **PRIVATE** | `ONLY_ON_DEVICE` (Gemini Nano). Every answer must report `inferenceSource = on_device` on every chunk and on the final response, or it is rejected (privacy guard). | `src/ai/firebase.js`: `privateDocumentModel`, `readPrivateDocumentStream`, `privateExtractionModel` |
| Public recall notices | **PUBLIC** | `PREFER_ON_DEVICE`: Nano when available, otherwise `gemini-3.5-flash-lite` in the cloud (App Check) | `publicRecallModel`, used only by `parseRecall` in `src/ai/extract.js` (enforced by a test) |
| Warm-up | none | the Prompt API directly, with a fixed one-word prompt and no document content | `warmUpDeviceModel` |
| Review log, verified label library, re-approvals | metadata + confirmed readings | none | browser `localStorage` (`labelgate.*`) |

## 2. Main flow (Spec-to-Proof)
```
Gate 1  supplier spec image ──Nano (on device, streamed)──► reading ──checks──► reviewer confirms
                                                                                     │
        verified label library (text + artwork SHA-256 + approval basis) ◄──────────┤
                                                                                     ▼
        fixed rules: every label that uses this ingredient ──► PRINT BLOCKED / NEEDS REVIEW / CHECKS CLEAR (ms)
                                                                                     │
Gate 2  new artwork image ──Nano──► reading ──checks + differences vs approved label (each ticked)──► confirm
                                                                                     ▼
        fixed rules ──► CHECKS CLEAR ──► QA sign-off ──► new verified label record (approved for the new revision)
```
- `src/proof/read.js`: prompt `proof-read-3`, JSON schema, 150 s timeout, one automatic retry on an empty reading.
- `src/proof/rules.js`:
  - `checkSpecReading` / `checkLabelReading` handle reading hygiene: placeholders, Contains / May-contain lines in the wrong field, translation mismatch.
  - `specSources` builds a dictionary over the English translation, unioned with original-language allergen words, minus advisory (facility) sentences.
  - `compare` is the decision.
  - `specChanges` separates document changes from allergen implications.
- `src/proof/library.js`: the verified records and `recordProblem`; `reapprove` / `approvalFor`, which are tied to the artwork fingerprint; and `labelDiff`.
- `src/proof/audit.js`: canonical JSON, a SHA-256 hash chain, `verifyChain`, CSV export. Tamper-evident, not signed.
- `src/proof/privacy.js`: requests to other origins during each read (Resource Timing).
- `src/proof/reviewer-test.js`: blind reviewer test with 3 hidden error variants and a control. Results are shown only at `/?reviewer-test=results`.

## 3. Second tab: text specs and recalls
- `src/engine/`: spec diff, profile, label gate, recall matching, and the router (hard constraints first, then an augmented weighted Tchebycheff choice among the allowed routes).
- `src/allergens/`: the versioned synonym dictionary and the rule pack.
- A public recall is read with hybrid inference, then `matchRecall` matches its terms **locally** against private specs and formulas. No private data is uploaded.

## 4. What is deliberately not done
- No cloud fallback for private data, ever.
- The AI never makes the release decision. An unconfirmed reading never produces a result.
- No PDF input (JPEG/PNG only), no multi-user server, no regulatory certification.
