package com.formmitraoverlay.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray

class BubbleService : Service() {

    private var windowManager: WindowManager? = null
    private var bubbleView: View? = null
    private var overlayRoot: View? = null
    private var isBubbleShowing = false
    private var isOverlayShowing = false
    private var expandedFields = mutableSetOf<Int>()
    private var fieldsData: String = "[]"

    private val prefs: SharedPreferences by lazy {
        getSharedPreferences("bubble_prefs", MODE_PRIVATE)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForegroundWithNotification()
        requestBatteryExemption()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SHOW_BUBBLE -> {
                fieldsData = intent.getStringExtra(EXTRA_FIELDS) ?: "[]"
                prefs.edit().putString(EXTRA_FIELDS, fieldsData).apply()
                val dm = resources.displayMetrics
                if (Settings.canDrawOverlays(this)) {
                    showBubble(dm)
                }
            }
            ACTION_SHOW_OVERLAY -> {
                fieldsData = intent.getStringExtra(EXTRA_FIELDS) ?: "[]"
                prefs.edit().putString(EXTRA_FIELDS, fieldsData).apply()
                val dm = resources.displayMetrics
                if (Settings.canDrawOverlays(this)) {
                    hideBubbleInternal()
                    showFullOverlay(dm)
                }
            }
            ACTION_HIDE_ALL -> {
                hideBubbleInternal()
                hideOverlayInternal()
            }
            ACTION_REFRESH_NOTIFICATION -> {
                startForegroundWithNotification()
            }
            ACTION_RECREATE_BUBBLE -> {
                fieldsData = prefs.getString(EXTRA_FIELDS, "[]") ?: "[]"
                val dm = resources.displayMetrics
                if (Settings.canDrawOverlays(this) && !isBubbleShowing && !isOverlayShowing) {
                    showBubble(dm)
                }
            }
            ACTION_STOP -> {
                hideBubbleInternal()
                hideOverlayInternal()
                prefs.edit().clear().apply()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            null -> {
                fieldsData = prefs.getString(EXTRA_FIELDS, "[]") ?: "[]"
                val dm = resources.displayMetrics
                if (Settings.canDrawOverlays(this) && !isBubbleShowing && !isOverlayShowing) {
                    showBubble(dm)
                }
            }
        }
        return START_STICKY
    }

    private fun requestBatteryExemption() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            }
        } catch (_: Exception) {}
    }

    private fun startForegroundWithNotification() {
        val channelId = "form_mitra_bubble"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Form Mitra Bubble",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the Form Mitra floating bubble active"
                setShowBadge(false)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }

        val launchIntent = Intent(this, com.formmitraoverlay.MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, BubbleService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPending = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val accessibilityEnabled = isAccessibilityServiceEnabled()

        val builder = Notification.Builder(this, channelId)
            .setContentTitle("Form Mitra")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)

        if (accessibilityEnabled) {
            builder.setContentText("Bubble active • Auto-detect ON")
        } else {
            builder.setContentText("Bubble active • Tap to enable auto-detect")
            val a11yIntent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            a11yIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val a11yPending = PendingIntent.getActivity(
                this, 2, a11yIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            builder.addAction(
                Notification.Action.Builder(null, "Enable Auto-Detect", a11yPending).build()
            )
        }

        builder.addAction(Notification.Action.Builder(null, "Close", stopPending).build())

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, builder.build(), android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(1, builder.build())
        }
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val service = ComponentName(this, FormDetectorService::class.java).flattenToString()
        return Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )?.contains(service) == true
    }

    private fun showBubble(dm: DisplayMetrics) {
        if (isBubbleShowing || isOverlayShowing) return

        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val dp = dm.density
        val wm = windowManager ?: return

        val bubble = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#CC7c3aed"))
            setPadding((14 * dp).toInt(), (14 * dp).toInt(), (14 * dp).toInt(), (14 * dp).toInt())
        }

        val icon = TextView(this).apply {
            text = "FM"
            setTextColor(Color.WHITE)
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        bubble.addView(icon)

        val bubbleSize = (52 * dp).toInt()
        val params = WindowManager.LayoutParams(
            bubbleSize,
            bubbleSize,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_SECURE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dm.widthPixels - bubbleSize - (16 * dp).toInt()
            y = dm.heightPixels / 3
        }

        var isDragging = false
        var startTouchX = 0f
        var startTouchY = 0f
        var startViewX = 0
        var startViewY = 0
        val slop = (10 * dp)

        bubble.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startTouchX = event.rawX
                    startTouchY = event.rawY
                    startViewX = params.x
                    startViewY = params.y
                    isDragging = false
                    bubble.scaleX = 0.9f
                    bubble.scaleY = 0.9f
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - startTouchX).toInt()
                    val dy = (event.rawY - startTouchY).toInt()
                    if (Math.abs(dx) > slop || Math.abs(dy) > slop) {
                        isDragging = true
                    }
                    if (isDragging) {
                        params.x = startViewX + dx
                        params.y = startViewY + dy
                        try { wm.updateViewLayout(bubble, params) } catch (_: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    bubble.scaleX = 1f
                    bubble.scaleY = 1f
                    if (!isDragging) {
                        hideBubbleInternal()
                        showFullOverlay(dm)
                    }
                    true
                }
                else -> false
            }
        }

        try {
            wm.addView(bubble, params)
            bubbleView = bubble
            isBubbleShowing = true
        } catch (_: Exception) {}
    }

    private fun hideBubbleInternal() {
        if (!isBubbleShowing) return
        try { windowManager?.removeView(bubbleView) } catch (_: Exception) {}
        bubbleView = null
        isBubbleShowing = false
    }

    private fun showFullOverlay(dm: DisplayMetrics) {
        if (isOverlayShowing) return
        val dp = dm.density
        val wm = windowManager ?: return
        val fields = parseFields(fieldsData)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#CC0C0C18"))
            setPadding(
                (12 * dp).toInt(), (10 * dp).toInt(),
                (12 * dp).toInt(), (8 * dp).toInt()
            )
        }

        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val dragHandle = TextView(this).apply {
            text = "⠿"
            setTextColor(Color.parseColor("#666666"))
            textSize = 18f
        }
        headerRow.addView(dragHandle)

        val title = TextView(this).apply {
            text = "  Form Mitra"
            setTextColor(Color.WHITE)
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(title)

        val badge = TextView(this).apply {
            text = " ENCRYPTED "
            setTextColor(Color.parseColor("#22c55e"))
            textSize = 9f
            typeface = Typeface.DEFAULT_BOLD
            setBackgroundColor(Color.parseColor("#2222c55e"))
            setPadding((6 * dp).toInt(), (2 * dp).toInt(), (6 * dp).toInt(), (2 * dp).toInt())
        }
        headerRow.addView(badge)

        val collapseBtn = TextView(this).apply {
            text = " ─ "
            setTextColor(Color.parseColor("#FFD700"))
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setPadding((8 * dp).toInt(), 0, 0, 0)
            setOnClickListener {
                hideOverlayInternal()
                val d = resources.displayMetrics
                showBubble(d)
            }
        }
        headerRow.addView(collapseBtn)

        val closeBtn = TextView(this).apply {
            text = " ✕ "
            setTextColor(Color.parseColor("#ff4646"))
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setPadding((4 * dp).toInt(), 0, 0, 0)
            setOnClickListener { hideOverlayInternal() }
        }
        headerRow.addView(closeBtn)
        root.addView(headerRow)

        val divider = View(this).apply {
            setBackgroundColor(Color.parseColor("#18FFFFFF"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, (1 * dp).toInt()
            ).apply { topMargin = (8 * dp).toInt(); bottomMargin = (6 * dp).toInt() }
        }
        root.addView(divider)

        val scrollView = android.widget.ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
            )
        }

        val fieldsLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        fields.forEachIndexed { index, field ->
            val fieldRow = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(Color.parseColor("#0DFFFFFF"))
                setPadding(
                    (10 * dp).toInt(), (8 * dp).toInt(),
                    (10 * dp).toInt(), (8 * dp).toInt()
                )
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = (6 * dp).toInt() }
            }

            val headerLayout = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }

            val label = TextView(this).apply {
                text = field.label.uppercase()
                setTextColor(Color.parseColor("#AAAAAA"))
                textSize = 10f
                typeface = Typeface.DEFAULT_BOLD
                layoutParams = LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
                )
            }
            headerLayout.addView(label)

            val source = TextView(this).apply {
                text = "from ${field.source}"
                setTextColor(Color.parseColor("#555555"))
                textSize = 10f
            }
            headerLayout.addView(source)
            fieldRow.addView(headerLayout)

            val valueText = TextView(this).apply {
                text = maskValue(field)
                setTextColor(Color.WHITE)
                textSize = 15f
                typeface = Typeface.MONOSPACE
                letterSpacing = 0.05f
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = (4 * dp).toInt() }
            }
            fieldRow.addView(valueText)

            if (field.sensitive) {
                val sensitiveBadge = TextView(this).apply {
                    text = " SENSITIVE "
                    setTextColor(Color.parseColor("#EF4444"))
                    textSize = 9f
                    typeface = Typeface.DEFAULT_BOLD
                    setBackgroundColor(Color.parseColor("#18EF4444"))
                    setPadding(
                        (6 * dp).toInt(), (2 * dp).toInt(),
                        (6 * dp).toInt(), (2 * dp).toInt()
                    )
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
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

        if (fields.isEmpty()) {
            val emptyText = TextView(this).apply {
                text = "No data available"
                setTextColor(Color.parseColor("#666666"))
                textSize = 14f
                gravity = Gravity.CENTER
                setPadding(0, (16 * dp).toInt(), 0, (16 * dp).toInt())
            }
            fieldsLayout.addView(emptyText)
        }

        scrollView.addView(fieldsLayout)
        root.addView(scrollView)

        val footer = TextView(this).apply {
            text = "AES-256-GCM | Tap to reveal | Drag ⠿ to move"
            setTextColor(Color.parseColor("#444444"))
            textSize = 10f
            gravity = Gravity.CENTER
            setPadding(0, (6 * dp).toInt(), 0, 0)
        }
        root.addView(footer)

        val halfHeight = (dm.heightPixels * 0.55).toInt()
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            halfHeight,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_SECURE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP
            y = 0
        }

        var isDragging = false
        var dragStartY = 0f
        var overlayStartY = 0

        root.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    dragStartY = event.rawY
                    overlayStartY = params.y
                    isDragging = false
                    dragHandle.setTextColor(Color.parseColor("#22c55e"))
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dy = (event.rawY - dragStartY).toInt()
                    if (Math.abs(dy) > (8 * dp)) isDragging = true
                    if (isDragging) {
                        params.y = overlayStartY + dy
                        try { wm.updateViewLayout(root, params) } catch (_: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    dragHandle.setTextColor(Color.parseColor("#666666"))
                    true
                }
                else -> false
            }
        }

        try {
            wm.addView(root, params)
            overlayRoot = root
            isOverlayShowing = true
            LlmCapture.capture(this, fieldsData)
        } catch (_: Exception) {}
    }

    private fun hideOverlayInternal() {
        if (!isOverlayShowing) return
        try { windowManager?.removeView(overlayRoot) } catch (_: Exception) {}
        expandedFields.clear()
        overlayRoot = null
        isOverlayShowing = false
    }

    private data class OverlayField(
        val label: String, val value: String, val source: String, val sensitive: Boolean
    )

    private fun parseFields(json: String): List<OverlayField> {
        val list = mutableListOf<OverlayField>()
        try {
            val arr = JSONArray(json)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                list.add(
                    OverlayField(
                        label = obj.optString("label", "Field $i"),
                        value = obj.optString("value", ""),
                        source = obj.optString("source", ""),
                        sensitive = obj.optBoolean("sensitive", false)
                    )
                )
            }
        } catch (_: Exception) {}
        return list
    }

    private fun maskValue(field: OverlayField): String {
        val v = field.value
        if (v.length <= 4) return "****"
        return "X".repeat(v.length - 4) + v.takeLast(4)
    }

    override fun onDestroy() {
        hideBubbleInternal()
        hideOverlayInternal()
        super.onDestroy()
    }

    companion object {
        const val ACTION_SHOW_BUBBLE = "com.formmitraoverlay.SHOW_BUBBLE"
        const val ACTION_SHOW_OVERLAY = "com.formmitraoverlay.SHOW_OVERLAY"
        const val ACTION_HIDE_ALL = "com.formmitraoverlay.HIDE_ALL"
        const val ACTION_REFRESH_NOTIFICATION = "com.formmitraoverlay.REFRESH_NOTIFICATION"
        const val ACTION_RECREATE_BUBBLE = "com.formmitraoverlay.RECREATE_BUBBLE"
        const val ACTION_STOP = "com.formmitraoverlay.STOP"
        const val EXTRA_FIELDS = "fields"
        const val EXTRA_FIELDS_PREFS = "bubble_prefs"
    }
}
