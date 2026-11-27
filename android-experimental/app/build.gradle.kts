plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("com.google.gms.google-services")
}
android {
  namespace = "com.labelgate.android"
  compileSdk = 36
  defaultConfig { applicationId = "com.labelgate.android"; minSdk = 26; targetSdk = 36; versionCode = 5; versionName = "0.5-nanocheck-auto" }
  buildTypes { release { isMinifyEnabled = true; isShrinkResources = true; signingConfig = signingConfigs.getByName("debug"); proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt")) } }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
dependencies {
  implementation("com.google.firebase:firebase-ai:18.2.0")
  implementation("com.google.firebase:firebase-ai-ondevice:16.0.0-beta08")
  implementation("androidx.appcompat:appcompat:1.7.1")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
  implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
