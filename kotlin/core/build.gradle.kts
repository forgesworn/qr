import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.jvm)
}

group = "dev.forgesworn"

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    // The library itself depends on the Kotlin standard library only.
    testImplementation(libs.junit)
    // ZXing is a test-time oracle, as in the TypeScript tests.
    testImplementation(libs.zxing.core)
}

tasks.test {
    useJUnit()
    maxHeapSize = "1g"
    // The tests read the shared vectors from the repository root.
    systemProperty("qr.vectors", rootProject.projectDir.resolve("../vectors").canonicalPath)
}
