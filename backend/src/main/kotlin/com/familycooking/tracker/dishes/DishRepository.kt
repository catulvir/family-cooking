package com.familycooking.tracker.dishes

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface DishRepository : JpaRepository<Dish, UUID> {
    fun findAllByOrderByPreparedOnDescCreatedAtDescIdDesc(): List<Dish>
}
