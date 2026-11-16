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
    // The reference library is a test-time oracle, as in the TypeScript tests.
    testImplementation(libs.zxing.core)
}

tasks.test {
    useJUnit()
    maxHeapSize = "1g"
    // The tests read the shared vectors from the repository root.
    systemProperty("qr.vectors", rootProject.projectDir.resolve("../vectors").canonicalPath)
}

// Development only: uses the existing oracle, or an explicitly supplied external jar.
tasks.register<JavaExec>("compareZxing") {
    dependsOn(tasks.testClasses)
    mainClass.set("dev.forgesworn.qr.PerformanceMainKt")
    val rival = providers.gradleProperty("qrBenchmarkZxingJar")
    classpath = if (rival.isPresent) {
        sourceSets.test.get().runtimeClasspath.filter { it.name != "core-${libs.versions.zxing.get()}.jar" } + files(rival.get())
    } else sourceSets.test.get().runtimeClasspath
    workingDir(rootProject.projectDir.parentFile)
    minHeapSize = "512m"
    maxHeapSize = "512m"
    doFirst {
        args(providers.gradleProperty("qrBenchmarkOutput").get())
    }
}

// Development only: paired reads of two explicitly supplied library jars.
tasks.register<JavaExec>("compareQrJars") {
    dependsOn(tasks.testClasses)
    mainClass.set("dev.forgesworn.qr.PairedPerformanceMainKt")
    classpath = sourceSets.test.get().runtimeClasspath
    workingDir(rootProject.projectDir.parentFile)
    minHeapSize = "512m"
    maxHeapSize = "512m"
    doFirst {
        args(
            providers.gradleProperty("qrBaselineJar").get(),
            providers.gradleProperty("qrCurrentJar").get(),
            providers.gradleProperty("qrBenchmarkOutput").get(),
        )
    }
}
