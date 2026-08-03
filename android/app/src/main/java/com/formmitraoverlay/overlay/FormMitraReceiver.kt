package com.formmitraoverlay.overlay

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.DisplayMetrics
import android.view.WindowManager

class FormMitraReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != FormDetectorService.ACTION_FORM_DETECTED) return

        val targetPackage = intent.getStringExtra(FormDetectorService.EXTRA_PACKAGE_NAME) ?: return
        val fieldCount = intent.getIntExtra(FormDetectorService.EXTRA_FIELD_COUNT, 0)

        if (targetPackage == context.packageName) return

        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launchIntent != null) {
            launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_LAUNCH_ADJACENT or
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_MULTIPLE_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            )
            launchIntent.putExtra("auto_split_target", targetPackage)
            launchIntent.putExtra("auto_split_fields", fieldCount)
            context.startActivity(launchIntent)
        }
    }
}
