package africa.afriheart.codes

import android.content.Context

/** Settings and the latest status, shared by the screen and the background service. */
class Prefs(context: Context) {
    private val p = context.getSharedPreferences("codes", Context.MODE_PRIVATE)

    var server: String
        get() = p.getString("server", null) ?: BuildConfig.DEFAULT_SERVER
        set(v) = p.edit().putString("server", v.trim().trimEnd('/')).apply()

    var key: String
        get() = p.getString("key", "") ?: ""
        set(v) = p.edit().putString("key", v.trim()).apply()

    /** The person switched sending on (survives restarts and reboots). */
    var enabled: Boolean
        get() = p.getBoolean("enabled", false)
        set(v) = p.edit().putBoolean("enabled", v).apply()

    var lastCheckIn: Long
        get() = p.getLong("lastCheckIn", 0)
        set(v) = p.edit().putLong("lastCheckIn", v).apply()

    var lastError: String?
        get() = p.getString("lastError", null)
        set(v) = p.edit().putString("lastError", v).apply()

    var sentCount: Int
        get() = p.getInt("sent", 0)
        set(v) = p.edit().putInt("sent", v).apply()

    var failedCount: Int
        get() = p.getInt("failed", 0)
        set(v) = p.edit().putInt("failed", v).apply()
}
