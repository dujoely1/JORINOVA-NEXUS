package rw.jorinova.nexus.net

import okhttp3.MultipartBody
import retrofit2.http.*

/**
 * Retrofit mapping of the JORINOVA NEXUS Staff Mobile Hub backend.
 * All paths are relative to ApiClient.BASE_URL (which ends in /api/v1/).
 */
interface Api {

    // ── Auth ──────────────────────────────────────────────────────────────
    @FormUrlEncoded
    @POST("auth/token")
    suspend fun login(
        @Field("username") username: String,
        @Field("password") password: String,
        @Field("grant_type") grantType: String = "password",
    ): TokenOut

    // ── Device registration ────────────────────────────────────────────────
    @POST("staff-mobile/devices/register")
    suspend fun registerDevice(@Body body: DeviceIn): Map<String, Any?>

    // ── Staff self-service ──────────────────────────────────────────────────
    @POST("staff-mobile/leave-request")
    suspend fun leaveRequest(@Body body: LeaveIn): Map<String, Any?>

    @POST("staff-mobile/inventory-request")
    suspend fun inventoryRequest(@Body body: InventoryIn): Map<String, Any?>

    @POST("staff-mobile/field-activity")
    suspend fun fieldActivity(@Body body: FieldIn): Map<String, Any?>

    @POST("staff-mobile/check-in")
    suspend fun checkIn(@Body body: GeoIn): Map<String, Any?>

    @POST("staff-mobile/check-out")
    suspend fun checkOut(@Body body: GeoIn): Map<String, Any?>

    @GET("staff-mobile/notifications")
    suspend fun notifications(@Query("unread_only") unreadOnly: Boolean = false): List<Map<String, Any?>>

    // ── Photo capture (multipart) ───────────────────────────────────────────
    @Multipart
    @POST("staff-mobile/patient/{id}/photo")
    suspend fun patientPhoto(@Path("id") id: Int, @Part file: MultipartBody.Part): Map<String, Any?>

    @Multipart
    @POST("staff-mobile/staff/{id}/photo")
    suspend fun staffPhoto(@Path("id") id: Int, @Part file: MultipartBody.Part): Map<String, Any?>

    // ── Offline batch flush ─────────────────────────────────────────────────
    @POST("staff-mobile/sync")
    suspend fun sync(@Body body: SyncIn): Map<String, Any?>
}

// ── DTOs (mirror the FastAPI Pydantic schemas) ──────────────────────────────
data class TokenOut(val access_token: String, val role: String? = null)
data class DeviceIn(val device_id: String, val device_name: String? = null, val push_token: String? = null, val platform: String = "android")
data class LeaveIn(val leave_type: String = "ANNUAL", val start_date: String, val end_date: String, val reason: String? = null, val txn_id: String? = null)
data class InventoryIn(val item_name: String, val item_code: String? = null, val quantity: Double = 1.0, val unit: String? = null, val reason: String? = null, val txn_id: String? = null)
data class FieldIn(val activity_type: String = "OUTREACH", val title: String? = null, val notes: String? = null, val latitude: Double? = null, val longitude: Double? = null, val photo_urls: List<String>? = null, val sample_data: Map<String, Any?>? = null, val occurred_at: String? = null, val txn_id: String? = null)
data class GeoIn(val latitude: Double? = null, val longitude: Double? = null, val note: String? = null, val txn_id: String? = null)
data class SyncIn(val operations: List<Map<String, Any?>>)
