package africa.common.app

import android.app.Application

class CommonApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifier.createChannels(this)
        // Push is started from the settings saved last time, so a call can
        // wake the app even when it hasn't been opened since the phone restarted.
        Push.start(this)
    }
}
