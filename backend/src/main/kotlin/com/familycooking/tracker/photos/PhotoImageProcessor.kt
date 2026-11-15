package com.familycooking.tracker.photos

import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.exif.ExifIFD0Directory
import org.springframework.stereotype.Component
import java.awt.Color
import java.awt.RenderingHints
import java.awt.geom.AffineTransform
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.util.HexFormat
import java.util.concurrent.Semaphore
import java.util.zip.CRC32
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import javax.imageio.IIOImage
import javax.imageio.stream.MemoryCacheImageInputStream
import javax.imageio.stream.MemoryCacheImageOutputStream
import kotlin.math.max
import kotlin.math.min

@Component
class PhotoImageProcessor(private val heicDecoder: HeicDecoder = HeicDecoder()) {
    // One decoder per JVM; reject excess work rather than queue large decoded images.
    private val processing = Semaphore(1)

    fun process(input: InputStream, contentType: String?, avatar: Boolean): ProcessedPhoto {
        if (!processing.tryAcquire()) photoUnavailable()
        try {
            val bytes = input.readNBytes(MAX_PHOTO_BYTES + 1)
            if (bytes.size > MAX_PHOTO_BYTES) oversizedPhoto()
            if (bytes.isEmpty()) invalidPhoto()
            if (contentType !in listOf("image/jpeg", "image/png", "image/heic", "image/heif")) unsupportedPhoto()
            val hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))
            if (contentType == "image/heic" || contentType == "image/heif") {
                val decoded = heicDecoder.decode(bytes)
                return derivatives(decoded, 1, avatar, hash)
            }
            return MemoryCacheImageInputStream(ByteArrayInputStream(bytes)).use { stream ->
                val readers = ImageIO.getImageReaders(stream)
                if (!readers.hasNext()) unsupportedPhoto()
                val reader = readers.next()
                try {
                    val format = reader.formatName.lowercase()
                    if ((format == "png" && contentType != "image/png") ||
                        (format == "jpeg" && contentType != "image/jpeg") || format !in listOf("png", "jpeg")) unsupportedPhoto()
                    if (format == "png") validatePng(bytes)
                    if (format == "jpeg" && (bytes.size < 4 || bytes[bytes.size - 2] != 0xff.toByte() || bytes.last() != 0xd9.toByte())) invalidPhoto()
                    // Ignore ancillary metadata during decoding (including compressed PNG text).
                    reader.setInput(stream, true, true)
                    val width = reader.getWidth(0)
                    val height = reader.getHeight(0)
                    if (width <= 0 || height <= 0) invalidPhoto()
                    if (width.toLong() * height > MAX_PHOTO_PIXELS) oversizedPhoto()
                    val orientation = if (format == "jpeg") {
                        ImageMetadataReader.readMetadata(ByteArrayInputStream(bytes))
                            .getFirstDirectoryOfType(ExifIFD0Directory::class.java)
                            ?.getInteger(ExifIFD0Directory.TAG_ORIENTATION) ?: 1
                    } else 1
                    if (orientation !in 1..8) invalidPhoto()
                    var warned = false
                    reader.addIIOReadWarningListener { _, _ -> warned = true }
                    val params = reader.defaultReadParam
                    val sampling = max(1, max(width, height) / 1600)
                    params.setSourceSubsampling(sampling, sampling, 0, 0)
                    val decoded = reader.read(0, params) ?: invalidPhoto()
                    if (warned) {
                        decoded.flush()
                        invalidPhoto()
                    }
                    derivatives(decoded, orientation, avatar, hash)
                } finally {
                    reader.dispose()
                }
            }
        } catch (exception: PhotoException) {
            throw exception
        } catch (_: Exception) {
            invalidPhoto()
        } finally {
            processing.release()
        }
    }

    private fun derivatives(decoded: BufferedImage, orientation: Int, avatar: Boolean, hash: String): ProcessedPhoto {
        try {
            val detail = render(decoded, orientation, if (avatar) 256 else 1600, avatar)
            try {
                val thumbnail = render(detail, 1, if (avatar) 256 else 320, false)
                try {
                    return ProcessedPhoto(encode(detail), encode(thumbnail), hash)
                } finally {
                    thumbnail.flush()
                }
            } finally {
                detail.flush()
            }
        } finally {
            decoded.flush()
        }
    }

    private fun validatePng(bytes: ByteArray) {
        var position = 8
        while (position + 12 <= bytes.size) {
            val length = ByteBuffer.wrap(bytes, position, 4).int
            if (length < 0 || position.toLong() + length + 12 > bytes.size) invalidPhoto()
            val type = String(bytes, position + 4, 4, Charsets.US_ASCII)
            val crc = CRC32().apply { update(bytes, position + 4, length + 4) }
            if (crc.value.toInt() != ByteBuffer.wrap(bytes, position + length + 8, 4).int) invalidPhoto()
            if (type == "acTL") unsupportedPhoto()
            position += length + 12
            if (type == "IEND") {
                if (length != 0 || position != bytes.size) invalidPhoto()
                return
            }
        }
        invalidPhoto()
    }

    private fun render(source: BufferedImage, orientation: Int, bound: Int, crop: Boolean): BufferedImage {
        val w = source.width.toDouble()
        val h = source.height.toDouble()
        val orientedWidth = if (orientation >= 5) h else w
        val orientedHeight = if (orientation >= 5) w else h
        val scale = min(1.0, bound / if (crop) min(orientedWidth, orientedHeight) else max(orientedWidth, orientedHeight))
        val width = max(1, ((if (crop) min(orientedWidth, orientedHeight) else orientedWidth) * scale).toInt())
        val height = max(1, ((if (crop) min(orientedWidth, orientedHeight) else orientedHeight) * scale).toInt())
        val result = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val graphics = result.createGraphics()
        try {
            graphics.color = Color.WHITE
            graphics.fillRect(0, 0, width, height)
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
            graphics.scale(scale, scale)
            if (crop) {
                val side = min(orientedWidth, orientedHeight)
                graphics.translate(-(orientedWidth - side) / 2, -(orientedHeight - side) / 2)
            }
            val matrix = when (orientation) {
                2 -> doubleArrayOf(-1.0, 0.0, 0.0, 1.0, w, 0.0)
                3 -> doubleArrayOf(-1.0, 0.0, 0.0, -1.0, w, h)
                4 -> doubleArrayOf(1.0, 0.0, 0.0, -1.0, 0.0, h)
                5 -> doubleArrayOf(0.0, 1.0, 1.0, 0.0, 0.0, 0.0)
                6 -> doubleArrayOf(0.0, 1.0, -1.0, 0.0, h, 0.0)
                7 -> doubleArrayOf(0.0, -1.0, -1.0, 0.0, h, w)
                8 -> doubleArrayOf(0.0, -1.0, 1.0, 0.0, 0.0, w)
                else -> doubleArrayOf(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
            }
            graphics.transform(AffineTransform(matrix))
            graphics.drawImage(source, 0, 0, null)
        } finally {
            graphics.dispose()
        }
        return result
    }

    private fun encode(image: BufferedImage): PhotoDerivative {
        val writer = ImageIO.getImageWritersByFormatName("jpeg").next()
        try {
            val bytes = ByteArrayOutputStream().use { output ->
                MemoryCacheImageOutputStream(output).use { stream ->
                    writer.output = stream
                    val params = writer.defaultWriteParam
                    params.compressionMode = ImageWriteParam.MODE_EXPLICIT
                    params.compressionQuality = 0.85f
                    writer.write(null, IIOImage(image, null, null), params)
                }
                output.toByteArray()
            }
            if (bytes.size > MAX_PHOTO_BYTES) oversizedPhoto()
            return PhotoDerivative(bytes, image.width, image.height)
        } finally {
            writer.dispose()
        }
    }
}
