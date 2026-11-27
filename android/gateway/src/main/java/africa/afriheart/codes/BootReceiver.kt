package africa.afriheart.codes

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Starts sending again after the phone restarts or the app updates, if it was on. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val prefs = Prefs(context)
        if (prefs.enabled && prefs.key.isNotBlank()) GatewayService.start(context)
    }
}
