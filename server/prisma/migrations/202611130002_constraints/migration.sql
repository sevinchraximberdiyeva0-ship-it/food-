-- Keep monetary values and business invariants valid even outside the HTTP API.
ALTER TABLE "Product" ADD CONSTRAINT "Product_price_check" CHECK ("price" >= 1000 AND "price" <= 10000000);
ALTER TABLE "Order" ADD CONSTRAINT "Order_total_check" CHECK ("total" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_version_check" CHECK ("version" > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_check" CHECK ("quantity" BETWEEN 1 AND 100);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_price_check" CHECK ("price" >= 1000);
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_discount_check" CHECK ("discount" BETWEEN 1 AND 100);
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6);
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_time_check" CHECK (
  "start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
);
-- A courier can have at most one active delivery, including concurrent assignment.
CREATE UNIQUE INDEX "Delivery_one_active_per_courier" ON "Delivery" ("courierId")
  WHERE "status" IN ('ASSIGNED', 'PICKED_UP');
