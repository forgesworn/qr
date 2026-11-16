import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.jvm)
    application
}
kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }
java { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
dependencies { implementation("io.github.forgesworn:qr:${providers.gradleProperty("qrVersion").get()}") }
application { mainClass.set("ConsumerKt") }
