package rw.jorinova.nexus.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import rw.jorinova.nexus.net.ApiClient
import rw.jorinova.nexus.net.SyncIn

/**
 * Flushes the offline queue to the backend when connectivity returns.
 *
 * Schedule with WorkManager + a NetworkType.CONNECTED constraint. Each queued
 * item MUST carry a unique `txn_id` (a UUID generated when it was created
 * offline) so the backend deduplicates retries — see /staff-mobile/sync.
 *
 * TODO: back this with a Room table `pending_ops(id, op, payload_json, txn_id)`.
 * Read all rows, send them, delete the ones the server acknowledged.
 */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        return try {
            val pending: List<Map<String, Any?>> = loadPendingOps()   // TODO: from Room
            if (pending.isEmpty()) return Result.success()

            val res = ApiClient.api.sync(SyncIn(operations = pending))
            // TODO: on success, delete the flushed rows from Room (match by txn_id).
            Result.success()
        } catch (e: Exception) {
            Result.retry()   // try again on the next connectivity window
        }
    }

    private fun loadPendingOps(): List<Map<String, Any?>> {
        // TODO: SELECT op, payload FROM pending_ops  ->  [{op, payload}, ...]
        return emptyList()
    }
}
