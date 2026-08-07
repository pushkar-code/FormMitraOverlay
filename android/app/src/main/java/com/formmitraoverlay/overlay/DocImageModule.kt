package com.formmitraoverlay.overlay

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream
import java.io.File

class DocImageModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DocImageModule"

    @ReactMethod
    fun readToCache(uriString: String, promise: Promise) {
        runAsync(promise) {
            val uri = android.net.Uri.parse(uriString)
            val ctx = reactApplicationContext
            val resolver = ctx.contentResolver

            val name = queryDisplayName(uri) ?: "document"
            val mime = resolver.getType(uri) ?: "application/octet-stream"

            val safeName = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
            val cacheFile = File(ctx.cacheDir, "docimg_${System.currentTimeMillis()}_$safeName")

            resolver.openInputStream(uri)?.use { input ->
                cacheFile.outputStream().use { output -> input.copyTo(output) }
            } ?: throw IllegalStateException("Could not open content URI")

            val result = Arguments.createMap().apply {
                putString("cachePath", cacheFile.absolutePath)
                putString("name", name)
                putString("mimeType", mime)
                putLong("size", cacheFile.length())
            }
            promise.resolve(result)
        }
    }

    @ReactMethod
    fun prepareImage(uriString: String, maxWidth: Double, promise: Promise) {
        runAsync(promise) {
            val uri = android.net.Uri.parse(uriString)
            val resolver = reactApplicationContext.contentResolver
            val limit = if (maxWidth <= 0) 1400.0 else maxWidth

            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            resolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, bounds)
            }

            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
                throw IllegalStateException("Could not decode image")
            }

            val sample = computeSampleSize(bounds.outWidth, bounds.outHeight, limit.toInt())
            val opts = BitmapFactory.Options().apply { inSampleSize = sample }
            val full = resolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, opts)
            } ?: throw IllegalStateException("Could not decode image")

            val scaled = scaleBitmap(full, limit)
            if (scaled !== full) full.recycle()

            val base64 = compressPng(scaled)
            scaled.recycle()
            promise.resolve(base64)
        }
    }

    @ReactMethod
    fun renderPdfPages(uriString: String, maxPages: Int, maxWidth: Double, promise: Promise) {
        runAsync(promise) {
            val uri = android.net.Uri.parse(uriString)
            val ctx = reactApplicationContext
            val resolver = ctx.contentResolver
            val pageLimit = if (maxPages <= 0) 10 else maxPages
            val limit = if (maxWidth <= 0) 1400.0 else maxWidth

            val fd: ParcelFileDescriptor = resolver.openFileDescriptor(uri, "r")
                ?: throw IllegalStateException("Could not open PDF")

            var renderer: PdfRenderer? = null
            try {
                renderer = PdfRenderer(fd)
                val pages = Arguments.createArray()

                for (i in 0 until renderer.pageCount) {
                    if (i >= pageLimit) break
                    val page = renderer.openPage(i)
                    val scale = Math.min(1.0, limit / page.width.toDouble())
                    val targetW = Math.max(1, (page.width * scale).toInt())
                    val targetH = Math.max(1, (page.height * scale).toInt())

                    val bitmap = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(android.graphics.Color.WHITE)
                    val matrix = Matrix().apply { postScale(scale.toFloat(), scale.toFloat()) }
                    page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    page.close()

                    pages.pushString(compressPng(bitmap))
                    bitmap.recycle()
                }

                val result = Arguments.createMap().apply {
                    putArray("pages", pages)
                    putInt("pageCount", pages.size())
                }
                promise.resolve(result)
            } finally {
                renderer?.close()
                fd.close()
            }
        }
    }

    private fun queryDisplayName(uri: android.net.Uri): String? {
        val resolver = reactApplicationContext.contentResolver
        var name: String? = null
        resolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) name = cursor.getString(index)
            }
        }
        return name
    }

    private fun computeSampleSize(width: Int, height: Int, maxDim: Int): Int {
        var sample = 1
        var w = width
        var h = height
        while (Math.max(w, h) / (sample * 2) >= maxDim) {
            sample *= 2
        }
        return sample
    }

    private fun scaleBitmap(source: Bitmap, maxDim: Double): Bitmap {
        val max = Math.max(source.width, source.height).toDouble()
        if (max <= maxDim) return source
        val scale = maxDim / max
        val targetW = Math.max(1, (source.width * scale).toInt())
        val targetH = Math.max(1, (source.height * scale).toInt())
        return Bitmap.createScaledBitmap(source, targetW, targetH, true)
    }

    private fun compressPng(bitmap: Bitmap): String {
        val baos = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, baos)
        return android.util.Base64.encodeToString(baos.toByteArray(), android.util.Base64.NO_WRAP)
    }

    private fun runAsync(promise: Promise, block: () -> Unit) {
        Thread {
            try {
                block()
            } catch (e: Exception) {
                promise.reject("DOC_IMAGE_ERROR", e.message ?: "Document processing failed")
            }
        }.start()
    }
}
