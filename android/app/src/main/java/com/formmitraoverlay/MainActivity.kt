package com.formmitraoverlay

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.formmitraoverlay.overlay.BubbleService
import com.formmitraoverlay.overlay.FormDetectReceiver
import com.formmitraoverlay.overlay.OverlayPackage
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "FormMitraOverlay"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleFormDetectIntent(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleFormDetectIntent(intent)
  }

  @Suppress("DEPRECATION")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    try {
      val overlayModule = OverlayPackage.getModule()
      overlayModule?.handleActivityResult(requestCode, resultCode, data)
    } catch (_: Exception) {}
  }

  private fun handleFormDetectIntent(intent: Intent?) {
    if (intent?.action != FormDetectReceiver.ACTION_SHOW_BUBBLE_ON_DETECT) return

    val targetPackage = intent.getStringExtra(FormDetectReceiver.EXTRA_TARGET_PACKAGE) ?: return
    val appLabel = intent.getStringExtra(FormDetectReceiver.EXTRA_APP_LABEL) ?: targetPackage
    val fieldCount = intent.getIntExtra(FormDetectReceiver.EXTRA_FIELD_COUNT, 0)

    val fields = JSONArray().apply {
      put(JSONObject().apply { put("label", "App Detected"); put("value", appLabel); put("source", "Auto-detect"); put("sensitive", false) })
      put(JSONObject().apply { put("label", "Package"); put("value", targetPackage); put("source", "System"); put("sensitive", false) })
      put(JSONObject().apply { put("label", "Input Fields"); put("value", fieldCount.toString()); put("source", "Accessibility"); put("sensitive", false) })
    }

    val savedFields = getSharedPreferences(BubbleService.EXTRA_FIELDS_PREFS, MODE_PRIVATE)
      .getString(BubbleService.EXTRA_FIELDS, null)
    if (!savedFields.isNullOrBlank()) {
      try {
        val savedArray = JSONArray(savedFields)
        for (i in 0 until savedArray.length()) {
          fields.put(savedArray.getJSONObject(i))
        }
      } catch (_: Exception) {}
    }

    val bubbleIntent = Intent(this, BubbleService::class.java).apply {
      action = BubbleService.ACTION_SHOW_BUBBLE
      putExtra(BubbleService.EXTRA_FIELDS, fields.toString())
    }
    startForegroundService(bubbleIntent)
  }
}
