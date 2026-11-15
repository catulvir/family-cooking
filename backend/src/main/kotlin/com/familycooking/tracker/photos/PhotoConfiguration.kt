package com.familycooking.tracker.photos

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling
import java.net.URI

@ConfigurationProperties("app.photos")
class PhotoProperties {
    var enabled = false
    var cleanupScheduled = true
    var supabaseUrl = ""
    var secretKey = ""
    var dishBucket = "dish-photos"
    var recipeBucket = "recipe-photos"
    var avatarBucket = "avatars"

    fun bucket(kind: PhotoKind) = when (kind) {
        PhotoKind.DISH -> dishBucket
        PhotoKind.RECIPE -> recipeBucket
        PhotoKind.AVATAR -> avatarBucket
    }

    fun buckets() = PhotoKind.entries.map(::bucket)

    fun valid(): Boolean {
        val uri = runCatching { URI(supabaseUrl) }.getOrNull() ?: return false
        return uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null &&
            uri.query == null && uri.fragment == null && uri.path.orEmpty() in listOf("", "/") &&
            secretKey.matches(Regex("sb_secret_[A-Za-z0-9_-]+")) &&
            buckets().distinct().size == 3 && buckets().all { it.matches(Regex("[a-z0-9][a-z0-9-]{0,99}")) }
    }
}

@Configuration
@EnableScheduling
@EnableConfigurationProperties(PhotoProperties::class)
class PhotoConfiguration {
    @Bean
    fun objectStorage(properties: PhotoProperties, mapper: ObjectMapper): ObjectStorage =
        SupabaseObjectStorage(properties.supabaseUrl, properties.secretKey, mapper)
}
