package com.familycooking.tracker.photos

import java.io.ByteArrayOutputStream
import java.net.http.HttpResponse
import java.nio.ByteBuffer
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.Flow

/** Applies the response limit while receiving bytes, before a full body is allocated. */
internal class BoundedBodySubscriber(private val limit: Int) : HttpResponse.BodySubscriber<ByteArray> {
    private val future = CompletableFuture<ByteArray>()
    private val output = ByteArrayOutputStream()
    private lateinit var subscription: Flow.Subscription

    override fun getBody(): CompletionStage<ByteArray> = future

    override fun onSubscribe(subscription: Flow.Subscription) {
        this.subscription = subscription
        subscription.request(1)
    }

    override fun onNext(items: List<ByteBuffer>) {
        if (output.size().toLong() + items.sumOf { it.remaining().toLong() } > limit) {
            subscription.cancel()
            future.completeExceptionally(IllegalStateException("Storage response exceeded limit"))
            return
        }
        for (item in items) {
            val bytes = ByteArray(item.remaining())
            item.get(bytes)
            output.write(bytes)
        }
        subscription.request(1)
    }

    override fun onError(throwable: Throwable) { future.completeExceptionally(throwable) }
    override fun onComplete() { future.complete(output.toByteArray()) }
}
