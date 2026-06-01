import FeaturePage from '@/components/FeaturePage'

export const metadata = { title: 'Work Orders' }

export default function WorkOrdersFeaturePage() {
  return (
    <FeaturePage
      eyebrow={{ en: 'Work Orders', ar: 'أوامر العمل' }}
      title={{ en: 'Every work order. Every site. One screen.', ar: 'كل أمر عمل. كل موقع. في شاشة واحدة.' }}
      description="A single, real-time view of every maintenance request across every site — from a Riyadh headquarters HVAC swap to a fire-extinguisher check in Jeddah."
      image={{ src: '/features/work-orders.png', alt: 'Work Orders dashboard — Serviq Lumina' }}
      marketing={{
        en: 'ServiqFM gives facility managers a single, real-time view of every maintenance request across every site — from a Riyadh headquarters HVAC swap to a fire-extinguisher check in Jeddah. Sort, filter, and assign in seconds. Track priority and completion time without chasing spreadsheets.',
        ar: 'تمنح ServiqFM مديري المرافق رؤية فورية موحَّدة لكل طلب صيانة في كل موقع — من استبدال وحدة تكييف في مقر الرياض إلى فحص طفاية حريق في جدة. رتّب وصنّف وعيّن خلال ثوانٍ. وتتبَّع الأولوية وزمن الإنجاز دون مطاردة جداول البيانات.',
      }}
      capabilities={[
        { en: 'Sequential numbered work orders (WO-0001, WO-0002…) with full text search by number, title, or asset.', ar: 'أرقام تسلسلية لأوامر العمل مع بحث نصي كامل بالرقم أو العنوان أو الأصل.' },
        { en: 'Priority badges (High / Medium / Low) and status pills (New, Assigned, In Progress, Completed) for instant visual triage.', ar: 'شارات أولوية وحبات حالة للفرز البصري الفوري.' },
        { en: 'Smart assignment — assign by technician, by trade (HVAC, electrical, plumbing), or leave unassigned for the dispatcher to route.', ar: 'إسناد ذكي حسب الفني أو التخصص أو ترك التكليف للمُوزّع.' },
        { en: 'Site, asset, and space linkage — every work order is tied to a site, an optional asset, and an optional space (QR-coded room).', ar: 'ربط كل أمر عمل بالموقع والأصل والمساحة (الغرفة المرمَّزة بـ QR).' },
        { en: 'Bulk export to PDF / Excel for management reports and external auditors.', ar: 'تصدير مجمَّع إلى PDF وExcel للتقارير الإدارية والمدققين.' },
        { en: 'Status timeline with comments, attachments (photos, voice notes, signatures), and a full audit trail.', ar: 'مخطط زمني للحالة مع تعليقات ومرفقات وسجل تدقيق.' },
        { en: 'Bilingual EN / AR at the row level — Arabic descriptions render right-to-left automatically.', ar: 'دعم ثنائي اللغة على مستوى الصفّ — تُعرض الأوصاف العربية من اليمين لليسار تلقائيًا.' },
        { en: 'ZATCA-compliant invoice generated on closure for billable jobs.', ar: 'إصدار فاتورة متوافقة مع ZATCA عند الإغلاق للأعمال القابلة للفوترة.' },
      ]}
      audience={{
        en: 'FM operations managers, dispatchers, site supervisors, and external vendors who need clarity on workload and accountability across multi-site portfolios.',
        ar: 'مديرو عمليات إدارة المرافق والموزِّعون ومشرفو المواقع والموردون الخارجيون الذين يحتاجون وضوحًا في عبء العمل والمساءلة عبر محافظ متعددة المواقع.',
      }}
    />
  )
}
