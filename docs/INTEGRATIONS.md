# Kelajak integratsiyalari

Haqiqiy to‘lov, GPS va tashqi yetkazib berish provayderlariga tarmoq chaqiruvlari yo‘q. API kalitlari kerak emas va demo sahifada xizmat ulangan deb ko‘rsatilmaydi. `server/src/providers.ts` TypeScript interfeyslari tayyor, hozir hech biri instansiya qilinmaydi.

## DeliveryProvider

`quote`, `createDelivery`, `cancelDelivery`, `getStatus`, `verifyWebhook`, `normalizeStatus`. Quote summasi integer UZS va amal qilish muddatiga ega. Buyurtma narxi oshsa restoran qayta tasdiqlashi kerak. Keyingi implementatsiya tashqi chaqiruvni DB tranzaksiyasidan tashqarida outbox/worker orqali bajaradi; idempotency key, providerTaskId unique va retry holati bazada saqlanadi. Provayder statusi ichki enumga adapterda o‘giriladi. Webhook uchun asl raw body, imzo, vaqt chegarasi, event ID unique va replay/late-event tekshiruvlari zarur. Yetkazilgan holatni orqaga qaytarish mumkin emas.

## PaymentProvider

`create`, `refund`, `verifyWebhook`. Narx faqat server hisoblagan OrderItem snapshotidan; UZS/tiyin farqi adapterda. Payment, Refund va ledger modellarini qo‘shish, idempotency yozuvlari va reconciliation zarur. Brauzer qaytish sahifasi to‘lovni tasdiqlamaydi; imzolangan server webhook va provider tekshiruvi kerak. Hozirgi `COMPLETED` buyurtma haqiqiy to‘lov qabul qilinganini bildirmaydi.

## LocationProvider

`publish({courierId, latitude, longitude, occurredAt})`. Keyingi API courierId’ni autentifikatsiyadan oladi; koordinata, vaqt va takroriy/o‘ta tez so‘rovlar tekshiriladi. Kuzatuv faqat ish topshirig‘i davomida, ruxsatli restoran/foydalanuvchiga va belgilangan retention bilan ochiladi. GPS, marshrut va manzil geocoding hozir amalga oshirilmagan.

## Sirlar va operatsiya

Har provayder o‘z adapteri, server-only muhit o‘zgaruvchilari va sandbox testlariga ega bo‘ladi. Kalitlar `VITE_*`, frontend bundle, URL yoki logga yozilmaydi. Timeout, tarmoq xatosi, takroriy webhook, noto‘g‘ri imzo, valyuta va rollback holatlari haqiqiy sandbox’da tekshirilmasdan integratsiya ishlayapti deb ko‘rsatilmaydi.
