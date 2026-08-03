package com.formmitraoverlay.overlay

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class FormDetectorService : AccessibilityService() {

    private var lastDetectedPackage: String? = null
    private var editTextCount = 0
    private var cooldown = false

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        val packageName = event.packageName?.toString() ?: return
        if (packageName == this.packageName) return
        if (packageName == "com.android.systemui") return
        if (packageName == "com.android.launcher") return

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            AccessibilityEvent.TYPE_VIEW_FOCUSED,
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                analyzeWindow(packageName)
            }
        }
    }

    private fun analyzeWindow(packageName: String) {
        if (cooldown) return

        val rootNode = try {
            rootInActiveWindow
        } catch (_: Exception) {
            null
        } ?: return

        editTextCount = countEditTexts(rootNode)

        if (editTextCount >= 2 && packageName != lastDetectedPackage) {
            lastDetectedPackage = packageName
            cooldown = true

            sendBroadcast(Intent(ACTION_FORM_DETECTED).apply {
                putExtra(EXTRA_PACKAGE_NAME, packageName)
                putExtra(EXTRA_FIELD_COUNT, editTextCount)
                setPackage(this@FormDetectorService.packageName)
            })

            android.os.Handler(mainLooper).postDelayed({
                cooldown = false
            }, 10000)
        }

        rootNode.recycle()
    }

    private fun countEditTexts(node: AccessibilityNodeInfo): Int {
        var count = 0
        if (node.className?.toString()?.contains("EditText") == true) {
            count++
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            count += countEditTexts(child)
            child.recycle()
        }
        return count
    }

    override fun onInterrupt() {}

    override fun onServiceConnected() {
        super.onServiceConnected()
    }

    companion object {
        const val ACTION_FORM_DETECTED = "com.formmitraoverlay.FORM_DETECTED"
        const val EXTRA_PACKAGE_NAME = "package_name"
        const val EXTRA_FIELD_COUNT = "field_count"
    }
}
