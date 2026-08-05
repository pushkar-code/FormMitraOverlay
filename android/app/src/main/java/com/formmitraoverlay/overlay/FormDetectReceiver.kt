package com.formmitraoverlay.overlay

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.formmitraoverlay.MainActivity

class FormDetectReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != FormDetectorService.ACTION_FORM_DETECTED) return

        val targetPackage = intent.getStringExtra(FormDetectorService.EXTRA_PACKAGE_NAME) ?: return
        val fieldCount = intent.getIntExtra(FormDetectorService.EXTRA_FIELD_COUNT, 0)

        if (targetPackage == context.packageName) return

        val pm = context.packageManager
        val appLabel = try {
            val appInfo = pm.getApplicationInfo(targetPackage, 0)
            pm.getApplicationLabel(appInfo).toString()
        } catch (_: Exception) {
            targetPackage
        }

        showFormDetectedNotification(context, targetPackage, appLabel, fieldCount)
    }

    private fun showFormDetectedNotification(
        context: Context,
        targetPackage: String,
        appLabel: String,
        fieldCount: Int
    ) {
        val channelId = "form_detect_channel"
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Form Detection",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifies when a form is detected"
                enableVibration(true)
            }
            nm.createNotificationChannel(channel)
        }

        val launchIntent = Intent(context, MainActivity::class.java)
        launchIntent.action = ACTION_SHOW_BUBBLE_ON_DETECT
        launchIntent.putExtra(EXTRA_TARGET_PACKAGE, targetPackage)
        launchIntent.putExtra(EXTRA_APP_LABEL, appLabel)
        launchIntent.putExtra(EXTRA_FIELD_COUNT, fieldCount)
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

        val pendingIntent = PendingIntent.getActivity(
            context, System.currentTimeMillis().toInt(), launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val dismissIntent = Intent(context, FormDetectReceiver::class.java)
        dismissIntent.action = ACTION_DISMISS_NOTIFICATION
        val dismissPending = PendingIntent.getBroadcast(
            context, System.currentTimeMillis().toInt() + 1, dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Form Detected in $appLabel")
            .setContentText("$fieldCount input fields found — tap to open Form Mitra overlay")
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText("$fieldCount input fields found in $appLabel.\n\nTap to show your encrypted document overlay alongside $appLabel.")
            )
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_menu_upload, "Open Overlay", pendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Dismiss", dismissPending)
            .build()

        nm.notify(NOTIFICATION_ID, notification)
    }

    companion object {
        const val ACTION_SHOW_BUBBLE_ON_DETECT = "com.formmitraoverlay.SHOW_BUBBLE_ON_DETECT"
        const val ACTION_DISMISS_NOTIFICATION = "com.formmitraoverlay.DISMISS_NOTIFICATION"
        const val EXTRA_TARGET_PACKAGE = "target_package"
        const val EXTRA_APP_LABEL = "app_label"
        const val EXTRA_FIELD_COUNT = "field_count"
        const val NOTIFICATION_ID = 9999
    }
}
