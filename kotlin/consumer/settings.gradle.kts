pluginManagement {
    repositories { gradlePluginPortal(); mavenCentral() }
}
dependencyResolutionManagement {
    versionCatalogs { create("libs") { from(files("../gradle/libs.versions.toml")) } }
    repositories {
        providers.gradleProperty("qrRepository").orNull?.let { location ->
            maven {
                url = uri(location)
                content { includeGroup("io.github.forgesworn") }
            }
        }
        mavenCentral()
    }
}
rootProject.name = "qr-published-consumer"
