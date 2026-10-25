package com.familycooking.tracker.dishes

import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import java.util.UUID

interface DishRepository : JpaRepository<Dish, UUID> {
    @Query("SELECT dish FROM Dish dish ORDER BY dish.preparedOn DESC, dish.createdAt DESC, dish.id DESC")
    fun findAllOrdered(): List<Dish>
}
