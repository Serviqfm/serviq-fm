import FeaturePage from '@/components/FeaturePage'

export const metadata = { title: 'Preventive Maintenance' }

export default function PMFeaturePage() {
  return (
    <FeaturePage
      eyebrow={{ en: 'Preventive Maintenance', ar: 'الصيانة الوقائية' }}
      title={{ en: 'The maintenance you should have done — done.', ar: 'الصيانة التي كان يجب أن تُنفَّذ — نُفِّذَت.' }}
      description="Preventive maintenance only works if it actually happens. Turn your PM plan into automatically generated work orders, sent to the right technician with the right checklist."
      image={{ src: '/features/preventive-maintenance.png', alt: 'PM schedule detail — AC filter cleaning' }}
      marketing={{
        en: 'Preventive maintenance only works if it actually happens. ServiqFM turns your PM plan into automatically generated work orders, sends them to the right technician with the right checklist, and tracks your compliance rate over time. No more "we’ll get to it next month."',
        ar: 'الصيانة الوقائية لا تنفع إلا إن نُفِّذت فعلًا. تحوّل ServiqFM خطة الصيانة الوقائية لديك إلى أوامر عمل تتولّد تلقائيًا، وتُرسلها إلى الفني المناسب مع قائمة التحقق المناسبة، وتتعقّب نسبة التزامك عبر الزمن. لا مزيد من "سننفّذها الشهر القادم".',
      }}
      capabilities={[
        { en: 'Flexible frequencies — daily, weekly, monthly, quarterly, semi-annual, annual, or based on runtime / meter readings.', ar: 'تواترات مرنة: يومي، أسبوعي، شهري، ربع سنوي، نصف سنوي، سنوي، أو بناءً على ساعات التشغيل والقراءات.' },
        { en: 'Automatic work-order generation with a configurable lead time (e.g., 2 days before the due date).', ar: 'إنشاء تلقائي لأمر العمل قبل تاريخ الاستحقاق بمهلة قابلة للإعداد (مثل يومين).' },
        { en: 'Compliance tracking — every schedule shows completions, overdue count, and a rolling compliance percentage.', ar: 'تتبع الالتزام — يُظهر كل جدول عدد التنفيذ والمتأخرات ونسبة التزام متجدّدة.' },
        { en: 'Pause and resume schedules for seasonal equipment, retired assets, or site shutdowns.', ar: 'إيقاف مؤقت واستئناف للجداول الموسمية أو الأصول المتقاعدة أو الإغلاقات.' },
        { en: 'Detailed task checklists per schedule — every step the technician must complete and confirm in the field.', ar: 'قوائم تحقق تفصيلية لكل جدول — كل خطوة يجب على الفني إكمالها وتأكيدها ميدانيًا.' },
        { en: 'Asset history — every PM ever performed against the asset, in one timeline.', ar: 'سجل الأصل — كل صيانة وقائية نُفِّذَت على الأصل في خط زمني واحد.' },
        { en: 'Document attachments — manufacturer manuals, MSDS sheets, SOPs available offline on the technician’s phone.', ar: 'مرفقات الوثائق — كتيبات الصانع وصحائف السلامة المادية وإجراءات التشغيل القياسية، متاحة دون اتصال على هاتف الفنّي.' },
        { en: 'Pre-notification rules — auto-alert the zone manager, occupants, or vendors before disruptive work.', ar: 'قواعد الإبلاغ المسبق — تنبيه آلي لمدير المنطقة أو الشاغلين أو الموردين قبل الأعمال التي تُسبّب اضطرابًا.' },
        { en: 'SLA-friendly metadata — priority, lead time, generation type (manual or automatic), last-modified audit.', ar: 'بيانات تعريف صديقة لاتفاقيات مستوى الخدمة: الأولوية، مهلة الإنشاء، نوع الإنشاء (يدوي أو تلقائي)، تدقيق آخر تعديل.' },
      ]}
      audience={{
        en: 'PM planners, reliability engineers, HSE managers, compliance officers, and any operator subject to insurance, regulatory, or warranty-driven maintenance obligations.',
        ar: 'مخططو الصيانة الوقائية، ومهندسو الموثوقية، ومديرو الصحة والسلامة والبيئة، ومسؤولو الامتثال، وأي مشغّل تخضع منشآته لالتزامات صيانة مفروضة من شركات التأمين أو الجهات التنظيمية أو الضمانات.',
      }}
    />
  )
}
