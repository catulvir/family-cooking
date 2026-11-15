package com.familycooking.tracker.photos

import java.awt.image.BufferedImage
import java.nio.ByteBuffer
import java.util.Base64
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Isolate the native HEVC decoder from the JVM and never pass it server credentials. */
class HeicDecoder(
    private val python: String = System.getenv("PHOTO_HEIC_PYTHON") ?: "python3",
    private val timeoutMillis: Long = 15_000,
    private val script: String = HeicDecoder::class.java.getResourceAsStream("/photos/decode_heic.py")!!
        .bufferedReader().use { it.readText() },
) {
    fun decode(bytes: ByteArray): BufferedImage {
        validateContainer(bytes)
        // A fixed encoded program avoids Windows command-line quote/newline rules.
        // This is code from the application resource, never from the uploaded file.
        val program = Base64.getEncoder().encodeToString(script.toByteArray(Charsets.UTF_8))
        val builder = ProcessBuilder(python, "-I", "-c", "exec(__import__('base64').b64decode('$program'))")
            .redirectError(ProcessBuilder.Redirect.DISCARD)
        val environment = builder.environment()
        val runtimeEnvironment = environment.filterKeys {
            it.uppercase() in setOf("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP")
        }
        environment.clear()
        environment.putAll(runtimeEnvironment)
        val process = try {
            builder.start()
        } catch (_: Exception) {
            photoUnavailable()
        }
        val executor = Executors.newVirtualThreadPerTaskExecutor()
        try {
            val output = executor.submit<ByteArray> {
                process.inputStream.use { it.readNBytes(MAX_OUTPUT_BYTES + 1) }
            }
            val input = executor.submit {
                process.outputStream.use { it.write(bytes) }
            }
            if (!process.waitFor(timeoutMillis, TimeUnit.MILLISECONDS)) photoUnavailable()
            when (process.exitValue()) {
                0 -> Unit
                40 -> invalidPhoto()
                41 -> unsupportedPhoto()
                42 -> oversizedPhoto()
                else -> photoUnavailable()
            }
            input.get(1, TimeUnit.SECONDS)
            val pixels = output.get(1, TimeUnit.SECONDS)
            if (pixels.size < 8 || pixels.size > MAX_OUTPUT_BYTES) photoUnavailable()
            val header = ByteBuffer.wrap(pixels)
            val width = header.int
            val height = header.int
            if (width !in 1..1600 || height !in 1..1600 || pixels.size != 8 + width * height * 3) photoUnavailable()
            val image = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
            val row = IntArray(width)
            for (y in 0 until height) {
                for (x in 0 until width) {
                    val offset = 8 + (y * width + x) * 3
                    row[x] = ((pixels[offset].toInt() and 255) shl 16) or
                        ((pixels[offset + 1].toInt() and 255) shl 8) or
                        (pixels[offset + 2].toInt() and 255)
                }
                image.setRGB(0, y, width, 1, row, 0, width)
            }
            return image
        } catch (exception: PhotoException) {
            throw exception
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            photoUnavailable()
        } catch (_: Exception) {
            photoUnavailable()
        } finally {
            process.destroyForcibly()
            runCatching { process.inputStream.close() }
            runCatching { process.outputStream.close() }
            executor.shutdownNow()
        }
    }

    private fun validateContainer(bytes: ByteArray) {
        if (bytes.size < 24 || String(bytes, 4, 4, Charsets.US_ASCII) != "ftyp") unsupportedPhoto()
        val length = ByteBuffer.wrap(bytes).int
        if (length < 24 || length > 4096 || length > bytes.size || length % 4 != 0) invalidPhoto()
        val major = String(bytes, 8, 4, Charsets.US_ASCII)
        val brands = listOf(major) + (16 until length step 4).map { String(bytes, it, 4, Charsets.US_ASCII) }
        if (major !in setOf("heic", "heix", "mif1") || brands.none { it in setOf("heic", "heix") } ||
            brands.any { it in setOf("msf1", "hevc", "hevx", "hevm", "hevs") }) unsupportedPhoto()
    }

    companion object {
        private const val MAX_OUTPUT_BYTES = 8 + 1600 * 1600 * 3
    }
}
