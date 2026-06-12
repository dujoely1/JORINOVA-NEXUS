plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "rw.jorinova.nexus"
    compileSdk = 34

    defaultConfig {
        applicationId = "rw.jorinova.nexus"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }
    buildFeatures { compose = true }
    composeOptions { kotlinCompilerExtensionVersion = "1.5.14" }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildTypes {
        release { isMinifyEnabled = false }
    }
}

dependencies {
    // Compose
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:1.9.0")

    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Secure on-device storage (encrypted JWT + offline data)
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Offline sync queue
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    // TODO when building the full app:
    // implementation("androidx.camera:camera-camera2:1.3.4")   // photo capture
    // implementation("androidx.camera:camera-lifecycle:1.3.4")
    // implementation("androidx.camera:camera-view:1.3.4")
    // implementation("com.google.android.gms:play-services-location:21.3.0") // GPS
    // implementation("androidx.room:room-runtime:2.6.1")       // offline queue DB
    // implementation(platform("com.google.firebase:firebase-bom:33.1.1"))    // push/FCM
    // implementation("com.google.firebase:firebase-messaging-ktx")
}
