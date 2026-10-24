package com.familycooking.tracker.dishes

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@Entity
@Table(name = "dishes")
class Dish(
    @Id
    var id: UUID = UUID.randomUUID(),
    @Column(nullable = false, length = 200)
    var name: String,
    @Column(name = "prepared_on", nullable = false)
    var preparedOn: LocalDate,
    @Column(length = 5000)
    var notes: String? = null,
    @Column(name = "created_by", nullable = false, updatable = false)
    var createdBy: UUID,
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = createdAt,
)
