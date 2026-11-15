package com.familycooking.tracker.photos

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.zip.CRC32
import java.io.InputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.imageio.ImageIO

class PhotoImageProcessorTest {
    private val processor = PhotoImageProcessor()

    @Test
    fun `HEIC and HEIF submissions become JPEG derivatives without metadata`() {
        val source = javaClass.getResourceAsStream("/photos/quadrants-1.heic")!!.use { it.readBytes() }
        for (mime in listOf("image/heic", "image/heif")) {
            val result = processor.process(ByteArrayInputStream(source), mime, false)
            assertEquals(80, result.detail.width)
            assertEquals(40, result.detail.height)
            assertEquals(0xff.toByte(), result.detail.bytes[0])
            assertEquals(0xd8.toByte(), result.detail.bytes[1])
            assertNotNull(ImageIO.read(ByteArrayInputStream(result.thumbnail.bytes)))
            assertFalse(String(result.detail.bytes, Charsets.ISO_8859_1).contains("PRIVATE HEIC METADATA"))
        }
        val genericHeifBrand = source.clone()
        "mif1".toByteArray().copyInto(genericHeifBrand, 8)
        val generic = processor.process(ByteArrayInputStream(genericHeifBrand), "image/heif", false)
        assertEquals(80, generic.detail.width)
        assertEquals(40, generic.detail.height)
    }

    @Test
    fun `HEIC container rotation transparency tiling and avatar crop survive conversion`() {
        fun convert(name: String, avatar: Boolean = false): ProcessedPhoto {
            val bytes = javaClass.getResourceAsStream("/photos/$name.heic")!!.use { it.readBytes() }
            return processor.process(ByteArrayInputStream(bytes), "image/heic", avatar)
        }
        val rotated = convert("quadrants-6")
        assertEquals(40, rotated.detail.width)
        assertEquals(80, rotated.detail.height)
        val rotatedImage = ImageIO.read(ByteArrayInputStream(rotated.detail.bytes))
        val topLeft = Color(rotatedImage.getRGB(5, 5))
        assertTrue(topLeft.blue > 200 && topLeft.red < 40 && topLeft.green < 40)

        val transparent = convert("transparent")
        val white = ImageIO.read(ByteArrayInputStream(transparent.detail.bytes))
        assertEquals(Color.WHITE.rgb, white.getRGB(5, 5))

        val tiled = convert("tiled")
        assertEquals(1600, tiled.detail.width)
        assertEquals(800, tiled.detail.height)
        assertEquals(320, tiled.thumbnail.width)
        assertEquals(160, tiled.thumbnail.height)
        val avatar = convert("tiled", true)
        assertEquals(256, avatar.detail.width)
        assertEquals(256, avatar.detail.height)
        val smallAvatar = convert("quadrants-6", true)
        assertEquals(40, smallAvatar.detail.width)
        assertEquals(40, smallAvatar.detail.height)
    }

    @Test
    fun `HEIC truncation pixel bombs sequences and MIME mismatches are rejected`() {
        val source = javaClass.getResourceAsStream("/photos/quadrants-1.heic")!!.use { it.readBytes() }
        val tooManyPixels = javaClass.getResourceAsStream("/photos/over-24mp.heic")!!.use { it.readBytes() }
        val sequence = source.clone()
        "msf1".toByteArray().copyInto(sequence, 8)
        for ((bytes, mime, status) in listOf(
            Triple(source.copyOf(100), "image/heic", 400),
            Triple(tooManyPixels, "image/heic", 413),
            Triple(sequence, "image/heic", 415),
            Triple(source, "image/png", 415),
            Triple(source, "image/heic-sequence", 415),
        )) {
            val error = assertThrows(PhotoException::class.java) {
                processor.process(ByteArrayInputStream(bytes), mime, false)
            }
            assertEquals(status, error.status)
        }
    }

    @Test
    fun `decoder concurrency is bounded and capacity is released after an invalid upload`() {
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val blocking = object : InputStream() {
            override fun read(): Int {
                entered.countDown()
                check(release.await(5, TimeUnit.SECONDS))
                return -1
            }
        }
        Executors.newSingleThreadExecutor().use { executor ->
            val first = executor.submit {
                assertThrows(PhotoException::class.java) { processor.process(blocking, "image/png", false) }
            }
            try {
                assertTrue(entered.await(5, TimeUnit.SECONDS))
                val rejected = assertThrows(PhotoException::class.java) {
                    processor.process(ByteArrayInputStream(samplePng()), "image/png", false)
                }
                assertEquals(503, rejected.status)
            } finally {
                release.countDown()
            }
            first.get(5, TimeUnit.SECONDS)
        }
        assertNotNull(processor.process(ByteArrayInputStream(samplePng()), "image/png", false))
    }

    @Test
    fun `PNG transparency becomes white JPEG with bounded derivatives and no upscaling`() {
        val image = BufferedImage(2000, 1000, BufferedImage.TYPE_INT_ARGB)
        val result = processor.process(ByteArrayInputStream(encode(image, "png")), "image/png", false)
        assertEquals(1600, result.detail.width)
        assertEquals(800, result.detail.height)
        assertEquals(320, result.thumbnail.width)
        assertEquals(160, result.thumbnail.height)
        val decoded = ImageIO.read(ByteArrayInputStream(result.detail.bytes))
        assertEquals(Color.WHITE.rgb, decoded.getRGB(0, 0))
        assertTrue(result.detail.bytes.size < MAX_PHOTO_BYTES)

        val tiny = processor.process(ByteArrayInputStream(samplePng(30, 20)), "image/png", false)
        assertEquals(30, tiny.detail.width)
        assertEquals(20, tiny.thumbnail.height)
    }

    @Test
    fun `avatar crop is square and small avatars are not upscaled`() {
        val large = processor.process(ByteArrayInputStream(samplePng(800, 400)), "image/png", true)
        assertEquals(256, large.detail.width)
        assertEquals(256, large.detail.height)
        val small = processor.process(ByteArrayInputStream(samplePng(30, 20)), "image/png", true)
        assertEquals(20, small.detail.width)
        assertEquals(20, small.detail.height)
    }

    @Test
    fun `all JPEG orientations are applied and source metadata is removed`() {
        val image = BufferedImage(60, 40, BufferedImage.TYPE_INT_RGB)
        image.createGraphics().apply {
            color = Color.RED
            fillRect(0, 0, 30, 20)
            color = Color.GREEN
            fillRect(30, 0, 30, 20)
            color = Color.BLUE
            fillRect(0, 20, 30, 20)
            color = Color.WHITE
            fillRect(30, 20, 30, 20)
            dispose()
        }
        val topLeftColors = listOf(Color.RED, Color.GREEN, Color.WHITE, Color.BLUE, Color.RED, Color.BLUE, Color.WHITE, Color.GREEN)
        for (orientation in 1..8) {
            val source = withExif(encode(image, "jpg"), orientation)
            val result = processor.process(ByteArrayInputStream(source), "image/jpeg", false)
            assertEquals(if (orientation >= 5) 40 else 60, result.detail.width)
            assertEquals(if (orientation >= 5) 60 else 40, result.detail.height)
            val decoded = ImageIO.read(ByteArrayInputStream(result.detail.bytes))
            val actual = Color(decoded.getRGB(5, 5))
            val expected = topLeftColors[orientation - 1]
            assertTrue(kotlin.math.abs(actual.red - expected.red) < 30, "orientation $orientation red")
            assertTrue(kotlin.math.abs(actual.green - expected.green) < 30, "orientation $orientation green")
            assertTrue(kotlin.math.abs(actual.blue - expected.blue) < 30, "orientation $orientation blue")
            assertFalse(String(result.detail.bytes, Charsets.ISO_8859_1).contains("Exif"))
            assertFalse(String(result.thumbnail.bytes, Charsets.ISO_8859_1).contains("PRIVATE GPS NOTE"))
        }
    }

    @Test
    fun `spoofed unsupported corrupt animated and empty uploads are rejected`() {
        for ((bytes, mime, status) in listOf(
            Triple(samplePng(), "image/jpeg", 415),
            Triple("<svg/>".toByteArray(), "image/png", 415),
            Triple(samplePng().copyOf(35), "image/png", 400),
            Triple(samplePng().apply { this[lastIndex] = (this[lastIndex].toInt() xor 1).toByte() }, "image/png", 400),
            Triple(ByteArray(0), "image/png", 400),
            Triple(samplePng(), "image/heic", 415),
            Triple(animatedPng(), "image/png", 415),
        )) {
            val failure = assertThrows(PhotoException::class.java) {
                processor.process(ByteArrayInputStream(bytes), mime, false)
            }
            assertEquals(status, failure.status)
        }
    }

    @Test
    fun `byte and dimension limits reject before full decoding`() {
        val tooManyBytes = assertThrows(PhotoException::class.java) {
            processor.process(ByteArrayInputStream(ByteArray(MAX_PHOTO_BYTES + 1)), "image/jpeg", false)
        }
        assertEquals(413, tooManyBytes.status)
        val hugeHeader = samplePng().clone()
        ByteBuffer.wrap(hugeHeader, 16, 8).putInt(6000).putInt(6000)
        val crc = CRC32().apply { update(hugeHeader, 12, 17) }
        ByteBuffer.wrap(hugeHeader, 29, 4).putInt(crc.value.toInt())
        val tooManyPixels = assertThrows(PhotoException::class.java) {
            processor.process(ByteArrayInputStream(hugeHeader), "image/png", false)
        }
        assertEquals(413, tooManyPixels.status)
    }

    companion object {
        fun samplePng(width: Int = 40, height: Int = 20): ByteArray = encode(BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png")

        fun encode(image: BufferedImage, format: String): ByteArray = ByteArrayOutputStream().use {
            check(ImageIO.write(image, format, it))
            it.toByteArray()
        }

        private fun withExif(jpeg: ByteArray, orientation: Int): ByteArray {
            val tiff = ByteBuffer.allocate(26)
                .put('M'.code.toByte()).put('M'.code.toByte()).putShort(42).putInt(8)
                .putShort(1).putShort(0x112).putShort(3).putInt(1)
                .putShort(orientation.toShort()).putShort(0).putInt(0).array()
            val exif = "Exif\u0000\u0000".toByteArray() + tiff
            val note = "PRIVATE GPS NOTE".toByteArray()
            fun segment(marker: Int, body: ByteArray) = ByteBuffer.allocate(body.size + 4)
                .put(0xff.toByte()).put(marker.toByte()).putShort((body.size + 2).toShort()).put(body).array()
            return jpeg.copyOfRange(0, 2) + segment(0xe1, exif) + segment(0xfe, note) + jpeg.copyOfRange(2, jpeg.size)
        }

        private fun animatedPng(): ByteArray {
            val bytes = samplePng()
            val data = "acTL".toByteArray() + ByteBuffer.allocate(8).putInt(2).putInt(0).array()
            val crc = CRC32().apply { update(data) }
            val chunk = ByteBuffer.allocate(20).putInt(8).put(data).putInt(crc.value.toInt()).array()
            return bytes.copyOfRange(0, 33) + chunk + bytes.copyOfRange(33, bytes.size)
        }
    }
}
