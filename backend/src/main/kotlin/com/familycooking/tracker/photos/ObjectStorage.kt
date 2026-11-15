package com.familycooking.tracker.photos

interface ObjectStorage : AutoCloseable {
    fun verifyBucket(bucket: String)
    fun upload(bucket: String, key: String, bytes: ByteArray)
    fun download(bucket: String, key: String): ByteArray
    fun delete(bucket: String, keys: List<String>)
    override fun close() {}
}
