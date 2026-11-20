package africa.common.app

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Receives Afriheart's pushes, even when the app is closed. */
class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        // The website picks it up next time Afriheart is open (CommonAndroid.fcmToken()).
        Push.prefs(this).edit().putString("fcm_token", token).apply()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        when (data["type"]) {
            "call" -> {
                val callId = data["callId"] ?: return
                Notifier.showCall(this, callId, data["title"] ?: "Afriheart", data["video"] == "1", data["url"] ?: "/call/$callId")
            }
            "call_end" -> data["callId"]?.let { Notifier.cancelCall(this, it) }
            "badge" -> Unit
            else -> Notifier.showNotice(this, data)
        }
        data["badge"]?.toIntOrNull()?.let { Badge.set(this, it) }
    }
}
