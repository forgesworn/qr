import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.jvm)
    id("org.jetbrains.dokka") version "2.2.0"
    `maven-publish`
    signing
}

group = "io.github.forgesworn"
// Keep the package versions together without a second manually maintained number.
version = Regex("\"version\"\\s*:\\s*\"([^\"]+)\"")
    .find(rootProject.file("../package.json").readText())!!.groupValues[1]

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
    withSourcesJar()
}

val javadocJar by tasks.registering(Jar::class) {
    archiveClassifier.set("javadoc")
    from(tasks.named("dokkaGeneratePublicationHtml"))
    from("src/javadoc/notices") { into("META-INF/third-party") }
}

tasks.withType<Jar>().configureEach {
    isPreserveFileTimestamps = false
    isReproducibleFileOrder = true
    from(rootProject.file("../LICENSE")) { into("META-INF") }
}

publishing {
    publications {
        create<MavenPublication>("maven") {
            from(components["java"])
            artifactId = "qr"
            artifact(javadocJar)
            pom {
                name.set("ForgeSworn QR")
                description.set("QR code encoder and decoder for Kotlin and the JVM, with no dependencies beyond the Kotlin standard library")
                url.set("https://forgesworn.github.io/qr/")
                licenses {
                    license {
                        name.set("MIT")
                        url.set("https://opensource.org/license/mit/")
                        distribution.set("repo")
                    }
                }
                developers {
                    developer {
                        id.set("forgesworn")
                        name.set("ForgeSworn")
                        url.set("https://github.com/forgesworn")
                    }
                }
                scm {
                    connection.set("scm:git:https://github.com/forgesworn/qr.git")
                    developerConnection.set("scm:git:ssh://git@github.com/forgesworn/qr.git")
                    url.set("https://github.com/forgesworn/qr")
                }
                issueManagement {
                    system.set("GitHub")
                    url.set("https://github.com/forgesworn/qr/issues")
                }
            }
        }
    }
    repositories {
        maven {
            name = "staging"
            url = uri(rootProject.layout.buildDirectory.dir("staging-deploy"))
        }
    }
}

signing {
    val key = providers.environmentVariable("MAVEN_GPG_PRIVATE_KEY").orNull?.takeIf { it.isNotBlank() }
    isRequired = key != null
    if (key != null) {
        useInMemoryPgpKeys(key, providers.environmentVariable("MAVEN_GPG_PASSPHRASE").orNull)
        sign(publishing.publications["maven"])
    }
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
