package com.familycooking.tracker.photos

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.time.Duration

class HeicDecoderTest {
    private val source = javaClass.getResourceAsStream("/photos/quadrants-1.heic")!!.use { it.readBytes() }
    private val python = System.getenv("PHOTO_HEIC_PYTHON") ?: "python3"

    @Test
    fun `missing codec does not break JPEG and PNG processing`() {
        val processor = PhotoImageProcessor(HeicDecoder("missing-photo-codec-executable"))
        val error = assertThrows(PhotoException::class.java) {
            processor.process(ByteArrayInputStream(source), "image/heic", false)
        }
        assertEquals(503, error.status)
        assertNotNull(processor.process(ByteArrayInputStream(PhotoImageProcessorTest.samplePng()), "image/png", false))
    }

    @Test
    fun `hung and broken decoders fail within the deadline with sanitized errors`() {
        assertTimeoutPreemptively(Duration.ofSeconds(8)) {
            val scripts = listOf(
                "import time; time.sleep(30)",
                "import sys; sys.stdin.buffer.read(); sys.exit(43)",
                "import sys; sys.stdin.buffer.read(); sys.stdout.buffer.write(b'bad')",
                "import sys; sys.stdin.buffer.read(); sys.stdout.buffer.write(b'x' * 8000000)",
            )
            for (script in scripts) {
                val decoder = HeicDecoder(python, timeoutMillis = 500, script = script)
                val error = assertThrows(PhotoException::class.java) { decoder.decode(source) }
                assertEquals(503, error.status)
                assertEquals("PHOTO_UNAVAILABLE", error.code)
                assertNull(error.cause)
            }
        }
    }

    @Test
    fun `codec process receives only runtime environment and bounded raw pixels are accepted`() {
        val script = """
            import os, sys, struct
            assert set(k.upper() for k in os.environ) <= {'PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'LC_CTYPE'}
            sys.stdin.buffer.read()
            sys.stdout.buffer.write(struct.pack('>II', 1, 1) + bytes([255, 0, 0]))
        """.trimIndent()
        val image = HeicDecoder(python, script = script).decode(source)
        assertEquals(1, image.width)
        assertEquals(1, image.height)
        assertEquals(java.awt.Color.RED.rgb, image.getRGB(0, 0))
    }
}
