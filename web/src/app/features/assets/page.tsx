import FeaturePage from '@/components/FeaturePage'

export const metadata = { title: 'Asset Management' }

export default function AssetsFeaturePage() {
  return (
    <FeaturePage
      eyebrow={{ en: 'Asset Management', ar: 'إدارة الأصول' }}
      title={{ en: 'Know exactly what you own — and how it’s performing.', ar: 'اعرِف بدقّة ما تمتلك — وكيف يعمل.' }}
      description="A living asset registry. Every chiller, switchgear, booster pump, elevator motor, and fire panel — categorized, photographed, located, and one click away."
      image={{ src: '/features/assets.png', alt: 'Asset Inventory — Serviq Lumina' }}
      marketing={{
        en: 'ServiqFM turns the spreadsheet you’ve been keeping for years into a living asset registry. Every chiller, switchgear, booster pump, elevator motor, and fire panel — categorized, photographed, located, and one click away.',
        ar: 'تُحوّل ServiqFM جدول الإكسل الذي احتفظت به طويلًا إلى سجل أصول حيّ. كل مبرّد، ولوحة كهرباء، ومضخة معزِّزة، ومحرّك مصعد، ولوحة حريق — مصنَّفة، ومصوَّرة، ومحدَّدة الموقع، وعلى بُعد نقرة واحدة.',
      }}
      capabilities={[
        { en: 'Hierarchical asset structure — site → building → floor → space → asset, with parent-child relationships for systems and sub-components.', ar: 'هيكل هرمي للأصول من الموقع إلى المبنى إلى الطابق إلى المساحة إلى الأصل.' },
        { en: 'Rich asset records — make, model, serial number, install date, warranty expiry, supplier, service contracts, attached manuals (PDF).', ar: 'سجلات أصول غنية تشمل الصنع والموديل والرقم التسلسلي وتاريخ التركيب وانتهاء الضمان والمورد والعقود والكتيّبات.' },
        { en: 'QR codes for every asset — print, stick on the equipment, technicians scan to open the record on mobile.', ar: 'رمز QR لكل أصل تُطبع وتُلصق على المعدّة ويفتحها الفنيون بمسحها.' },
        { en: 'Status tracking — Active, Under Maintenance, Retired / Decommissioned with full history.', ar: 'تتبع حالات الأصل: نشط، تحت الصيانة، متقاعد، مع سجل كامل.' },
        { en: 'Filter & search by category, site, status, manufacturer, age, criticality.', ar: 'تصفية وبحث حسب الفئة والموقع والحالة والصانع والعمر والأهمية.' },
        { en: 'Bulk import from spreadsheet for fast onboarding of large estates.', ar: 'استيراد مجمَّع من جدول لتسريع تأهيل المحافظ الكبيرة.' },
        { en: 'IoT-ready — optional smart monitoring connects sensors (temperature, vibration, runtime) directly to the asset record.', ar: 'جاهز لإنترنت الأشياء — يربط المستشعرات (حرارة، اهتزاز، وقت تشغيل) مباشرة بسجل الأصل.' },
        { en: 'Lifecycle reporting — depreciation, MTTR, MTBF, cost-per-asset.', ar: 'تقارير دورة الحياة: الاستهلاك، متوسط زمن الإصلاح، متوسط زمن بين الأعطال، التكلفة لكل أصل.' },
      ]}
      audience={{
        en: 'Asset managers, finance teams running CapEx/OpEx planning, auditors verifying physical assets, and FM directors making replace-vs-repair decisions.',
        ar: 'مديرو الأصول وفِرَق المالية المعنية بتخطيط النفقات الرأسمالية والتشغيلية، والمدققون الذين يتحقّقون من الأصول الفعلية، ومديرو إدارة المرافق الذين يقررون بين الاستبدال والإصلاح.',
      }}
    />
  )
}
