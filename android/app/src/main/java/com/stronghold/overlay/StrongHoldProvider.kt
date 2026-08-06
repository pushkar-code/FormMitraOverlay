package com.stronghold.overlay

import android.database.Cursor
import android.database.MatrixCursor
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.DocumentsProvider
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileNotFoundException

class StrongHoldProvider : DocumentsProvider() {

    override fun onCreate(): Boolean = true

    override fun queryRoots(projection: Array<out String>?): Cursor {
        val result = MatrixCursor(resolveRootProjection(projection))
        val cache = cacheDir()
        if (cache != null && cache.exists()) {
            result.newRow()
                .add(DocumentsContract.Root.COLUMN_ROOT_ID, ROOT_ID)
                .add(DocumentsContract.Root.COLUMN_DOCUMENT_ID, ROOT_ID)
                .add(DocumentsContract.Root.COLUMN_TITLE, "StrongHold")
                .add(DocumentsContract.Root.COLUMN_SUMMARY, "Decrypted temporary files")
                .add(DocumentsContract.Root.COLUMN_FLAGS, DocumentsContract.Root.FLAG_LOCAL_ONLY)
                .add(DocumentsContract.Root.COLUMN_MIME_TYPES, "*/*")
                .add(DocumentsContract.Root.COLUMN_AVAILABLE_BYTES, cache.freeSpace)
        }
        return result
    }

    override fun queryDocument(documentId: String, projection: Array<out String>?): Cursor {
        val result = MatrixCursor(resolveDocumentProjection(projection))
        if (documentId == ROOT_ID) {
            addRootRow(result.newRow())
            return result
        }
        val file = fileForId(documentId)
            ?: throw FileNotFoundException("Missing file: $documentId")
        addFileRow(result.newRow(), file)
        return result
    }

    override fun queryChildDocuments(
        parentDocumentId: String,
        projection: Array<out String>?,
        sortOrder: String?
    ): Cursor {
        val result = MatrixCursor(resolveDocumentProjection(projection))
        if (parentDocumentId != ROOT_ID) return result
        val cache = cacheDir() ?: return result
        val files = cache.listFiles()?.sortedBy { it.name } ?: return result
        for (file in files) {
            if (file.isFile) addFileRow(result.newRow(), file)
        }
        return result
    }

    override fun openDocument(
        documentId: String,
        mode: String,
        signal: CancellationSignal?
    ): ParcelFileDescriptor? {
        if (mode != "r") {
            throw FileNotFoundException("StrongHold documents are read-only: $mode")
        }
        val file = fileForId(documentId)
            ?: throw FileNotFoundException("Missing file")
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun getDocumentType(documentId: String): String {
        if (documentId == ROOT_ID) return DocumentsContract.Document.MIME_TYPE_DIR
        val file = fileForId(documentId) ?: throw FileNotFoundException("Missing file: $documentId")
        return mimeType(file.name)
    }

    private fun cacheDir(): File? {
        val context = context ?: return null
        val dir = File(context.cacheDir, CACHE_SUB_DIR)
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }

    private fun fileForId(documentId: String): File? {
        val cache = cacheDir() ?: return null
        if (documentId.isEmpty() || documentId.contains('/')) return null
        val file = File(cache, documentId)
        return if (file.isFile) file else null
    }

    private fun mimeType(fileName: String): String {
        val ext = fileName.substringAfterLast('.', "").lowercase()
        if (ext.isEmpty()) return DEFAULT_MIME
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: DEFAULT_MIME
    }

    private fun addFileRow(row: MatrixCursor.RowBuilder, file: File) {
        row.add(DocumentsContract.Document.COLUMN_DOCUMENT_ID, file.name)
        row.add(DocumentsContract.Document.COLUMN_DISPLAY_NAME, file.name)
        row.add(DocumentsContract.Document.COLUMN_MIME_TYPE, mimeType(file.name))
        row.add(DocumentsContract.Document.COLUMN_SIZE, file.length())
        row.add(DocumentsContract.Document.COLUMN_FLAGS, 0)
    }

    private fun addRootRow(row: MatrixCursor.RowBuilder) {
        row.add(DocumentsContract.Document.COLUMN_DOCUMENT_ID, ROOT_ID)
        row.add(DocumentsContract.Document.COLUMN_DISPLAY_NAME, "StrongHold")
        row.add(DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.MIME_TYPE_DIR)
        row.add(DocumentsContract.Document.COLUMN_FLAGS, 0)
    }

    private fun resolveRootProjection(projection: Array<out String>?): Array<String> {
        if (projection == null) return DEFAULT_ROOT_PROJECTION
        return Array(projection.size) { projection[it] }
    }

    private fun resolveDocumentProjection(projection: Array<out String>?): Array<String> {
        if (projection == null) return DEFAULT_DOCUMENT_PROJECTION
        return Array(projection.size) { projection[it] }
    }

    companion object {
        private const val ROOT_ID = "stronghold"
        private const val CACHE_SUB_DIR = "stronghold_cache"
        private const val DEFAULT_MIME = "application/octet-stream"

        private val DEFAULT_ROOT_PROJECTION = arrayOf(
            DocumentsContract.Root.COLUMN_ROOT_ID,
            DocumentsContract.Root.COLUMN_DOCUMENT_ID,
            DocumentsContract.Root.COLUMN_TITLE,
            DocumentsContract.Root.COLUMN_SUMMARY,
            DocumentsContract.Root.COLUMN_FLAGS,
            DocumentsContract.Root.COLUMN_MIME_TYPES,
            DocumentsContract.Root.COLUMN_AVAILABLE_BYTES
        )

        private val DEFAULT_DOCUMENT_PROJECTION = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_FLAGS
        )
    }
}
