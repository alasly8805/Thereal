# دليل مواصفات منصة السنتر وتكامل أكواد الحصص (CENTER_INTEGRATION_SPEC)

## الغرض (Purpose)
منظومة متكاملة لخدمة طلاب السنتر والحصص والمجموعات الحضورية عبر النطاق الفرعي `center.code-up.tech`، مع إمكانية تحديد المعلم لطبيعة كل كورس (أونلاين أو سنتر)، وإتاحة الدخول الحصري عبر كود الحصة (Redeem Code) بدون أسعار أو بوابات دفع، وتسهيل محرر الأكواد البرمجية.

---

## 1. المتغيرات الموحدة (Canonical Constants & Variables)

- **نمط التسليم (`deliveryMode`)**:
  - `ONLINE`: يظهر فقط على المنصة العامة `code-up.tech`.
  - `CENTER`: يظهر فقط على منصة السنتر `center.code-up.tech`.
  - `BOTH`: يظهر في المنصتين معاً.

- **اكتشاف النطاق الفرعي (Subdomain Detection)**:
  - Header: `x-center-mode: 1`
  - Cookie: `center_mode=1`
  - Query param for dev/testing: `?center=1` or `?mode=center`
  - Host: `center.code-up.tech`

- **مسار فحص ومعاينة الكود الذكي**:
  - `GET /api/codes/resolve?code=XXXX`
  - يرجع تلقائياً:
    ```json
    {
      "valid": true,
      "courseId": "cuid...",
      "courseTitle": "فيزياء الثانوية العامة",
      "teacherName": "أ/ محمد عبد المعبود",
      "scopeLabel": "الكورس كاملاً",
      "deliveryMode": "CENTER"
    }
    ```

- **مسار تفعيل الكود وإضافته لمكتبة الطالب**:
  - `POST /api/codes`
  - Payload: `{ "code": "XXXX" }`
  - النتيجة: فك قفل الكورس وإضافته لمكتبة الطالب (`/library`) فوراً.

---

## 2. ما تم إنجازه بالكامل (Completed Work by Antigravity)

1. **قاعدة البيانات (`prisma/schema.prisma`)**:
   - إضافة `deliveryMode String @default("ONLINE")` مع الفهرس `@@index([deliveryMode])`.
   - تطبيق التحديث بنجاح عبر `npx prisma db push` وتوليد العميل `prisma-client`.

2. **الشبكة وخادم Nginx**:
   - إضافة `center.code-up.tech` في `/etc/nginx/conf.d/code-up.conf` لمنفذي 80 و 443.
   - فحص وتطبيق إعادة تحميل Nginx بنجاح.

3. **توجيه الـ Middleware (`src/proxy.ts`)**:
   - رصد `center.` وتمرير الترويسة `x-center-mode: 1` وضبط كوكي `center_mode=1`.

4. **تصفية الكورسات في API (`/api/courses/route.ts`)**:
   - حصر الكورسات المعروضة في وضع السنتر على `CENTER` و `BOTH`.

5. **لوحة المعلم (`src/app/adminpanel/teacher/page.tsx`)**:
   - إضافة اختيار `طبيعة الكورس` في نموذج الإنشاء والإعدادات (أونلاين 🌐، سنتر 🏛️، كلاهما 🔄).

6. **شريط وهوية وضع طلاب السنتر (`CenterModeBanner.tsx`)**:
   - شريط ذهبي علوي مع زر "تفعيل كود السنتر" ونافذة منبثقة تفاعلية تكشف اسم المعلم والكورس وتفعل الكود فوراً.

7. **صفحة تفاصيل الكورس (`src/app/courses/[id]/page.tsx`)**:
   - إخفاء أسعار الدفع وبوابات الفواتير والمحافظ في وضع السنتر، وإبراز بطاقة تفعيل كود الحصة.

8. **تطوير محرر الأكواد (`Python IDE` & `JavaScript IDE`)**:
   - إضافة ترقيم الأسطر، دعم `Tab` للمسافات، شريط الرموز السريعة للهواتف، تكبير وتصغير الخط، ونسخ الكود.
