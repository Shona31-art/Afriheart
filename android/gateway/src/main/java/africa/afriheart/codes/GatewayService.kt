package africa.afriheart.codes

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.telephony.SmsManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Keeps checking in with Afriheart (every few seconds), sends any sign-in texts it
 * hands over from this phone's SIM, and reports back whether each one went out.
 */
class GatewayService : Service() {

    companion object {
        private const val CHANNEL = "gateway"
        private const val NOTIFICATION_ID = 1
        private const val ACTION_SENT = "africa.afriheart.codes.SENT"
        private const val IDLE_MS = 6_000L
        private const val BUSY_MS = 1_000L
        private const val ERROR_MS = 15_000L

        fun start(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, GatewayService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, GatewayService::class.java))
        }
    }

    private val running = AtomicBoolean(false)
    private var worker: Thread? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val updates = ConcurrentLinkedQueue<JSONObject>()
    private lateinit var prefs: Prefs

    private val sentReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val id = intent.getStringExtra("id") ?: return
            val ok = resultCode == Activity.RESULT_OK
            val update = JSONObject().put("id", id).put("status", if (ok) "SENT" else "FAILED")
            if (!ok) update.put("reason", reasonFor(resultCode))
            updates.add(update)
            if (ok) prefs.sentCount = prefs.sentCount + 1 else prefs.failedCount = prefs.failedCount + 1
            refreshNotification()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Sending codes", NotificationManager.IMPORTANCE_LOW))
        ContextCompat.registerReceiver(this, sentReceiver, IntentFilter(ACTION_SENT), ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ServiceCompat.startForeground(
            this, NOTIFICATION_ID, notification(),
            if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0,
        )
        if (running.compareAndSet(false, true)) {
            wakeLock = getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AfriheartCodes:gateway")
                .apply { setReferenceCounted(false); acquire() }
            worker = Thread({ loop() }, "gateway").apply { start() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running.set(false)
        worker?.interrupt()
        try { unregisterReceiver(sentReceiver) } catch (_: Exception) {}
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    private fun loop() {
        while (running.get()) {
            val wait = try {
                if (checkIn()) BUSY_MS else IDLE_MS
            } catch (e: InterruptedException) {
                return
            } catch (e: Exception) {
                prefs.lastError = e.message ?: "Couldn't reach Afriheart"
                refreshNotification()
                ERROR_MS
            }
            try { Thread.sleep(wait) } catch (e: InterruptedException) { return }
        }
    }

    /** One check-in. Returns true when there were texts to send (so it checks again sooner). */
    private fun checkIn(): Boolean {
        val outgoing = JSONArray()
        while (true) outgoing.put(updates.poll() ?: break)
        val (code, body) = try {
            post("${prefs.server}/api/sms-gateway", JSONObject().put("updates", outgoing).toString())
        } catch (e: Exception) {
            requeue(outgoing)
            throw e
        }
        if (code !in 200..299) {
            requeue(outgoing)
            val message = try { JSONObject(body).optString("message") } catch (_: Exception) { "" }
            throw IllegalStateException(message.ifBlank { "Afriheart answered $code" })
        }
        prefs.lastCheckIn = System.currentTimeMillis()
        prefs.lastError = null
        val messages = JSONObject(body).optJSONArray("messages") ?: JSONArray()
        for (i in 0 until messages.length()) {
            val m = messages.getJSONObject(i)
            send(m.getString("id"), m.getString("to"), m.getString("content"))
        }
        refreshNotification()
        return messages.length() > 0
    }

    private fun requeue(items: JSONArray) {
        for (i in 0 until items.length()) updates.add(items.getJSONObject(i))
    }

    private fun send(id: String, to: String, text: String) {
        try {
            val sms = if (Build.VERSION.SDK_INT >= 31) {
                getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
            val sent = PendingIntent.getBroadcast(
                this, id.hashCode(),
                Intent(ACTION_SENT).setPackage(packageName).putExtra("id", id),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_ONE_SHOT,
            )
            val parts = sms.divideMessage(text)
            if (parts.size <= 1) {
                sms.sendTextMessage(to, null, text, sent, null)
            } else {
                // Report once, when the last part has gone.
                val intents = ArrayList<PendingIntent?>(parts.size)
                repeat(parts.size - 1) { intents.add(null) }
                intents.add(sent)
                sms.sendMultipartTextMessage(to, null, parts, intents, null)
            }
        } catch (e: Exception) {
            updates.add(JSONObject().put("id", id).put("status", "FAILED").put("reason", e.message ?: "couldn't send"))
            prefs.failedCount = prefs.failedCount + 1
        }
    }

    private fun post(url: String, json: String): Pair<Int, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 10_000
            c.readTimeout = 15_000
            c.doOutput = true
            c.setRequestProperty("Authorization", "Bearer ${prefs.key}")
            c.setRequestProperty("Content-Type", "application/json")
            c.setRequestProperty("Accept", "application/json")
            c.outputStream.use { it.write(json.toByteArray()) }
            val code = c.responseCode
            val stream = if (code in 200..299) c.inputStream else c.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() } ?: ""
            return code to body
        } finally {
            c.disconnect()
        }
    }

    private fun reasonFor(code: Int): String = when (code) {
        SmsManager.RESULT_ERROR_NO_SERVICE -> "no signal"
        SmsManager.RESULT_ERROR_RADIO_OFF -> "airplane mode or radio off"
        SmsManager.RESULT_ERROR_NULL_PDU -> "message couldn't be built"
        SmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> "phone's SMS limit reached"
        else -> "SMS error $code"
    }

    private fun notification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val error = prefs.lastError
        val text = if (error != null) "Problem: $error" else "Ready. ${prefs.sentCount} codes sent."
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_common)
            .setContentTitle("Sending Afriheart sign-in codes")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .build()
    }

    private fun refreshNotification() {
        try {
            getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification())
        } catch (_: SecurityException) {
            // Notifications not allowed: sending still works.
        }
    }
}
