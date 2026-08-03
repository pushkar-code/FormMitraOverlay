package com.formmitraoverlay.overlay

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.method.ScrollingMovementMethod
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.UiThreadUtil
import org.json.JSONArray
import org.json.JSONObject

class OverlayModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var windowManager: WindowManager? = null
    private var overlayContainer: View? = null
    private var isOverlayShowing = false
    private var expandedFields = mutableSetOf<Int>()

    override fun getName(): String = "OverlayModule"

    @ReactMethod
    fun checkPermission(promise: Promise) {
        val canDraw = Settings.canDrawOverlays(reactApplicationContext)
        promise.resolve(canDraw)
    }

    @ReactMethod
    fun requestPermission() {
        val activity = reactApplicationContext.currentActivity ?: return
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${activity.packageName}")
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(intent)
    }

    @ReactMethod
    fun showOverlay(data: ReadableMap) {
        val ctx = reactApplicationContext

        if (!Settings.canDrawOverlays(ctx)) {
            sendEvent("onOverlayError", "Overlay permission not granted")
            return
        }

        UiThreadUtil.runOnUiThread {
            try {
                if (isOverlayShowing) {
                    hideOverlayInternal()
                }

                val fieldsJson = data.getString("fields") ?: "[]"
                val fields = parseFields(fieldsJson)

                windowManager = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
                val dp = ctx.resources.displayMetrics.density

                val root = LinearLayout(ctx).apply {
                    orientation = LinearLayout.VERTICAL
                    setBackgroundColor(Color.parseColor("#CC0C0C18"))
                    setPadding((12 * dp).toInt(), (10 * dp).toInt(), (12 * dp).toInt(), (8 * dp).toInt())
                }

                val headerRow = LinearLayout(ctx).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                }

                val title = TextView(ctx).apply {
                    text = "Form Mitra"
                    setTextColor(Color.WHITE)
                    textSize = 15f
                    typeface = Typeface.DEFAULT_BOLD
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }
                headerRow.addView(title)

                val badge = TextView(ctx).apply {
                    text = " ENCRYPTED "
                    setTextColor(Color.parseColor("#22c55e"))
                    textSize = 9f
                    typeface = Typeface.DEFAULT_BOLD
                    setBackgroundColor(Color.parseColor("#2222c55e"))
                    setPadding((6 * dp).toInt(), (2 * dp).toInt(), (6 * dp).toInt(), (2 * dp).toInt())
                }
                headerRow.addView(badge)

                val closeBtn = TextView(ctx).apply {
                    text = " ✕ "
                    setTextColor(Color.parseColor("#ff4646"))
                    textSize = 14f
                    typeface = Typeface.DEFAULT_BOLD
                    setPadding((8 * dp).toInt(), 0, 0, 0)
                    setOnClickListener {
                        UiThreadUtil.runOnUiThread { hideOverlayInternal() }
                    }
                }
                headerRow.addView(closeBtn)

                root.addView(headerRow)

                val divider = View(ctx).apply {
                    setBackgroundColor(Color.parseColor("#18FFFFFF"))
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, (1 * dp).toInt()
                    ).apply { topMargin = (8 * dp).toInt(); bottomMargin = (6 * dp).toInt() }
                }
                root.addView(divider)

                val scrollView = ScrollView(ctx)
                val fieldsLayout = LinearLayout(ctx).apply {
                    orientation = LinearLayout.VERTICAL
                }

                fields.forEachIndexed { index, field ->
                    val fieldRow = LinearLayout(ctx).apply {
                        orientation = LinearLayout.VERTICAL
                        setBackgroundColor(Color.parseColor("#0DFFFFFF"))
                        setPadding((10 * dp).toInt(), (8 * dp).toInt(), (10 * dp).toInt(), (8 * dp).toInt())
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply { bottomMargin = (6 * dp).toInt() }
                    }

                    val headerLayout = LinearLayout(ctx).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER_VERTICAL
                    }

                    val label = TextView(ctx).apply {
                        text = field.label.uppercase()
                        setTextColor(Color.parseColor("#AAAAAA"))
                        textSize = 10f
                        typeface = Typeface.DEFAULT_BOLD
                        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    }
                    headerLayout.addView(label)

                    val source = TextView(ctx).apply {
                        text = "from ${field.source}"
                        setTextColor(Color.parseColor("#555555"))
                        textSize = 10f
                    }
                    headerLayout.addView(source)
                    fieldRow.addView(headerLayout)

                    val valueText = TextView(ctx).apply {
                        text = maskValue(field)
                        setTextColor(Color.WHITE)
                        textSize = 15f
                        typeface = Typeface.MONOSPACE
                        letterSpacing = 0.05f
                        layoutParams = LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
                        ).apply { topMargin = (4 * dp).toInt() }
                    }
                    fieldRow.addView(valueText)

                    if (field.sensitive) {
                        val sensitiveBadge = TextView(ctx).apply {
                            text = " SENSITIVE "
                            setTextColor(Color.parseColor("#EF4444"))
                            textSize = 9f
                            typeface = Typeface.DEFAULT_BOLD
                            setBackgroundColor(Color.parseColor("#18EF4444"))
                            setPadding((6 * dp).toInt(), (2 * dp).toInt(), (6 * dp).toInt(), (2 * dp).toInt())
                            layoutParams = LinearLayout.LayoutParams(
                                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
                            ).apply { topMargin = (4 * dp).toInt() }
                        }
                        fieldRow.addView(sensitiveBadge)
                    }

                    fieldRow.tag = index
                    fieldRow.setOnClickListener {
                        val i = fieldRow.tag as Int
                        if (expandedFields.contains(i)) {
                            expandedFields.remove(i)
                            valueText.text = maskValue(field)
                        } else {
                            expandedFields.add(i)
                            valueText.text = field.value
                        }
                    }

                    fieldsLayout.addView(fieldRow)
                }

                scrollView.addView(fieldsLayout)
                root.addView(scrollView, LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
                ))

                val footer = TextView(ctx).apply {
                    text = "AES-256-GCM | Tap field to reveal"
                    setTextColor(Color.parseColor("#444444"))
                    textSize = 10f
                    gravity = Gravity.CENTER
                    setPadding(0, (6 * dp).toInt(), 0, 0)
                }
                root.addView(footer)

                val params = WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_SECURE,
                    PixelFormat.TRANSLUCENT
                ).apply {
                    gravity = Gravity.TOP
                }

                windowManager?.addView(root, params)
                overlayContainer = root
                isOverlayShowing = true

                sendEvent("onOverlayShown", Arguments.createMap().apply {
                    putString("status", "shown")
                })
            } catch (e: Exception) {
                sendEvent("onOverlayError", "showOverlay failed: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun hideOverlay() {
        UiThreadUtil.runOnUiThread { hideOverlayInternal() }
    }

    private fun hideOverlayInternal() {
        if (!isOverlayShowing) return
        try {
            val wm = windowManager ?: return
            val root = overlayContainer ?: return
            wm.removeView(root)
        } catch (_: Exception) {}

        expandedFields.clear()
        overlayContainer = null
        windowManager = null
        isOverlayShowing = false

        sendEvent("onOverlayHidden", Arguments.createMap().apply {
            putString("status", "hidden")
        })
    }

    @ReactMethod
    fun isShowing(promise: Promise) {
        promise.resolve(isOverlayShowing)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    private fun sendEvent(eventName: String, params: Any?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private data class OverlayField(
        val label: String,
        val value: String,
        val source: String,
        val sensitive: Boolean
    )

    private fun parseFields(json: String): List<OverlayField> {
        val list = mutableListOf<OverlayField>()
        try {
            val arr = JSONArray(json)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                list.add(OverlayField(
                    label = obj.optString("label", "Field $i"),
                    value = obj.optString("value", ""),
                    source = obj.optString("source", ""),
                    sensitive = obj.optBoolean("sensitive", false)
                ))
            }
        } catch (_: Exception) {}
        return list
    }

    private fun maskValue(field: OverlayField): String {
        val v = field.value
        if (v.length <= 4) return "****"
        return "X".repeat(v.length - 4) + v.takeLast(4)
    }
}
