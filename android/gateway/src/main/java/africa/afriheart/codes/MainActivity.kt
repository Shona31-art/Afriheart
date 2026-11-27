package africa.afriheart.codes

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.telephony.SmsManager
import android.text.InputType
import android.text.format.DateUtils
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL

/** One plain screen: where to connect, the key, on/off, and how it's going. */
class MainActivity : Activity() {

    private lateinit var prefs: Prefs
    private lateinit var server: EditText
    private lateinit var key: EditText
    private lateinit var status: TextView
    private lateinit var toggle: Button
    private var messageUntil = 0L
    private val handler = Handler(Looper.getMainLooper())
    private val refresher = object : Runnable {
        override fun run() {
            showStatus()
            handler.postDelayed(this, 2000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        val pad = (20 * resources.displayMetrics.density).toInt()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 2, pad, pad)
        }
        column.addView(TextView(this).apply {
            text = "Afriheart Codes"
            textSize = 26f
            typeface = Typeface.SERIF
            setTextColor(Color.parseColor("#0B2F2B"))
        })
        column.addView(note("This phone sends Afriheart's sign-in codes from its own SIM. Keep it switched on, charged and connected to the internet."))

        column.addView(label("Afriheart website"))
        server = EditText(this).apply {
            setText(prefs.server)
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            isSingleLine = true
        }
        column.addView(server)

        column.addView(label("Gateway key (SMS_GATEWAY_TOKEN from Vercel)"))
        key = EditText(this).apply {
            setText(prefs.key)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            isSingleLine = true
            hint = "Paste the key"
        }
        column.addView(key)

        toggle = button("") { toggle() }
        column.addView(toggle)
        column.addView(button("Check the connection") { checkConnection() })
        column.addView(button("Let it run in the background") { askBatteryExemption() })

        status = TextView(this).apply {
            textSize = 15f
            setTextColor(Color.parseColor("#1D2B29"))
            setPadding(0, pad, 0, pad)
        }
        column.addView(status)

        column.addView(label("Test this phone's SIM"))
        val testNumber = EditText(this).apply {
            hint = "Your number, e.g. 082 123 4567"
            inputType = InputType.TYPE_CLASS_PHONE
            isSingleLine = true
        }
        column.addView(testNumber)
        column.addView(button("Send a test SMS") { sendTest(testNumber.text.toString()) })

        setContentView(ScrollView(this).apply { addView(column) })
    }

    override fun onResume() {
        super.onResume()
        handler.post(refresher)
    }

    override fun onPause() {
        handler.removeCallbacks(refresher)
        super.onPause()
    }

    private fun label(text: String) = TextView(this).apply {
        this.text = text
        textSize = 14f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Color.parseColor("#1D2B29"))
        setPadding(0, (16 * resources.displayMetrics.density).toInt(), 0, 0)
    }

    private fun note(text: String) = TextView(this).apply {
        this.text = text
        textSize = 15f
        setTextColor(Color.parseColor("#3B4A47"))
        setPadding(0, (8 * resources.displayMetrics.density).toInt(), 0, 0)
    }

    private fun button(text: String, onClick: () -> Unit) = Button(this).apply {
        this.text = text
        isAllCaps = false
        setOnClickListener { onClick() }
    }

    private fun save() {
        prefs.server = server.text.toString().ifBlank { BuildConfig.DEFAULT_SERVER }
        prefs.key = key.text.toString()
    }

    private fun toggle() {
        save()
        if (prefs.enabled) {
            prefs.enabled = false
            GatewayService.stop(this)
            showStatus()
            return
        }
        if (prefs.key.length < 32) {
            say("Paste the gateway key first. It's the SMS_GATEWAY_TOKEN you saved in Vercel (32 or more characters).")
            return
        }
        val missing = needed().filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) {
            requestPermissions(missing.toTypedArray(), 1)
            return
        }
        prefs.enabled = true
        GatewayService.start(this)
        showStatus()
    }

    private fun needed(): List<String> = buildList {
        add(Manifest.permission.SEND_SMS)
        if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != 1) return // the test SMS asked for permission: just tap Send again
        if (checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED) {
            prefs.enabled = true
            GatewayService.start(this)
        } else {
            say("This app needs permission to send SMS. Tap the button again and choose Allow.")
        }
        showStatus()
    }

    @SuppressLint("BatteryLife")
    private fun askBatteryExemption() {
        val pm = getSystemService(PowerManager::class.java)
        if (pm.isIgnoringBatteryOptimizations(packageName)) {
            say("Already allowed to run in the background.")
            return
        }
        try {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun checkConnection() {
        save()
        say("Checking…")
        val url = "${prefs.server}/api/sms-gateway"
        val token = prefs.key
        Thread {
            val result = try {
                val c = URL(url).openConnection() as HttpURLConnection
                c.connectTimeout = 10_000
                c.readTimeout = 10_000
                c.setRequestProperty("Authorization", "Bearer $token")
                val code = c.responseCode
                c.disconnect()
                when (code) {
                    200 -> "Connected to Afriheart. The key is right."
                    401 -> "Afriheart says the key is wrong. Copy SMS_GATEWAY_TOKEN from Vercel again."
                    404 -> "Afriheart's phone sending isn't switched on yet. Add SMS_GATEWAY_TOKEN in Vercel and redeploy."
                    else -> "Afriheart answered $code. Check the website address."
                }
            } catch (e: Exception) {
                "Couldn't reach $url. Check the address and the internet connection."
            }
            runOnUiThread { say(result) }
        }.start()
    }

    private fun sendTest(raw: String) {
        if (checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.SEND_SMS), 2)
            return
        }
        val digits = raw.filter { it.isDigit() || it == '+' }
        if (digits.length < 10) {
            say("Type a full phone number to test.")
            return
        }
        try {
            val sms = if (Build.VERSION.SDK_INT >= 31) getSystemService(SmsManager::class.java) else @Suppress("DEPRECATION") SmsManager.getDefault()
            sms.sendTextMessage(digits, null, "Afriheart Codes test: this phone can send sign-in codes.", null, null)
            say("Test SMS sent to $digits. It should arrive in a few seconds.")
        } catch (e: Exception) {
            say("This phone couldn't send an SMS: ${e.message}. Check the SIM has airtime or an SMS bundle.")
        }
    }

    /** A one-off message, shown for a few seconds before the live status comes back. */
    private fun say(text: String) {
        status.text = text
        messageUntil = System.currentTimeMillis() + 6000
    }

    private fun showStatus() {
        toggle.text = if (prefs.enabled) "Stop sending codes" else "Start sending codes"
        if (System.currentTimeMillis() < messageUntil) return
        val lines = mutableListOf<String>()
        if (!prefs.enabled) {
            lines += "Off. Codes aren't being sent from this phone."
        } else {
            val last = prefs.lastCheckIn
            lines += if (last == 0L) "Starting…" else "On. Last checked in " +
                DateUtils.getRelativeTimeSpanString(last, System.currentTimeMillis(), DateUtils.SECOND_IN_MILLIS) + "."
            prefs.lastError?.let { lines += "Problem: $it" }
        }
        lines += "${prefs.sentCount} codes sent, ${prefs.failedCount} failed."
        val pm = getSystemService(PowerManager::class.java)
        if (!pm.isIgnoringBatteryOptimizations(packageName)) lines += "Tip: tap \"Let it run in the background\" so the phone doesn't pause it."
        status.text = lines.joinToString("\n")
    }
}
