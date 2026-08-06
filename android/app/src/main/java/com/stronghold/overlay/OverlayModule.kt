package com.stronghold.overlay

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.net.Uri
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray

class OverlayModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var windowManager: WindowManager? = null
    private var bubbleView: View? = null
    private var overlayRoot: View? = null
    private var isBubbleShowing = false
    private var isOverlayShowing = false
    private var expandedFields = mutableSetOf<Int>()

    override fun getName(): String = "OverlayModule"

    @ReactMethod
    fun checkPermission(promise: Promise) {
        promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
    }

    @ReactMethod
    fun requestPermission() {
        val activity = reactApplicationContext.currentActivity ?: return
        val intent = android.content.Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${activity.packageName}")
        )
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(intent)
    }

    @ReactMethod
    fun isAccessibilityEnabled(promise: Promise) {
        val ctx = reactApplicationContext
        val service = ComponentName(ctx, FormDetectorService::class.java).flattenToString()
        val enabled = Settings.Secure.getString(
            ctx.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )?.contains(service) == true
        promise.resolve(enabled)
    }

    @ReactMethod
    fun openAccessibilitySettings() {
        val intent = android.content.Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactApplicationContext.startActivity(intent)
    }

    @ReactMethod
    fun refreshNotification() {
        val ctx = reactApplicationContext
        val intent = Intent(ctx, BubbleService::class.java).apply {
            action = BubbleService.ACTION_REFRESH_NOTIFICATION
        }
        ctx.startForegroundService(intent)
    }

    @ReactMethod
    fun pickFile(promise: Promise) {
        val activity = reactApplicationContext.currentActivity ?: run {
            promise.reject("NO_ACTIVITY", "No current activity")
            return
        }

        val intent = android.content.Intent(android.content.Intent.ACTION_GET_CONTENT).apply {
            type = "*/*"
            addCategory(android.content.Intent.CATEGORY_OPENABLE)
            putExtra(android.content.Intent.EXTRA_ALLOW_MULTIPLE, false)
        }

        try {
            activity.startActivityForResult(
                android.content.Intent.createChooser(intent, "Select File"),
                PICK_FILE_REQUEST_CODE
            )
            pendingFilePromise = promise
        } catch (e: Exception) {
            promise.reject("PICK_FAILED", "Failed to open file picker: ${e.message}")
        }
    }

    @ReactMethod
    fun pickFiles(promise: Promise) {
        val activity = reactApplicationContext.currentActivity ?: run {
            promise.reject("NO_ACTIVITY", "No current activity")
            return
        }

        val intent = android.content.Intent(android.content.Intent.ACTION_GET_CONTENT).apply {
            type = "*/*"
            addCategory(android.content.Intent.CATEGORY_OPENABLE)
            putExtra(android.content.Intent.EXTRA_ALLOW_MULTIPLE, true)
        }

        try {
            activity.startActivityForResult(
                android.content.Intent.createChooser(intent, "Select Files"),
                PICK_FILES_REQUEST_CODE
            )
            pendingFilesPromise = promise
        } catch (e: Exception) {
            promise.reject("PICK_FAILED", "Failed to open file picker: ${e.message}")
        }
    }

    @ReactMethod
    fun openFileManager(promise: Promise) {
        val ctx = reactApplicationContext
        val intent = android.content.Intent(android.content.Intent.ACTION_GET_CONTENT).apply {
            type = "*/*"
            addCategory(android.content.Intent.CATEGORY_OPENABLE)
            putExtra(android.content.Intent.EXTRA_ALLOW_MULTIPLE, true)
        }

        try {
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(android.content.Intent.createChooser(intent, "Open File Manager"))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_FAILED", "Failed to open file manager: ${e.message}")
        }
    }

    @ReactMethod
    fun openDecryptedFile(path: String, mimeType: String, promise: Promise) {
        val ctx = reactApplicationContext
        try {
            val file = java.io.File(path)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "Decrypted file not found in temp cache")
                return
            }

            val uri = androidx.core.content.FileProvider.getUriForFile(
                ctx,
                "${ctx.packageName}.fileprovider",
                file
            )

            val viewer = android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mimeType.ifEmpty { "application/octet-stream" })
                addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            }

            val chooser = android.content.Intent.createChooser(viewer, "Open Decrypted File")
            chooser.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(chooser)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_FAILED", "Failed to open decrypted file: ${e.message}")
        }
    }

    @ReactMethod
    fun shareDecryptedFile(path: String, mimeType: String, promise: Promise) {
        val ctx = reactApplicationContext
        try {
            val file = java.io.File(path)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "Decrypted file not found in temp cache")
                return
            }

            val uri = androidx.core.content.FileProvider.getUriForFile(
                ctx,
                "${ctx.packageName}.fileprovider",
                file
            )

            val send = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                type = mimeType.ifEmpty { "*/*" }
                putExtra(android.content.Intent.EXTRA_STREAM, uri)
                addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            val chooser = android.content.Intent.createChooser(send, "Attach Decrypted File")
            chooser.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(chooser)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SHARE_FAILED", "Failed to attach decrypted file: ${e.message}")
        }
    }

    fun handleActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
        when (requestCode) {
            PICK_FILE_REQUEST_CODE -> {
                val promise = pendingFilePromise ?: return
                pendingFilePromise = null

                if (resultCode == android.app.Activity.RESULT_OK && data?.data != null) {
                    val uri = data.data!!
                    val result = Arguments.createMap().apply {
                        putString("uri", uri.toString())
                        putString("name", getFileName(uri))
                        putString("mimeType", reactApplicationContext.contentResolver.getType(uri) ?: "application/octet-stream")
                        putLong("size", getFileSize(uri))
                    }
                    promise.resolve(result)
                } else {
                    promise.reject("CANCELLED", "File selection cancelled")
                }
            }
            PICK_FILES_REQUEST_CODE -> {
                val promise = pendingFilesPromise ?: return
                pendingFilesPromise = null

                if (resultCode == android.app.Activity.RESULT_OK && data != null) {
                    val files = Arguments.createArray()
                    val clipData = data.clipData

                    if (clipData != null) {
                        for (i in 0 until clipData.itemCount) {
                            val uri = clipData.getItemAt(i).uri
                            val fileMap = Arguments.createMap().apply {
                                putString("uri", uri.toString())
                                putString("name", getFileName(uri))
                                putString("mimeType", reactApplicationContext.contentResolver.getType(uri) ?: "application/octet-stream")
                                putLong("size", getFileSize(uri))
                            }
                            files.pushMap(fileMap)
                        }
                    } else if (data.data != null) {
                        val uri = data.data!!
                        val fileMap = Arguments.createMap().apply {
                            putString("uri", uri.toString())
                            putString("name", getFileName(uri))
                            putString("mimeType", reactApplicationContext.contentResolver.getType(uri) ?: "application/octet-stream")
                            putLong("size", getFileSize(uri))
                        }
                        files.pushMap(fileMap)
                    }

                    val result = Arguments.createMap().apply {
                        putArray("files", files)
                        putInt("count", files.size())
                    }
                    promise.resolve(result)
                } else {
                    promise.reject("CANCELLED", "File selection cancelled")
                }
            }
        }
    }

    private fun getFileName(uri: android.net.Uri): String {
        var fileName = "unknown"
        val cursor = reactApplicationContext.contentResolver.query(uri, null, null, null, null)
        cursor?.use {
            if (it.moveToFirst()) {
                val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0) {
                    fileName = it.getString(nameIndex) ?: "unknown"
                }
            }
        }
        return fileName
    }

    private fun getFileSize(uri: android.net.Uri): Long {
        var size = 0L
        val cursor = reactApplicationContext.contentResolver.query(uri, null, null, null, null)
        cursor?.use {
            if (it.moveToFirst()) {
                val sizeIndex = it.getColumnIndex(android.provider.OpenableColumns.SIZE)
                if (sizeIndex >= 0) {
                    size = it.getLong(sizeIndex)
                }
            }
        }
        return size
    }

    companion object {
        private const val PICK_FILE_REQUEST_CODE = 1001
        private const val PICK_FILES_REQUEST_CODE = 1002
        private var pendingFilePromise: Promise? = null
        private var pendingFilesPromise: Promise? = null
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
                if (isOverlayShowing) hideOverlayInternal()
                if (isBubbleShowing) hideBubbleInternal()

                val fieldsJson = data.getString("fields") ?: "[]"
                val fields = parseFields(fieldsJson)

                windowManager = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager

                showBubble(fields)
            } catch (e: Exception) {
                sendEvent("onOverlayError", "showOverlay failed: ${e.message}")
            }
        }
    }

    private fun showBubble(fields: List<OverlayField>) {
        val ctx = reactApplicationContext
        val dm = ctx.resources.displayMetrics
        val dp = dm.density
        val wm = windowManager ?: return

        val bubble = FrameLayout(ctx).apply {
            setBackgroundColor(Color.parseColor("#CC7c3aed"))
            setPadding((14 * dp).toInt(), (14 * dp).toInt(), (14 * dp).toInt(), (14 * dp).toInt())
        }

        val icon = TextView(ctx).apply {
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
            x = (dm.widthPixels - bubbleSize - (16 * dp).toInt())
            y = (dm.heightPixels / 3)
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
                        showFullOverlay(fields)
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
        try {
            windowManager?.removeView(bubbleView)
        } catch (_: Exception) {}
        bubbleView = null
        isBubbleShowing = false
    }

    private fun showFullOverlay(fields: List<OverlayField>) {
        val ctx = reactApplicationContext
        val dm = ctx.resources.displayMetrics
        val dp = dm.density
        val wm = windowManager ?: return

        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#CC0C0C18"))
            setPadding(
                (12 * dp).toInt(), (10 * dp).toInt(),
                (12 * dp).toInt(), (8 * dp).toInt()
            )
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val headerRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val dragHandle = TextView(ctx).apply {
            text = "⠿"
            setTextColor(Color.parseColor("#666666"))
            textSize = 18f
        }
        headerRow.addView(dragHandle)

        val title = TextView(ctx).apply {
            text = "  StrongHold"
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

        val collapseBtn = TextView(ctx).apply {
            text = " ─ "
            setTextColor(Color.parseColor("#FFD700"))
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setPadding((8 * dp).toInt(), 0, 0, 0)
            setOnClickListener {
                UiThreadUtil.runOnUiThread {
                    hideOverlayInternal()
                    showBubble(fields)
                }
            }
        }
        headerRow.addView(collapseBtn)

        val closeBtn = TextView(ctx).apply {
            text = " ✕ "
            setTextColor(Color.parseColor("#ff4646"))
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setPadding((4 * dp).toInt(), 0, 0, 0)
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

        val scrollView = ScrollView(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
            )
            isVerticalScrollBarEnabled = true
        }

        val fieldsLayout = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
        }

        fields.forEachIndexed { index, field ->
            val fieldRow = LinearLayout(ctx).apply {
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

            val headerLayout = LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }

            val label = TextView(ctx).apply {
                text = field.label.uppercase()
                setTextColor(Color.parseColor("#AAAAAA"))
                textSize = 10f
                typeface = Typeface.DEFAULT_BOLD
                layoutParams = LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
                )
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
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
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

        scrollView.addView(fieldsLayout)
        root.addView(scrollView)

        val footer = TextView(ctx).apply {
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
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_SECURE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP
            y = 0
        }

        var isDragging = false
        var dragStartY = 0f
        var overlayStartY = 0

        dragHandle.setOnTouchListener { _, event ->
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
            sendEvent("onOverlayShown", Arguments.createMap().apply { putString("status", "shown") })
        } catch (e: Exception) {
            sendEvent("onOverlayError", "showOverlay failed: ${e.message}")
        }
    }

    @ReactMethod
    fun hideOverlay() {
        UiThreadUtil.runOnUiThread {
            hideBubbleInternal()
            hideOverlayInternal()
        }
    }

    private fun hideOverlayInternal() {
        if (!isOverlayShowing) return
        try {
            windowManager?.removeView(overlayRoot)
        } catch (_: Exception) {}
        expandedFields.clear()
        overlayRoot = null
        isOverlayShowing = false
        sendEvent("onOverlayHidden", Arguments.createMap().apply { putString("status", "hidden") })
    }

    @ReactMethod
    fun isShowing(promise: Promise) {
        promise.resolve(isBubbleShowing || isOverlayShowing)
    }

    @ReactMethod
    fun startBubbleService(fieldsJson: String) {
        val ctx = reactApplicationContext
        val intent = Intent(ctx, BubbleService::class.java).apply {
            action = BubbleService.ACTION_SHOW_BUBBLE
            putExtra(BubbleService.EXTRA_FIELDS, fieldsJson)
        }
        ctx.startForegroundService(intent)
    }

    @ReactMethod
    fun showOverlayFromService(fieldsJson: String) {
        val ctx = reactApplicationContext
        val intent = Intent(ctx, BubbleService::class.java).apply {
            action = BubbleService.ACTION_SHOW_OVERLAY
            putExtra(BubbleService.EXTRA_FIELDS, fieldsJson)
        }
        ctx.startForegroundService(intent)
    }

    @ReactMethod
    fun stopBubbleService() {
        val ctx = reactApplicationContext
        val intent = Intent(ctx, BubbleService::class.java).apply {
            action = BubbleService.ACTION_STOP
        }
        ctx.startForegroundService(intent)
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
}
