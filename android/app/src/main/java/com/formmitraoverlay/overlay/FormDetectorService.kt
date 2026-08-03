package com.formmitraoverlay.overlay

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class FormDetectorService : AccessibilityService() {

    private var lastTriggeredPackage: String? = null
    private var cooldown = false

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        val packageName = event.packageName?.toString() ?: return
        if (packageName == this.packageName) return
        if (packageName == "com.android.systemui") return
        if (packageName.startsWith("com.android.launcher")) return

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                if (packageName != lastTriggeredPackage && !cooldown) {
                    checkForFormAndTrigger(packageName)
                }
            }
        }
    }

    private fun checkForFormAndTrigger(packageName: String) {
        val rootNode = try {
            rootInActiveWindow
        } catch (_: Exception) {
            null
        } ?: return

        val inputCount = countInputFields(rootNode, 0)
        rootNode.recycle()

        Log.d(TAG, "Window: $packageName, inputs: $inputCount")

        if (inputCount >= 2) {
            lastTriggeredPackage = packageName
            cooldown = true

            Log.d(TAG, "FORM TRIGGERED: $packageName ($inputCount fields)")

            sendBroadcast(Intent(ACTION_FORM_DETECTED).apply {
                putExtra(EXTRA_PACKAGE_NAME, packageName)
                putExtra(EXTRA_FIELD_COUNT, inputCount)
                setPackage(this@FormDetectorService.packageName)
            })

            android.os.Handler(mainLooper).postDelayed({
                cooldown = false
            }, 15000)
        }
    }

    private fun countInputFields(node: AccessibilityNodeInfo, depth: Int): Int {
        if (depth > 20) return 0

        var count = 0
        if (node.isEditable) count++

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            count += countInputFields(child, depth + 1)
            child.recycle()
        }
        return count
    }

    override fun onInterrupt() {}

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.d(TAG, "FormDetectorService connected and active")
    }

    companion object {
        private const val TAG = "FormDetector"
        const val ACTION_FORM_DETECTED = "com.formmitraoverlay.FORM_DETECTED"
        const val EXTRA_PACKAGE_NAME = "package_name"
        const val EXTRA_FIELD_COUNT = "field_count"
    }
}
