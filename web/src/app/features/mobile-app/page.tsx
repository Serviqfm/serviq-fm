import FeaturePage from '@/components/FeaturePage'

export const metadata = { title: 'Mobile App' }

export default function MobileFeaturePage() {
  return (
    <FeaturePage
      eyebrow={{ en: 'Mobile App', ar: 'تطبيق الهاتف' }}
      title={{ en: 'Built for the field, not the conference room.', ar: 'مُصمَّم للميدان، لا لقاعة الاجتماعات.' }}
      description="The entire technician workflow in one place: today’s work orders, asset history, safety manuals, and a QR scanner that opens a job in under a second."
      image={{ src: '/features/mobile-app.png', alt: 'Technician dashboard — mobile app' }}
      marketing={{
        en: 'The ServiqFM mobile app puts the entire technician workflow in one place: today’s work orders, asset history, safety manuals, and a QR scanner that opens a job in under a second. Works in Arabic or English, with push notifications so urgent jobs never get missed.',
        ar: 'يضع تطبيق ServiqFM للهاتف سير عمل الفنّي كاملًا في مكان واحد: أوامر اليوم، وسجل الأصل، وكتيبات السلامة، وماسح QR يفتح المهمة في أقل من ثانية. يعمل بالعربية أو الإنجليزية، مع إشعارات فورية تضمن ألا تفوّت أي مهمة عاجلة.',
      }}
      capabilities={[
        { en: 'Personal daily dashboard with task counts, greeting, and live priority queue.', ar: 'لوحة شخصية يومية بعدد المهام وتحية وقائمة الأولويات الحيّة.' },
        { en: 'One-tap "Start Work" that timestamps the technician’s arrival on the work order.', ar: 'زر "ابدأ العمل" بنقرة واحدة يسجّل وقت وصول الفنّي على أمر العمل.' },
        { en: 'QR scanning — point the camera at an asset or space label to instantly open the matching record.', ar: 'مسح QR — وجِّه الكاميرا نحو وسم الأصل أو المساحة لفتح السجل المطابق فورًا.' },
        { en: 'Offline mode — work orders cached locally so technicians can complete jobs in basements, plant rooms, and no-signal zones; data syncs when back online.', ar: 'وضع عدم الاتصال — تُخزَّن الأوامر محليًا لإنجازها في الأقبية وغرف المعدّات ومناطق ضعف الإشارة، وتُزامن البيانات عند عودة الاتصال.' },
        { en: 'Photo, voice, and signature capture directly into the work order from the device camera and microphone.', ar: 'التقاط الصور والملاحظات الصوتية والتواقيع مباشرة في أمر العمل من كاميرا الجهاز والميكروفون.' },
        { en: 'Push notifications for new assignments, urgent escalations, and PM due dates.', ar: 'إشعارات فورية للمهام الجديدة والتصعيدات العاجلة وتواريخ استحقاق الصيانة الوقائية.' },
        { en: 'Quick Resources — pinned safety manuals, support desk hotline, and the technician’s assigned assets.', ar: 'موارد سريعة — كتيبات سلامة مثبّتة، هاتف الدعم، والأصول المخصصة للفنّي.' },
        { en: 'Bilingual UI — Arabic with full RTL layout, or English LTR, switchable per user.', ar: 'واجهة ثنائية اللغة — عربي بترتيب RTL كامل أو إنجليزي LTR، يمكن تبديلها لكل مستخدم.' },
        { en: 'Native iOS and Android apps via Expo SDK 54.', ar: 'تطبيقات iOS وAndroid أصلية عبر Expo SDK 54.' },
      ]}
      audience={{
        en: 'HVAC technicians, electricians, plumbers, fire-safety inspectors, janitorial leads, and any field worker who needs to receive, execute, and close work orders without going back to a desk.',
        ar: 'فنيو التكييف والكهرباء والسباكة ومفتشو السلامة من الحريق ومشرفو النظافة وكل عامل ميداني يحتاج لتلقي أوامر العمل وتنفيذها وإغلاقها دون العودة إلى المكتب.',
      }}
    />
  )
}
