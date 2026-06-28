package rw.jorinova.nexus.net

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

/**
 * Builds the Retrofit Api, attaches the JWT, and stores the token in
 * EncryptedSharedPreferences (Android-Keystore backed = encrypted on-device).
 */
object ApiClient {

    // Live always-on backend (Render). MUST be HTTPS (camera + secure ctx).
    const val BASE_URL = "https://jorinova-nexus-api.onrender.com/api/v1/"

    private const val PREFS = "nexus_secure"
    private const val KEY_TOKEN = "jwt"
    private const val KEY_LANG  = "lang"

    private lateinit var prefs: android.content.SharedPreferences

    fun init(context: Context) {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        prefs = EncryptedSharedPreferences.create(
            context, PREFS, masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(v) { prefs.edit().putString(KEY_TOKEN, v).apply() }

    var lang: String
        get() = prefs.getString(KEY_LANG, "en") ?: "en"
        set(v) { prefs.edit().putString(KEY_LANG, v).apply() }

    val api: Api by lazy {
        val authInterceptor = Interceptor { chain ->
            val b = chain.request().newBuilder()
            token?.let { b.header("Authorization", "Bearer $it") }
            b.header("X-Lang", lang)          // localized error messages from the backend
            chain.proceed(b.build())
        }
        val client = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .build()
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(Api::class.java)
    }
}