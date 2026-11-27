plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// "Afriheart Codes": turns a spare Android phone into Afriheart's own SMS sender for
// sign-in codes. Built by .github/workflows/sms-gateway.yml.
val siteUrl = (findProperty("commonSiteUrl") as String?)?.trimEnd('/')?.ifBlank { null } ?: "https://afriheart.vercel.app"
val buildNumber = ((findProperty("commonVersionCode") as String?) ?: "1").toInt()
val keystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")

android {
    namespace = "africa.afriheart.codes"
    compileSdk = 35

    defaultConfig {
        applicationId = "africa.afriheart.codes"
        minSdk = 26
        targetSdk = 35
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
        buildConfigField("String", "DEFAULT_SERVER", "\"$siteUrl\"")
    }

    signingConfigs {
        create("release") {
            storeFile = file("../common-release.p12")
            storeType = "PKCS12"
            storePassword = keystorePassword
            keyAlias = "common"
            keyPassword = keystorePassword
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystorePassword.isNullOrEmpty()) signingConfigs.getByName("debug") else signingConfigs.getByName("release")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
}
