package com.labelgate.android

import android.graphics.BitmapFactory
import android.net.TrafficStats
import android.os.Build
import android.os.Bundle
import android.os.Process
import android.os.SystemClock
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.firebase.Firebase
import com.google.firebase.ai.DownloadStatus
import com.google.firebase.ai.GenerativeModel
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.OnDeviceModelOption
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.content
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * LabelGate "Nano check" — step 1 of the Android build.
 * Answers one question honestly: can this phone run Gemini Nano through Firebase AI Logic, on device only?
 * Every request here uses InferenceMode.ONLY_ON_DEVICE, so nothing can silently go to the cloud:
 * if Nano is not available, the SDK throws and we show the error.
 */
@OptIn(PublicPreviewAPI::class)
class MainActivity : AppCompatActivity() {
    private lateinit var out: TextView
    private val model: GenerativeModel by lazy {
        Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
            modelName = "gemini-3.5-flash-lite", // cloud name is required by the API; ONLY_ON_DEVICE never calls it
            onDeviceConfig = OnDeviceConfig(mode = InferenceMode.ONLY_ON_DEVICE, maxOutputTokens = 512, temperature = 0f),
        )
    }

    private var lastMb = 0L
    private fun log(s: String) = runOnUiThread {
        s.chunked(900).forEach { android.util.Log.i("LGCHECK", it) }
        val t = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
        out.text = "[$t] $s\n" + out.text  // newest first, so results stay on screen
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Remote test phones sit on the lock screen; show the results over it.
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 32, 32, 32) }
        col.addView(TextView(this).apply { text = "LabelGate — Gemini Nano check"; textSize = 22f })
        col.addView(TextView(this).apply { text = "Every test uses ONLY_ON_DEVICE. Nothing is sent to the cloud."; textSize = 14f })
        fun btn(label: String, run: suspend () -> Unit) = col.addView(Button(this).apply {
            text = label; isAllCaps = false
            setOnClickListener { lifecycleScope.launch { try { run() } catch (e: Throwable) { log("ERROR ${e.javaClass.simpleName}: ${e.message}") } } }
        }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        btn("1. Check Gemini Nano status") { checkStatus(); Unit }
        btn("2. Download model (only if DOWNLOADABLE)") { download() }
        btn("3. Warm up + one-word test") { warmAndText() }
        btn("4. Read English supplier spec photo") { readImage("B1-spec-en-facility.jpg") }
        btn("5. Read Spanish supplier spec photo (demo)") { readImage("SEAS-01-rev2-es.jpg") }
        out = TextView(this).apply { textSize = 13f; setTextIsSelectable(true) }
        col.addView(out)
        setContentView(ScrollView(this).apply { addView(col, MATCH_PARENT, WRAP_CONTENT) })
        deviceInfo()
        // Run every test automatically on launch, in order, so a remote session needs no taps.
        lifecycleScope.launch {
            log("AUTO-RUN: all tests start now (ONLY_ON_DEVICE).")
            val st = try { checkStatus() } catch (e: Throwable) { log("ERROR status: ${e.message}"); null }
            if (st?.toString() == "DOWNLOADABLE" || st?.toString() == "DOWNLOADING") try { download() } catch (e: Throwable) { log("ERROR download: ${e.message}") }
            for (step in listOf<suspend () -> Unit>({ warmAndText() }, { readImage("B1-spec-en-facility.jpg") }, { readImage("SEAS-01-rev2-es.jpg") })) {
                try { step() } catch (e: Throwable) { log("ERROR ${e.javaClass.simpleName}: ${e.message}") }
            }
            try {
                val prev = Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
                    modelName = "gemini-3.5-flash-lite",
                    onDeviceConfig = OnDeviceConfig(mode = InferenceMode.ONLY_ON_DEVICE, maxOutputTokens = 512, modelOption = OnDeviceModelOption.PREVIEW))
                val ext = prev.onDeviceExtension!!
                log("PREVIEW model: status ${ext.checkStatus()}, name ${try { ext.getModelName() } catch (e: Throwable) { "n/a: " + e.message }}")
            } catch (e: Throwable) { log("PREVIEW check ERROR ${e.javaClass.simpleName}: ${e.message}") }
            log("AUTO-RUN finished.")
        }
    }

    private fun deviceInfo() {
        val aicore = try { packageManager.getPackageInfo("com.google.android.aicore", 0).versionName } catch (e: Exception) { "not installed" }
        log("Device: ${Build.MANUFACTURER} ${Build.MODEL} (${Build.DEVICE})")
        log("Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}), AICore: $aicore")
    }

    private suspend fun checkStatus(): Any? {
        val ext = model.onDeviceExtension ?: run { log("No on-device extension (firebase-ai-ondevice missing)"); return null }
        val t0 = SystemClock.elapsedRealtime()
        val s = ext.checkStatus()
        log("Nano status: $s (${SystemClock.elapsedRealtime() - t0} ms)")
        try { log("On-device model name: ${ext.getModelName()}") } catch (e: Throwable) { log("Model name: n/a (${e.message})") }
        return s
    }

    private suspend fun download() {
        val ext = model.onDeviceExtension ?: return log("No on-device extension")
        log("Starting download…")
        ext.download().collect { st ->
            when (st) {
                is DownloadStatus.DownloadStarted -> log("Download started: ${st.bytesToDownload / 1_000_000} MB")
                is DownloadStatus.DownloadInProgress -> { val mb = st.totalBytesDownloaded / 1_000_000; if (mb / 250 != lastMb / 250) log("Downloaded $mb MB"); lastMb = mb }
                is DownloadStatus.DownloadCompleted -> log("Download completed")
                is DownloadStatus.DownloadFailed -> log("Download FAILED: ${st.exception.message}")
                else -> log("Download: $st")
            }
        }
    }

    private suspend fun warmAndText() {
        val ext = model.onDeviceExtension ?: return log("No on-device extension")
        var t0 = SystemClock.elapsedRealtime()
        ext.warmUp()
        log("Warm-up: ${SystemClock.elapsedRealtime() - t0} ms")
        t0 = SystemClock.elapsedRealtime()
        val r = model.generateContent("Reply with exactly one word: ready")
        log("Text test: \"${r.text?.trim()}\" — source ${r.inferenceSource}, ${SystemClock.elapsedRealtime() - t0} ms")
    }

    private suspend fun readImage(file: String) {
        val bmp = assets.open(file).use { BitmapFactory.decodeStream(it) }
        log("Reading $file (${bmp.width}x${bmp.height}) on device…")
        val uid = Process.myUid()
        val tx0 = TrafficStats.getUidTxBytes(uid)
        val t0 = SystemClock.elapsedRealtime()
        val r = model.generateContent(content { image(bmp); text(SPEC_PROMPT) })
        val ms = SystemClock.elapsedRealtime() - t0
        val sent = TrafficStats.getUidTxBytes(uid) - tx0
        log("Done in $ms ms — source ${r.inferenceSource} — bytes sent by this app during the read: $sent")
        log("Output:\n${r.text}")
    }

    companion object {
        // Same prompt as the web app (src/proof/read.js, proof-read-3).
        const val SPEC_PROMPT = """This image is part of a food supplier's product specification sheet. It may be in English, Spanish or Japanese.
Transcribe only what is printed. Do not guess. Do not add anything that is not printed.
- language: "en", "es" or "ja".
- ingredients: every ingredient exactly as printed (same language and spelling), in order, each with a plain English translation.
- allergen_statement_printed: the allergen statement exactly as printed, or null if there is none.
- allergen_statement_english: its English translation, or null.
Return only the JSON."""
    }
}
