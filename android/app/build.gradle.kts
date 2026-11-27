import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Set by the GitHub build (.github/workflows/android.yml); defaults for a local build.
val siteUrl = (findProperty("commonSiteUrl") as String?)?.trimEnd('/')?.ifBlank { null } ?: "https://afriheart.example.com"
val buildNumber = ((findProperty("commonVersionCode") as String?) ?: "1").toInt()
val keystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")

android {
    namespace = "africa.common.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "africa.common.app"
        minSdk = 26
        targetSdk = 35
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
        buildConfigField("String", "SITE_URL", "\"$siteUrl\"")
        manifestPlaceholders["siteHost"] = URI(siteUrl).host
    }

    signingConfigs {
        create("release") {
            // The key file is in the repo; its password is a GitHub secret, so
            // only the GitHub build can sign updates that install over Afriheart.
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
        // Sideloaded app: don't fail the build on Play Store policy checks.
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("com.google.firebase:firebase-messaging:24.1.0")
}
