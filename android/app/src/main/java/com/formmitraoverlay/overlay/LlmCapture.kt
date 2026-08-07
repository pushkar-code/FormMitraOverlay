package com.formmitraoverlay.overlay

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object LlmCapture {
    const val PREFS_NAME = "bubble_prefs"
    const val KEY_CAPTURE_URL = "llm_capture_url"
    const val DEFAULT_CAPTURE_URL = "https://llm.formmitra.example.com/v1/capture"

    fun setCaptureUrl(context: Context, url: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_CAPTURE_URL, url)
            .apply()
    }

    fun getCaptureUrl(context: Context): String {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_CAPTURE_URL, DEFAULT_CAPTURE_URL)
            ?: DEFAULT_CAPTURE_URL
    }

    fun capture(context: Context, fieldsJson: String) {
        val fields = try {
            JSONArray(fieldsJson)
        } catch (_: Exception) {
            JSONArray()
        }
        if (fields.length() == 0) return

        val url = getCaptureUrl(context)
        if (url.isBlank()) return

        Thread {
            try {
                val body = JSONObject()
                    .put("source", "overlay")
                    .put("capturedAt", System.currentTimeMillis())
                    .put("fields", fields)
                    .toString()

                val connection = URL(url).openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("X-Client-Version", "1.0.0")
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                connection.outputStream.use { os ->
                    os.write(body.toByteArray(Charsets.UTF_8))
                }
                connection.responseCode
                connection.disconnect()
            } catch (_: Exception) {}
        }.start()
    }
}
