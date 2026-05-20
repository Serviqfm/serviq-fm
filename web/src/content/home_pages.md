# ServiqFM Feature Pages — صفحات ميزات ServiqFM

This document contains the marketing and product-spec content for the four primary feature pages on the ServiqFM website: **Work Orders**, **Asset Management**, **Mobile App**, and **Preventative Maintenance**. Each section combines a public-facing marketing narrative with deeper feature notes intended to double as a product reference. All four reference the corresponding design screen from the `new design/` folder.

يحتوي هذا المستند على المحتوى التسويقي والتوثيقي لصفحات الميزات الأربع الرئيسية في موقع ServiqFM: **أوامر العمل**، **إدارة الأصول**، **تطبيق الهاتف**، **الصيانة الوقائية**. يجمع كل قسم بين سرد تسويقي موجَّه للجمهور وملاحظات تفصيلية تصلح كمرجع للمنتج. تستند جميع الأقسام إلى صور التصميم المقابلة في مجلد `new design/`.

---

## 1. Work Orders — أوامر العمل

![Work Orders dashboard — Serviq Lumina](new%20design/work_orders_serviq_lumina/screen.png)

**Reference design:** `new design/work_orders_serviq_lumina/screen.png`

**What the screen shows / ما يظهر في الشاشة:**
The Work Orders dashboard opens with a top row of operational KPIs — **24 Open Orders**, **08 Urgent (High priority)**, **15 In Progress**, and **4.2h Average Completion** — giving managers immediate situational awareness. Below sits the "Maintenance Schedule" table titled *Manage and track ongoing facility operations*, with **Filter**, **Export**, and **+ New Work Order** actions. Each row shows the work order title and number (e.g., `WO-2024-001`), the linked asset (e.g., *Carrier 40T Chiller*), the site (Riyadh HQ – Wing A, Jeddah Logistic Center, Dammam Facility, NEOM Operational Base), a colored priority badge (High / Medium / Low), a status pill (Assigned / Completed / New / In Progress), the assigned technician with avatar, and the due date. A persistent **+ Create Work Order** button sits in the left sidebar alongside navigation to Dashboard, Work Orders, Assets, PM Schedules, Sites, Users, Vendors, and Settings — all under the **Serviq Lumina** brand.

تفتح لوحة أوامر العمل بصف علوي من المؤشرات التشغيلية — **24 أمرًا مفتوحًا**، **08 أوامر عاجلة (أولوية عالية)**، **15 قيد التنفيذ**، **4.2 ساعة متوسط زمن الإنجاز** — ما يمنح المديرين وعيًا فوريًا بالوضع. وأسفلها يأتي جدول "جدول الصيانة" بعنوان *إدارة وتتبع العمليات التشغيلية الجارية*، مع إجراءات **تصفية** و**تصدير** و**+ أمر عمل جديد**. ويعرض كل صف عنوان أمر العمل ورقمه (مثل `WO-2024-001`)، والأصل المرتبط (مثل *مبرد كاريير 40T*)، والموقع (مقر الرياض، مركز جدة اللوجستي، منشأة الدمام، قاعدة نيوم التشغيلية)، وشارة أولوية ملوّنة (عالية/متوسطة/منخفضة)، وحبة حالة (مُسنَد/مكتمل/جديد/قيد التنفيذ)، والفني المعيَّن مع صورته، وتاريخ الاستحقاق. ويثبت زر **+ إنشاء أمر عمل** في الشريط الجانبي الأيسر إلى جانب التنقل بين لوحة المعلومات وأوامر العمل والأصول وجداول الصيانة الوقائية والمواقع والمستخدمين والموردين والإعدادات — جميعها تحت العلامة **Serviq Lumina**.

### Marketing copy — النص التسويقي

**English:**

> **Every work order. Every site. One screen.**
>
> ServiqFM gives facility managers a single, real-time view of every maintenance request across every site — from a Riyadh headquarters HVAC swap to a fire-extinguisher check in Jeddah. Sort, filter, and assign in seconds. Track priority and completion time without chasing spreadsheets.

**العربية:**

> **كل أمر عمل. كل موقع. في شاشة واحدة.**
>
> تمنح ServiqFM مديري المرافق رؤية فورية موحَّدة لكل طلب صيانة في كل موقع — من استبدال وحدة تكييف في مقر الرياض إلى فحص طفاية حريق في جدة. رتّب وصنّف وعيّن خلال ثوانٍ. وتتبَّع الأولوية وزمن الإنجاز دون مطاردة جداول البيانات.

### Key capabilities — أبرز الإمكانيات

- **Sequential numbered work orders** (`WO-0001`, `WO-0002` …) with full text search by number, title, or asset / أرقام تسلسلية لأوامر العمل مع بحث نصي كامل.
- **Priority badges** (High / Medium / Low) and **status pills** (New, Assigned, In Progress, Completed) for instant visual triage / شارات أولوية وحبات حالة للفرز البصري الفوري.
- **Smart assignment** — assign by technician, by trade (HVAC, electrical, plumbing), or leave unassigned for the dispatcher to route / إسناد ذكي حسب الفني أو التخصص أو ترك التكليف للمُوزّع.
- **Site, asset, and space linkage** — every work order is tied to a site, an optional asset, and an optional space (QR-coded room) / ربط كل أمر عمل بالموقع والأصل والمساحة (الغرفة المرمَّزة بـ QR).
- **Bulk export to PDF / Excel** for management reports and external auditors / تصدير مجمَّع إلى PDF وExcel للتقارير الإدارية والمدققين.
- **Status timeline** with comments, attachments (photos, voice notes, signatures), and audit trail / مخطط زمني للحالة مع تعليقات ومرفقات وسجل تدقيق.
- **Bilingual EN / AR** at the row level — Arabic descriptions render right-to-left automatically / دعم ثنائي اللغة على مستوى الصفّ — تُعرض الأوصاف العربية من اليمين لليسار تلقائيًا.
- **ZATCA-compliant invoice** generated on closure for billable jobs / إصدار فاتورة متوافقة مع ZATCA عند الإغلاق للأعمال القابلة للفوترة.

### Who this helps — لمن هذه الميزة

FM operations managers, dispatchers, site supervisors, and external vendors who need clarity on workload and accountability across multi-site portfolios.

مديرو عمليات إدارة المرافق والموزِّعون ومشرفو المواقع والموردون الخارجيون الذين يحتاجون وضوحًا في عبء العمل والمساءلة عبر محافظ متعددة المواقع.

---

## 2. Asset Management — إدارة الأصول

![Asset Inventory — Serviq Lumina](new%20design/asset_inventory_serviq_lumina/screen.png)

**Reference design:** `new design/asset_inventory_serviq_lumina/screen.png`

**What the screen shows / ما يظهر في الشاشة:**
The **Asset Inventory** screen leads with the headline *"Monitor and manage 1,248 facility assets across all sites"* and offers a **Grid / List** view toggle. A left filter panel narrows by **Category** (HVAC, Electrical, Plumbing, Fire & Safety, Elevators), by **Location / Site** (e.g., Riyadh Headquarters), and by **Asset Status** (Active, Under Maintenance, Retired/Decommissioned). The main canvas presents asset cards with a high-quality equipment photo, asset name (e.g., *Carrier Infinity 26 Air Conditioner*, *Schneider Electric LV Switchgear*, *Grundfos Hydro MPC Booster Set*, *Otis Gen2 Traction Motor*), the category and asset code (`SN: CA-4M02-21-AP`), a colored status badge, and a **Details** action. A teal **Smart Monitoring** card promotes optional IoT sensors with an **Enable Now** call-to-action. The footer shows pagination: *Showing 1–12 of 1,248 results*.

تتصدّر شاشة **مخزون الأصول** عبارة *"رصِد وأدِر 1,248 أصلًا منشآتيًا في جميع المواقع"* مع مُبدِّل لعرض **شبكة / قائمة**. ويُتيح شريط التصفية الأيسر التضييق حسب **الفئة** (تكييف وتبريد، كهرباء، سباكة، حريق وسلامة، مصاعد)، و**الموقع** (مثل المقر الرئيسي بالرياض)، و**حالة الأصل** (نشط، تحت الصيانة، متقاعد). ويعرض اللوح الرئيسي بطاقات الأصول بصورة عالية الجودة للمعدّة، واسم الأصل (مثل *كاريير Infinity 26 مكيف هواء*، *شنايدر إلكتريك لوحة جهد منخفض*، *جروندفوس Hydro MPC مجموعة معزّز ضغط*، *أوتيس Gen2 محرك جر*)، والفئة ورقم الأصل (`SN: CA-4M02-21-AP`)، وشارة حالة ملوّنة، وزر **التفاصيل**. وتروّج بطاقة **المراقبة الذكية** باللون الفيروزي لمستشعرات إنترنت الأشياء الاختيارية بزر **فعّل الآن**. وتُظهر الذيلية ترقيم الصفحات: *عرض 1–12 من أصل 1,248 نتيجة*.

### Marketing copy — النص التسويقي

**English:**

> **Know exactly what you own — and how it's performing.**
>
> ServiqFM turns the spreadsheet you've been keeping for years into a living asset registry. Every chiller, switchgear, booster pump, elevator motor, and fire panel — categorized, photographed, located, and one click away.

**العربية:**

> **اعرِف بدقّة ما تمتلك — وكيف يعمل.**
>
> تُحوّل ServiqFM جدول الإكسل الذي احتفظت به طويلًا إلى سجل أصول حيّ. كل مبرّد، ولوحة كهرباء، ومضخة معزِّزة، ومحرّك مصعد، ولوحة حريق — مصنَّفة، ومصوَّرة، ومحدَّدة الموقع، وعلى بُعد نقرة واحدة.

### Key capabilities — أبرز الإمكانيات

- **Hierarchical asset structure** — site → building → floor → space → asset, with parent-child relationships for systems and sub-components / هيكل هرمي للأصول من الموقع إلى المبنى إلى الطابق إلى المساحة إلى الأصل.
- **Rich asset records** — make, model, serial number, install date, warranty expiry, supplier, service contracts, attached manuals (PDF) / سجلات أصول غنية تشمل الصنع والموديل والرقم التسلسلي وتاريخ التركيب وانتهاء الضمان والمورد والعقود والكتيّبات.
- **QR codes for every asset** — print, stick on the equipment, technicians scan to open the record on mobile / رمز QR لكل أصل تُطبع وتُلصق على المعدّة ويفتحها الفنيون بمسحها.
- **Status tracking** — Active, Under Maintenance, Retired/Decommissioned with full history / تتبع حالات الأصل: نشط، تحت الصيانة، متقاعد، مع سجل كامل.
- **Filter & search** by category, site, status, manufacturer, age, criticality / تصفية وبحث حسب الفئة والموقع والحالة والصانع والعمر والأهمية.
- **Bulk import from spreadsheet** for fast onboarding of large estates / استيراد مجمَّع من جدول لتسريع تأهيل المحافظ الكبيرة.
- **IoT-ready** — optional smart monitoring connects sensors (temperature, vibration, runtime) directly to the asset record / جاهز لإنترنت الأشياء — يربط المستشعرات (حرارة، اهتزاز، وقت تشغيل) مباشرة بسجل الأصل.
- **Lifecycle reporting** — depreciation, mean-time-to-repair (MTTR), mean-time-between-failures (MTBF), cost-per-asset / تقارير دورة الحياة: الاستهلاك، متوسط زمن الإصلاح، متوسط زمن بين الأعطال، التكلفة لكل أصل.

### Who this helps — لمن هذه الميزة

Asset managers, finance teams running CapEx/OpEx planning, auditors verifying physical assets, and FM directors making replace-vs-repair decisions.

مديرو الأصول وفِرَق المالية المعنية بتخطيط النفقات الرأسمالية والتشغيلية، والمدققون الذين يتحقّقون من الأصول الفعلية، ومديرو إدارة المرافق الذين يقررون بين الاستبدال والإصلاح.

---

## 3. Mobile App — تطبيق الهاتف

![Technician dashboard — mobile app](new%20design/technician_dashboard_mobile/screen.png)

**Reference design:** `new design/technician_dashboard_mobile/screen.png`

**What the screen shows / ما يظهر في الشاشة:**
The **Technician Dashboard** opens with a personal greeting — *"Good morning, Khalid — You have 4 tasks today"* — under the **Serviq Lumina** wordmark, with a notification bell and profile avatar at the top. Two stat cards summarize the day: **02 In Progress** (green clipboard icon) and **14 Completed** (teal check icon). Below sits the **Active Work Orders** list with a *View All* shortcut. The first card — *HVAC System Periodic Maintenance, #WO-9842* — is tagged **High Priority** in green, located at *Main Lobby — Tower A*, due by *11:30 AM*, with a bold **START WORK** action. The second — *Emergency Lighting Inspection, #WO-9845* — is tagged **Routine**, located at *Basement B1, Parking*, due by *02:00 PM*, with a **VIEW DETAILS** action. A **Quick Resources** strip provides shortcuts to *Safety Manuals*, *Support Desk*, and *My Assets*. A circular floating **QR scan** button anchors the center of the bottom navigation, flanked by Dashboard, Tasks, Assets, and Profile tabs.

تفتح **لوحة الفنّي** بتحية شخصية — *"صباح الخير يا خالد — لديك 4 مهام اليوم"* — تحت شعار **Serviq Lumina** كنص، مع جرس إشعارات وصورة المستخدم في الأعلى. وتُلخّص بطاقتا إحصاء اليوم: **02 قيد التنفيذ** (أيقونة لوحة كتابة خضراء) و**14 مكتمل** (أيقونة تحقق فيروزية). وأسفلها تأتي قائمة **أوامر العمل النشطة** مع اختصار *عرض الكل*. تحمل البطاقة الأولى — *صيانة دورية لنظام التكييف، #WO-9842* — وسم **أولوية عالية** بالأخضر، ومكان *الردهة الرئيسية — برج A*، وموعد الاستحقاق *11:30 صباحًا*، مع زر **ابدأ العمل** بارز. أما الثانية — *فحص إنارة الطوارئ، #WO-9845* — فتحمل وسم **روتيني**، ومكان *القبو B1، الموقف*، وموعد *02:00 ظهرًا*، مع زر **عرض التفاصيل**. ويعرض شريط **الموارد السريعة** اختصارات إلى *كتيبات السلامة*، *الدعم الفني*، *أصولي*. ويتمركز زر **مسح QR** الدائري العائم في وسط شريط التنقل السفلي، يحفّ به تبويبا "لوحة المعلومات" و"المهام" يسارًا، و"الأصول" و"الملف الشخصي" يمينًا.

### Marketing copy — النص التسويقي

**English:**

> **Built for the field, not the conference room.**
>
> The ServiqFM mobile app puts the entire technician workflow in one place: today's work orders, asset history, safety manuals, and a QR scanner that opens a job in under a second. Works in Arabic or English, with push notifications so urgent jobs never get missed.

**العربية:**

> **مُصمَّم للميدان، لا لقاعة الاجتماعات.**
>
> يضع تطبيق ServiqFM للهاتف سير عمل الفنّي كاملًا في مكان واحد: أوامر اليوم، وسجل الأصل، وكتيبات السلامة، وماسح QR يفتح المهمة في أقل من ثانية. يعمل بالعربية أو الإنجليزية، مع إشعارات فورية تضمن ألا تفوّت أي مهمة عاجلة.

### Key capabilities — أبرز الإمكانيات

- **Personal daily dashboard** with task counts, greeting, and live priority queue / لوحة شخصية يومية بعدد المهام وتحية وقائمة الأولويات الحيّة.
- **One-tap "Start Work"** that timestamps the technician's arrival on the work order / زر "ابدأ العمل" بنقرة واحدة يسجّل وقت وصول الفنّي على أمر العمل.
- **QR scanning** — point the camera at an asset or space label to instantly open the matching record / مسح QR — وجِّه الكاميرا نحو وسم الأصل أو المساحة لفتح السجل المطابق فورًا.
- **Offline mode** — work orders cached locally so technicians can complete jobs in basements, plant rooms, and no-signal zones; data syncs when back online / وضع عدم الاتصال — تُخزَّن الأوامر محليًا لإنجازها في الأقبية وغرف المعدّات ومناطق ضعف الإشارة، وتُزامن البيانات عند عودة الاتصال.
- **Photo, voice, and signature capture** directly into the work order from the device camera and microphone / التقاط الصور والملاحظات الصوتية والتواقيع مباشرة في أمر العمل من كاميرا الجهاز والميكروفون.
- **Push notifications** for new assignments, urgent escalations, and PM due dates / إشعارات فورية للمهام الجديدة والتصعيدات العاجلة وتواريخ استحقاق الصيانة الوقائية.
- **Quick Resources** — pinned safety manuals, support desk hotline, and the technician's assigned assets / موارد سريعة — كتيبات سلامة مثبّتة، هاتف الدعم، والأصول المخصصة للفنّي.
- **Bilingual UI** — Arabic with full RTL layout, or English LTR, switchable per user / واجهة ثنائية اللغة — عربي بترتيب RTL كامل أو إنجليزي LTR، يمكن تبديلها لكل مستخدم.
- **Native iOS and Android** apps via Expo SDK 54 / تطبيقات iOS وAndroid أصلية عبر Expo SDK 54.

### Who this helps — لمن هذه الميزة

HVAC technicians, electricians, plumbers, fire-safety inspectors, janitorial leads, and any field worker who needs to receive, execute, and close work orders without going back to a desk.

فنيو التكييف والكهرباء والسباكة ومفتشو السلامة من الحريق ومشرفو النظافة وكل عامل ميداني يحتاج لتلقي أوامر العمل وتنفيذها وإغلاقها دون العودة إلى المكتب.

---

## 4. Preventative Maintenance — الصيانة الوقائية

![PM schedule detail — AC Filter Cleaning](new%20design/pm_schedule_detail_ac_filter_cleaning/screen.png)

**Reference design:** `new design/pm_schedule_detail_ac_filter_cleaning/screen.png`

**What the screen shows / ما يظهر في الشاشة:**
The **PM Schedule Detail** page opens on a specific schedule — *AC Filter Cleaning*, **Schedule ID: PM-2024-0892**, created by *Sarah Al-Farsi* — with a prominent **PAUSED** badge and three primary actions: **Resume**, **Edit**, and **Generate Work Order**. A header metrics row summarizes the schedule's health: **Next Due — 12 Oct 2024 (2 Days Overdue)**, **Last Generated — 14 Sep 2024 (WO #0823 Completed)**, **Completions — 24**, and **Compliance Rate — 96.8%**. Tabs across the body include **Details**, **Tasks & Checklist**, **Asset History**, and **Documents**. The Details panel identifies the linked **Asset** (*Carrier AHU-092-B — HVAC Systems / HR-3*), the **Site** (*Riyadh HQ Tower*), **Frequency** (*Monthly*), and the **Assigned Technician** (*Khalid Al-Mansour — Senior HVAC Technician*). The full preventive **Description** explains the AHU filter cleaning procedure — isolation, primary/secondary mesh removal, chemical wash, frame inspection, reinstallation with seal verification, and a 24-hour pre-notification to the Zone Manager because airflow may be reduced during cleaning. A **Schedule Metadata** sidebar lists *Last Modified — Oct 06, 2024*, *Generation Type — Automatic*, *Lead Time — 2 Days*, and *Priority — High*, with a small reference image/video of the equipment.

تفتح صفحة **تفاصيل جدول الصيانة الوقائية** على جدول محدّد — *تنظيف فلتر التكييف*، **معرف الجدول: PM-2024-0892**، أنشأته *سارة الفارسي* — مع شارة بارزة **متوقّف مؤقتًا**، وثلاثة إجراءات رئيسية: **استئناف**، **تعديل**، **إنشاء أمر عمل**. ويُلخّص صف المؤشرات الأعلى صحة الجدول: **الموعد التالي — 12 أكتوبر 2024 (متأخر بيومين)**، **آخر إنشاء — 14 سبتمبر 2024 (WO #0823 مكتمل)**، **عدد المرات المنفذة — 24**، **نسبة الالتزام — 96.8%**. وتشمل التبويبات: **التفاصيل**، **المهام وقائمة التحقق**، **سجل الأصل**، **المستندات**. ويحدّد لوح "التفاصيل" **الأصل** المرتبط (*كاريير AHU-092-B — أنظمة التكييف / HR-3*)، و**الموقع** (*برج المقر الرئيسي بالرياض*)، و**التكرار** (*شهري*)، و**الفني المعيّن** (*خالد المنصور — فني تكييف أول*). ويشرح **الوصف** الوقائي إجراء تنظيف فلتر وحدة التكييف — العزل، إزالة الشبكتين الأولية والثانوية، الغسل الكيميائي، فحص الإطار، إعادة التركيب مع التحقق من إحكام الأختام، والإبلاغ المسبق لمدير المنطقة قبل 24 ساعة لأن تدفق الهواء قد يقل أثناء التنظيف. ويعرض شريط **بيانات تعريف الجدول** الجانبي: *آخر تعديل — 06 أكتوبر 2024*، *نوع الإنشاء — تلقائي*، *مهلة الإنشاء — يومان*، *الأولوية — عالية*، إلى جانب صورة/فيديو مرجعي صغير للمعدّة.

### Marketing copy — النص التسويقي

**English:**

> **The maintenance you should have done — done.**
>
> Preventive maintenance only works if it actually happens. ServiqFM turns your PM plan into automatically generated work orders, sends them to the right technician with the right checklist, and tracks your compliance rate over time. No more "we'll get to it next month."

**العربية:**

> **الصيانة التي كان يجب أن تُنفَّذ — نُفِّذَت.**
>
> الصيانة الوقائية لا تنفع إلا إن نُفِّذت فعلًا. تحوّل ServiqFM خطة الصيانة الوقائية لديك إلى أوامر عمل تتولّد تلقائيًا، وتُرسلها إلى الفني المناسب مع قائمة التحقق المناسبة، وتتعقّب نسبة التزامك عبر الزمن. لا مزيد من "سننفّذها الشهر القادم".

### Key capabilities — أبرز الإمكانيات

- **Flexible frequencies** — daily, weekly, monthly, quarterly, semi-annual, annual, or based on runtime/meter readings / تواترات مرنة: يومي، أسبوعي، شهري، ربع سنوي، نصف سنوي، سنوي، أو بناءً على ساعات التشغيل والقراءات.
- **Automatic work-order generation** with a configurable lead time (e.g., 2 days before the due date) / إنشاء تلقائي لأمر العمل قبل تاريخ الاستحقاق بمهلة قابلة للإعداد (مثل يومين).
- **Compliance tracking** — every schedule shows completions, overdue count, and a rolling compliance percentage / تتبع الالتزام — يُظهر كل جدول عدد التنفيذ والمتأخرات ونسبة التزام متجدّدة.
- **Pause and resume** schedules for seasonal equipment, retired assets, or site shutdowns / إيقاف مؤقت واستئناف للجداول الموسمية أو الأصول المتقاعدة أو الإغلاقات.
- **Detailed task checklists** per schedule — every step the technician must complete and confirm in the field / قوائم تحقق تفصيلية لكل جدول — كل خطوة يجب على الفني إكمالها وتأكيدها ميدانيًا.
- **Asset history** — every PM ever performed against the asset, in one timeline / سجل الأصل — كل صيانة وقائية نُفِّذَت على الأصل في خط زمني واحد.
- **Document attachments** — manufacturer manuals, MSDS sheets, SOPs available offline on the technician's phone / مرفقات الوثائق — كتيبات الصانع وصحائف السلامة المادية وإجراءات التشغيل القياسية، متاحة دون اتصال على هاتف الفنّي.
- **Pre-notification rules** — auto-alert the zone manager, occupants, or vendors before disruptive work / قواعد الإبلاغ المسبق — تنبيه آلي لمدير المنطقة أو الشاغلين أو الموردين قبل الأعمال التي تُسبّب اضطرابًا.
- **SLA-friendly metadata** — priority, lead time, generation type (manual or automatic), last-modified audit / بيانات تعريف صديقة لاتفاقيات مستوى الخدمة: الأولوية، مهلة الإنشاء، نوع الإنشاء (يدوي أو تلقائي)، تدقيق آخر تعديل.

### Who this helps — لمن هذه الميزة

PM planners, reliability engineers, HSE managers, compliance officers, and any operator subject to insurance, regulatory, or warranty-driven maintenance obligations.

مخططو الصيانة الوقائية، ومهندسو الموثوقية، ومديرو الصحة والسلامة والبيئة، ومسؤولو الامتثال، وأي مشغّل تخضع منشآته لالتزامات صيانة مفروضة من شركات التأمين أو الجهات التنظيمية أو الضمانات.

---

## Cross-feature notes — ملاحظات شاملة

**English:**
All four features share the underlying ServiqFM foundations:
- **Multi-tenant org isolation** — every record is scoped to a single customer organization with row-level security.
- **Role-based access** — Admin, Manager, Technician, Vendor, Requester, Auditor.
- **Bilingual EN / AR experience** with per-user language preference and full Arabic RTL layout.
- **ZATCA Phase 2 e-invoicing** on closed work orders.
- **Audit trail** on every record (who changed what, when).
- **Vercel-deployed web app** with automatic HTTPS and CDN; **Expo-built** native mobile apps.

**العربية:**
تتشارك الميزات الأربع البنية التحتية الأساسية لـ ServiqFM:
- **عزل تام بين المؤسسات** — كل سجل ينتمي إلى مؤسسة واحدة مع أمان على مستوى الصفوف.
- **صلاحيات حسب الدور** — مدير، مشرف، فنّي، مورد، مقدّم طلب، مدقّق.
- **تجربة ثنائية اللغة عربي/إنجليزي** بتفضيل لكل مستخدم وبتخطيط عربي RTL كامل.
- **فوترة إلكترونية ZATCA المرحلة الثانية** على أوامر العمل المغلقة.
- **سجل تدقيق** على كل سجل (من غيّر ماذا ومتى).
- **تطبيق ويب منشور على Vercel** مع HTTPS وCDN تلقائيين، وتطبيقات هاتف أصلية مبنية بـ Expo.

---

**Calls to action — دعوات للإجراء:**

- *Book a 20-minute demo* — *احجز عرضًا توضيحيًا في 20 دقيقة*
- *Start a free 14-day trial* — *ابدأ تجربة مجانية لمدة 14 يومًا*
- *Talk to sales — sales@serviqfm.com* — *تواصل مع المبيعات*
