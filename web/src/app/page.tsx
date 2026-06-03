'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'

const navy = '#1E2D4E'
const teal = '#6DCFB0'
const mid  = '#3AAECC'
const blue = '#1A7FC1'
const grad = 'linear-gradient(90deg, #6DCFB0 0%, #3AAECC 50%, #1A7FC1 100%)'
const grad135 = 'linear-gradient(135deg, #6DCFB0 0%, #3AAECC 50%, #1A7FC1 100%)'
const offwhite = '#F8FAFC'
const border = '#E8ECF0'
const text2 = '#4A5568'
const muted = '#A0B0BF'
const en = "'DM Sans', sans-serif"
const ar = "'Readex Pro', sans-serif"

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [daysLeft, setDaysLeft] = useState<number | string>('—')
  const [industry, setIndustry] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [wlName, setWlName] = useState('')
  const [wlCompany, setWlCompany] = useState('')
  const [wlEmail, setWlEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    const launch = new Date('2025-08-01T00:00:00+03:00')
    const now = new Date()
    const diff = Math.max(0, Math.ceil((launch.getTime() - now.getTime()) / 86400000))
    setDaysLeft(diff > 0 ? diff : '🚀')
  }, [])

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible')
          obs.unobserve(entry.target)
        }
      })
    }, { threshold: 0.1 })
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault()
    if (!wlName || !wlEmail) return
    setSubmitting(true)
    await new Promise(r => setTimeout(r, 800))
    setSubmitted(true)
    setSubmitting(false)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Readex+Pro:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { font-family: ${en}; color: ${navy}; background: #fff; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
        a { text-decoration: none; color: inherit; }
        .reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease, transform 0.6s ease; }
        .reveal.visible { opacity: 1; transform: translateY(0); }
        .grad-text { background: ${grad}; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .nav-links a:hover { color: ${navy} !important; background: ${offwhite} !important; }
        .problem-card:hover, .feature-card:hover, .vertical-card:hover, .why-card:hover { box-shadow: 0 4px 24px rgba(30,45,78,0.10); transform: translateY(-2px); }
        .feature-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background:${grad}; opacity:0; transition:opacity 0.2s; }
        .feature-card:hover::before { opacity:1; }
        .pricing-btn:hover { opacity: 0.88; }
        .industry-btn { background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.18); color:rgba(255,255,255,0.7); font-size:13px; font-weight:500; font-family:${en}; padding:7px 16px; border-radius:999px; cursor:pointer; transition:all 0.15s; }
        .industry-btn:hover { background:rgba(255,255,255,0.14); color:#fff; }
        .industry-btn.selected { background:rgba(109,207,176,0.2); border-color:rgba(109,207,176,0.5); color:#fff; }
        @keyframes fadeInDown { from{opacity:0;transform:translateY(-16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeInUp   { from{opacity:0;transform:translateY(20px)}  to{opacity:1;transform:translateY(0)} }
        .hero-badge { animation: fadeInDown 0.6s ease both; }
        .hero-ar    { animation: fadeInUp 0.7s ease 0.1s both; }
        .hero-en    { animation: fadeInUp 0.7s ease 0.2s both; }
        .hero-btns  { animation: fadeInUp 0.7s ease 0.3s both; }
        .hero-stats { animation: fadeInUp 0.7s ease 0.4s both; }
        @media (max-width:1024px) {
          .problem-grid  { grid-template-columns: repeat(2,1fr) !important; }
          .verticals-grid { grid-template-columns: repeat(2,1fr) !important; }
          .footer-grid   { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width:768px) {
          .hero-ar-text { font-size: 32px !important; }
          .section-title-el { font-size: 28px !important; }
          .features-grid  { grid-template-columns: 1fr !important; }
          .pricing-grid   { grid-template-columns: 1fr !important; }
          .pricing-featured { transform: scale(1) !important; }
          .why-grid       { grid-template-columns: 1fr !important; }
          .nav-links-wrap, .nav-cta-wrap { display: none !important; }
          .hamburger { display: flex !important; }
          .footer-grid { grid-template-columns: 1fr !important; }
          .footer-bottom { flex-direction: column !important; text-align: center !important; }
        }
        @media (max-width:480px) {
          .problem-grid   { grid-template-columns: 1fr !important; }
          .verticals-grid { grid-template-columns: 1fr !important; }
          .hero-stats-wrap { flex-direction: column !important; gap: 24px !important; }
          .hero-stat { border-right: none !important; border-bottom: 1px solid rgba(255,255,255,0.08) !important; padding: 16px 0 !important; }
          .hero-stat:last-child { border-bottom: none !important; }
          .waitlist-name-row { grid-template-columns: 1fr !important; }
        }
        @media (max-width:600px) {
          .waitlist-name-row { grid-template-columns: 1fr !important; }
          .cta-form-box { padding: 24px 20px !important; }
        }
      `}</style>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div style={{ position:'fixed', inset:0, background:'#fff', zIndex:200, display:'flex', flexDirection:'column', padding:24 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:40 }}>
            <Logo href="/" size={140} />
            <button onClick={() => setMenuOpen(false)} style={{ fontSize:28, cursor:'pointer', color:navy, background:'none', border:'none', lineHeight:1 }}>×</button>
          </div>
          <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:4, flex:1 }}>
            {[['#features','Features','المزايا'],['#verticals','Industries','القطاعات'],['/about','About','عن الشركة'],['#waitlist','Join Waitlist','قائمة الانتظار']].map(([href,en_,ar_]) => (
              <li key={href}>
                <a href={href} onClick={() => setMenuOpen(false)} style={{ display:'block', fontSize:18, fontWeight:500, color:navy, padding:'14px 0', borderBottom:`1px solid ${border}` }}>
                  {en_} <span style={{ fontFamily:ar, fontSize:13, color:muted }}>/ {ar_}</span>
                </a>
              </li>
            ))}
          </ul>
          <div style={{ marginTop:32 }}>
            <a href="#waitlist" onClick={() => setMenuOpen(false)}
              style={{ display:'block', textAlign:'center', background:grad, color:'#fff', padding:'14px', borderRadius:8, fontWeight:700, fontSize:15, fontFamily:en }}>
              انضم لقائمة الانتظار — Join Waitlist
            </a>
          </div>
        </div>
      )}

      {/* NAV */}
      <nav style={{ position:'sticky', top:0, zIndex:100, background:'rgba(255,255,255,0.95)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', borderBottom:`1px solid ${border}`, boxShadow:'0 1px 8px rgba(30,45,78,0.06)' }}>
        <div style={{ maxWidth:1140, margin:'0 auto', padding:'0 24px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:68 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <Logo href="/" size={150} />
              <span style={{ fontFamily:ar, fontSize:13, fontWeight:600, color:muted }}>سيرفيك</span>
            </div>
            <ul className="nav-links-wrap" style={{ display:'flex', alignItems:'center', gap:4, listStyle:'none' }}>
              {[['#features','Features'],['#verticals','Industries'],['/about','About']].map(([href,label]) => (
                <li key={href}>
                  <a href={href} className="nav-links" style={{ fontSize:14, fontWeight:500, color:text2, padding:'7px 14px', borderRadius:6, transition:'color 0.15s, background 0.15s', display:'block' }}>{label}</a>
                </li>
              ))}
            </ul>
            <div className="nav-cta-wrap" style={{ display:'flex', alignItems:'center', gap:10 }}>
              <Link href="/login/employee" style={{ fontSize:14, fontWeight:500, color:navy, padding:'7px 14px', borderRadius:6 }}>Sign in</Link>
              <a href="#waitlist" style={{ display:'inline-flex', alignItems:'center', gap:8, background:grad, color:'#fff', padding:'9px 20px', borderRadius:8, fontFamily:en, fontSize:14, fontWeight:600, cursor:'pointer', border:'none' }}>
                🚀 Coming Soon — 1 Aug 2025
              </a>
            </div>
            {/* Hamburger */}
            <button className="hamburger" onClick={() => setMenuOpen(true)}
              style={{ display:'none', flexDirection:'column', gap:5, cursor:'pointer', padding:4, background:'none', border:'none' }}>
              {[0,1,2].map(i => <span key={i} style={{ width:24, height:2, background:navy, borderRadius:2, display:'block' }}/>)}
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ background:navy, padding:'96px 0 112px', position:'relative', overflow:'hidden', textAlign:'center' }}>
        {/* Glow blobs */}
        <div style={{ position:'absolute', top:-160, right:-160, width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, rgba(109,207,176,0.13) 0%, transparent 65%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:-120, left:-120, width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, rgba(26,127,193,0.12) 0%, transparent 65%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(109,207,176,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(109,207,176,0.04) 1px, transparent 1px)', backgroundSize:'48px 48px', pointerEvents:'none' }}/>
        <div style={{ maxWidth:1140, margin:'0 auto', padding:'0 24px', position:'relative', zIndex:1 }}>
          <div style={{ maxWidth:780, margin:'0 auto' }}>
            <div className="hero-badge" style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(109,207,176,0.12)', border:'1px solid rgba(109,207,176,0.28)', color:teal, fontSize:12, fontWeight:600, letterSpacing:'0.06em', padding:'6px 18px', borderRadius:999, marginBottom:36 }}>
              🇸🇦 &nbsp; Made for Saudi Arabia &nbsp;·&nbsp; مصنوع للمملكة العربية السعودية
            </div>
            <div className="hero-ar hero-ar-text" style={{ fontFamily:ar, fontSize:48, fontWeight:700, lineHeight:1.45, color:'#fff', marginBottom:8, direction:'rtl' }}>
              إدارة المرافق<br/><span className="grad-text">بشكل أذكى وأسرع</span>
            </div>
            <div className="hero-en" style={{ fontFamily:en, fontSize:19, fontWeight:400, color:'rgba(255,255,255,0.55)', marginBottom:36, lineHeight:1.65 }}>
              The bilingual facility management platform built for Saudi Arabia.<br/>
              Arabic-first. Mobile-first. Priced in SAR.
            </div>
            <div className="hero-btns" style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap', marginBottom:72 }}>
              <a href="#waitlist" style={{ display:'inline-flex', alignItems:'center', gap:8, background:grad, color:'#fff', padding:'13px 28px', borderRadius:8, fontFamily:en, fontSize:15, fontWeight:600, cursor:'pointer', border:'none' }}>
                انضم لقائمة الانتظار — Join the Waitlist →
              </a>
              <a href="#waitlist" style={{ display:'inline-flex', alignItems:'center', gap:8, background:'transparent', color:'#fff', border:'1.5px solid rgba(255,255,255,0.45)', padding:'13px 28px', borderRadius:8, fontFamily:en, fontSize:15, fontWeight:600 }}>
                Launching 1 August 2025
              </a>
            </div>
            <div style={{ width:1, height:40, background:'rgba(255,255,255,0.12)', margin:'0 auto 48px' }}/>
            <div className="hero-stats hero-stats-wrap" style={{ display:'flex', gap:0, justifyContent:'center', flexWrap:'wrap' }}>
              {[
                [String(daysLeft), 'Days to Launch'],
                ['1–3',   'Days to Go Live'],
                ['70%',   'Cheaper than other apps'],
                ['100%',  'Arabic + English'],
              ].map(([num, label]) => (
                <div key={label} className="hero-stat" style={{ padding:'0 40px', borderRight:'1px solid rgba(255,255,255,0.10)', textAlign:'center' }}>
                  <div style={{ fontSize:30, fontWeight:700, background:grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', lineHeight:1, marginBottom:6 }}>{num}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', fontWeight:400 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TRUST BAR */}
      <div style={{ background:'#E8F7F3', borderBottom:'1px solid rgba(109,207,176,0.2)', padding:'20px 0' }}>
        <div style={{ maxWidth:1140, margin:'0 auto', padding:'0 24px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:36, flexWrap:'wrap' }}>
            {['No credit card required','ZATCA VAT-compliant invoicing','MADA & STC Pay supported','Full RTL Arabic interface','PDPL data privacy compliant'].map(item => (
              <div key={item} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:500, color:navy }}>
                <div style={{ width:20, height:20, borderRadius:'50%', background:grad, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DASHBOARD PREVIEW */}
      <section style={{ padding:'88px 0', background:'#fff' }}>
        <div style={{ maxWidth:1140, margin:'0 auto', padding:'0 24px' }}>
          <div className="reveal" style={{ textAlign:'center', marginBottom:48 }}>
            <span style={{ display:'inline-block', fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:mid, marginBottom:14 }}>Inside ServIQ-FM — داخل المنصة</span>
            <h2 className="section-title-el" style={{ fontSize:38, fontWeight:700, color:navy, lineHeight:1.2, marginBottom:16 }}>One dashboard for every facility</h2>
            <p style={{ fontSize:17, color:text2, lineHeight:1.7, maxWidth:640, margin:'0 auto' }}>
              Live KPIs across work orders, assets, PM compliance and spend. A single screen — built for managers who run the whole operation.
            </p>
          </div>
          <div className="reveal" style={{ borderRadius:18, overflow:'hidden', boxShadow:'0 24px 80px rgba(30,45,78,0.18), 0 0 0 1px rgba(30,45,78,0.04)', border:`1px solid ${border}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/dashboard-overview.png" alt="ServIQ-FM dashboard overview" style={{ display:'block', width:'100%', height:'auto' }} />
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section style={{ background:offwhite, padding:'88px 0' }}>
        <div style={{ maxWidth:1140, margin:'0 auto', padding:'0 24px' }}>
          <div className="reveal" style={{ textAlign:'center', marginBottom:56 }}>
            <span style={{ display:'inline-block', fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:mid, marginBottom:14 }}>The Problem — المشكلة</span>
            <h2 className="section-title-el" style={{ fontSize:38, fontWeight:700, color:navy, lineHeight:1.2, marginBottom:16 }}>Managing facilities without a system<br/>is costing you time and money</h2>
            <p style={{ fontSize:17, color:text2, lineHeight:1.7, maxWidth:560, margin:'0 auto' }}>Most Saudi facilities still run on WhatsApp groups, paper forms, and spreadsheets. Things fall through the cracks every day.</p>
          </div>
          <div className="problem-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:20 }}>
            {[
              { icon:'📱', ar:'طلبات مبعثرة على واتساب', en:'Work requests lost in WhatsApp', text:'Maintenance requests arrive across multiple chats with no tracking, no priority, and no accountability. Jobs get forgotten.' },
              { icon:'🔧', ar:'أعطال متكررة بلا صيانة وقائية', en:'Repeated breakdowns, no PM plan', text:'Without preventive maintenance schedules, assets fail unexpectedly — costing far more to fix and disrupting daily operations.' },
              { icon:'📋', ar:'لا توثيق، لا مساءلة', en:'No records, no accountability', text:'No audit trail means disputes with contractors, no proof of completed work, and zero visibility for management or auditors.' },
              { icon:'💸', ar:'أنظمة دولية بأسعار مبالغ فيها', en:'International tools are overpriced', text:'Other apps cost SAR 40,000–150,000/yr and aren\'t built for Arabic-speaking teams or Saudi compliance.' },
            ].map(card => (
              <div key={card.en} className="problem-card reveal" style={{ background:'#fff', border:`1px solid ${border}`, borderRadius:12, padding:'28px 24px', transition:'box-shadow 0.2s, transform 0.2s' }}>
                <div style={{ width:44, height:44, borderRadius:10, background:'#E8F7F3', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16, fontSize:20 }}>{card.icon}</div>
                <div style={{ fontFamily:ar, fontSize:14, fontWeight:700, color:mid, direction:'rtl', marginBottom:4 }}>{card.ar}</div>
                <div style={{ fontSize:15, fontWeight:600, color:navy, marginBottom:10 }}>{card.en}</div>
                <div style={{ fontSize:13, color:text2, lineHeight:1.65 }}>{card.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding:'88px 0', background:'#fff' }}>
        <div style={{ maxWidth:1140, margin:'0 auto', padding:'0 24px' }}>
          <div className="reveal" style={{ textAlign:'center', marginBottom:56 }}>
            <span style={{ display:'inline-block', fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:mid, marginBottom:14 }}>Core Features — المزايا الأساسية</span>
            <h2 className="section-title-el" style={{ fontSize:38, fontWeight:700, color:navy, lineHeight:1.2, marginBottom:16 }}>Everything your team needs.<br/>Nothing you don&apos;t.</h2>
            <p style={{ fontSize:17, color:text2, lineHeight:1.7, maxWidth:560, margin:'0 auto' }}>Four powerful modules designed for field technicians, managers, and operations directors across Saudi Arabia.</p>
          </div>
          <div className="features-grid" style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:24 }}>
            {[
              {
                href: '/features/work-orders',
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="#3AAECC" strokeWidth="2" strokeLinecap="round"/><path d="M9 12l2 2 4-4" stroke="#6DCFB0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
                title:'Work Order Management', titleAr:'إدارة أوامر العمل',
                text:'Create, assign, and track work orders with SLA countdown timers, priority levels, photo proof of completion, digital sign-off, and full audit trail — in Arabic and English.',
                tags:['SLA Timers','Photo Proof','Digital Sign-off','Audit Trail','Priority Levels'],
              },
              {
                href: '/features/assets',
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="#3AAECC" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="#6DCFB0" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="#6DCFB0" strokeWidth="2"/><path d="M14 17.5h7M17.5 14v7" stroke="#3AAECC" strokeWidth="2" strokeLinecap="round"/></svg>,
                title:'Asset Management', titleAr:'إدارة الأصول',
                text:'Maintain a complete asset registry with QR code and NFC scanning, warranty tracking, lifecycle history, cost of ownership, and location mapping across all your sites.',
                tags:['QR Code Scanning','NFC Tags','Warranty Tracking','Multi-site'],
              },
              {
                href: '/features/preventive-maintenance',
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#3AAECC" strokeWidth="2"/><path d="M12 7v5l3 3" stroke="#6DCFB0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
                title:'Preventive Maintenance', titleAr:'الصيانة الوقائية',
                text:'Schedule recurring PM tasks, auto-generate work orders, track PM compliance percentage, and stop costly breakdowns before they happen with smart scheduling.',
                tags:['Recurring Schedules','PM Compliance %','Auto-generate Tasks','MTTR / MTBF'],
              },
              {
                href: '/features/mobile-app',
                icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="5" y="2" width="14" height="20" rx="2" stroke="#3AAECC" strokeWidth="2"/><path d="M9 7h6M9 11h6M9 15h4" stroke="#6DCFB0" strokeWidth="2" strokeLinecap="round"/></svg>,
                title:'Mobile Technician App', titleAr:'تطبيق الفني المتنقل',
                text:'iOS and Android app built for field use. Works offline, GPS check-in, camera for photo uploads, push notifications on new assignments, and built-in QR scanner.',
                tags:['Offline-capable','GPS Check-in','Push Notifications','iOS & Android'],
              },
            ].map(card => (
              <Link key={card.title} href={card.href} className="feature-card reveal" style={{ display:'block', textDecoration:'none', color:'inherit', border:`1px solid ${border}`, borderRadius:12, padding:'36px 32px', position:'relative', overflow:'hidden', transition:'box-shadow 0.2s, transform 0.2s' }}>
                <div style={{ width:52, height:52, borderRadius:12, background:'#E8F7F3', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20 }}>{card.icon}</div>
                <div style={{ fontSize:19, fontWeight:700, color:navy, marginBottom:4 }}>{card.title}</div>
                <div style={{ fontFamily:ar, fontSize:14, fontWeight:600, color:mid, direction:'rtl', marginBottom:14 }}>{card.titleAr}</div>
                <div style={{ fontSize:14, color:text2, lineHeight:1.75, marginBottom:20 }}>{card.text}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16 }}>
                  {card.tags.map(t => <span key={t} style={{ background:offwhite, border:`1px solid ${border}`, color:text2, fontSize:11, fontWeight:500, padding:'4px 10px', borderRadius:999 }}>{t}</span>)}
                </div>
                <div style={{ fontSize:13, fontWeight:600, color:blue }}>Learn more →</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* VERTICALS */}
      <section id="verticals" style={{ background:navy, padding:'88px 0' }}>
        <div style={{ maxWidth:1140, margin:'0 auto', padding:'0 24px' }}>
          <div className="reveal" style={{ textAlign:'center', marginBottom:56 }}>
            <span style={{ display:'inline-block', fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:teal, marginBottom:14 }}>Built For Your Industry — مصنوع لقطاعك</span>
            <h2 className="section-title-el" style={{ fontSize:38, fontWeight:700, color:'#fff', lineHeight:1.2, marginBottom:16 }}>Vertical-specific templates,<br/>ready from day one</h2>
            <p style={{ fontSize:17, color:'rgba(255,255,255,0.55)', lineHeight:1.7, maxWidth:560, margin:'0 auto' }}>Pre-configured checklists, PM schedules, and workflows for your exact industry — not a generic tool you have to build from scratch.</p>
          </div>
          <div className="verticals-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:20 }}>
            {[
              { emoji:'🏫', title:'Schools', titleAr:'المدارس', text:'Private and international schools managing multi-building campuses.', features:['AC service checklists','Fire safety inspection forms','Classroom equipment register','Contractor access portal'] },
              { emoji:'🏬', title:'Retail Chains', titleAr:'سلاسل التجزئة', text:'Multi-branch chains needing cross-site visibility and compliance.', features:['Multi-branch dashboard','Refrigeration PM templates','Store opening checklists','Brand compliance audits'] },
              { emoji:'🏘️', title:'Housing Compounds', titleAr:'المجمعات السكنية', text:'Gated communities and residential complexes with resident portals.', features:['Resident request portal','Pool & gym PM templates','Unit handover checklists','Owner maintenance reports'] },
              { emoji:'🏨', title:'Local Hotels', titleAr:'الفنادق المحلية', text:'2–4 star hotels and aparthotels needing fast, trackable maintenance.', features:['Room maintenance logs','Elevator & HVAC PM','Preventive room inspections','Guest complaint automation'] },
            ].map(v => (
              <div key={v.title} className="vertical-card reveal" style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.09)', borderRadius:12, padding:'32px 26px', transition:'background 0.2s, border-color 0.2s, transform 0.2s' }}>
                <div style={{ fontSize:34, marginBottom:18 }}>{v.emoji}</div>
                <div style={{ fontSize:17, fontWeight:700, color:'#fff', marginBottom:4 }}>{v.title}</div>
                <div style={{ fontFamily:ar, fontSize:14, fontWeight:600, color:teal, direction:'rtl', marginBottom:14 }}>{v.titleAr}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', lineHeight:1.65, marginBottom:16 }}>{v.text}</div>
                <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:6 }}>
                  {v.features.map(f => (
                    <li key={f} style={{ fontSize:12, color:'rgba(255,255,255,0.4)', paddingLeft:14, position:'relative' }}>
                      <span style={{ position:'absolute', left:0, color:teal }}>›</span>{f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY SERVIQ */}
      <section style={{ padding:'88px 0', background:'#fff' }}>
        <div style={{ maxWidth:1140, margin:'0 auto', padding:'0 24px' }}>
          <div className="reveal" style={{ textAlign:'center', marginBottom:0 }}>
            <span style={{ display:'inline-block', fontSize:11, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:mid, marginBottom:14 }}>Why Serviq FM — لماذا سيرفيك</span>
            <h2 className="section-title-el" style={{ fontSize:38, fontWeight:700, color:navy, lineHeight:1.2 }}>Built different.<br/>Priced fairly.</h2>
          </div>
          <div className="why-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24, marginTop:56 }}>
            {[
              { num:'01', title:'Arabic-First Platform', titleAr:'منصة عربية أولاً', text:'Full RTL support, Arabic PDF reports, Arabic push notifications, and Arabic email alerts — not an afterthought, built in from day one.' },
              { num:'02', title:'70–90% Cheaper', titleAr:'أرخص بـ 70–90%', text:'Other apps start at SAR 40,000/yr. Serviq FM starts at SAR 2,000/yr. Same power, a fraction of the cost, no enterprise sales process.' },
              { num:'03', title:'Live in 1–3 Days', titleAr:'جاهز في 1–3 أيام', text:'No 6-month implementation. No consultants. Sign up, add your assets, invite your team, and you\'re live — in days, not months.' },
              { num:'04', title:'Saudi Payment Methods', titleAr:'طرق الدفع السعودية', text:'Pay by MADA, STC Pay, Visa, or Mastercard. ZATCA-compliant VAT invoices issued automatically at 15% for every subscription.' },
              { num:'05', title:'Mobile-First Design', titleAr:'تصميم للجوال أولاً', text:'Designed for technicians working in the field, not office managers at a desk. Works offline. Fast. Simple. No training required.' },
              { num:'06', title:'PDPL & ZATCA Compliant', titleAr:'متوافق مع نظام البيانات وزاتكا', text:'Built for Saudi Arabia\'s regulatory environment. PDPL data privacy compliance, ZATCA Phase 2 e-invoicing, row-level data isolation.' },
            ].map(w => (
              <div key={w.num} className="why-card reveal" style={{ padding:'28px 24px', borderRadius:12, background:offwhite, border:`1px solid ${border}` }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.12em', color:mid, marginBottom:10 }}>{w.num}</div>
                <div style={{ fontSize:16, fontWeight:700, color:navy, marginBottom:4 }}>{w.title}</div>
                <div style={{ fontFamily:ar, fontSize:13, color:muted, direction:'rtl', marginBottom:10 }}>{w.titleAr}</div>
                <div style={{ fontSize:13, color:text2, lineHeight:1.65 }}>{w.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WAITLIST CTA */}
      <section id="waitlist" style={{ background:grad135, padding:'100px 0', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize:'40px 40px', pointerEvents:'none' }}/>
        <div style={{ maxWidth:1140, margin:'0 auto', padding:'0 24px', position:'relative', zIndex:1 }}>
          <div style={{ maxWidth:640, margin:'0 auto' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)', color:'#fff', fontSize:12, fontWeight:700, letterSpacing:'0.08em', padding:'6px 18px', borderRadius:999, marginBottom:28 }}>
              🚀 &nbsp; LAUNCHING 1 AUGUST 2025
            </div>
            <div style={{ fontFamily:ar, fontSize:36, fontWeight:700, color:'#fff', direction:'rtl', lineHeight:1.5, marginBottom:10 }}>
              كن من أوائل المستخدمين<br/>لسيرفيك FM
            </div>
            <div style={{ fontSize:19, fontWeight:400, color:'rgba(255,255,255,0.75)', marginBottom:12 }}>Be first to access Serviq FM</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.50)', marginBottom:40 }}>Join the waitlist — get early access, a 3-month discount, and priority onboarding.</div>

            <div className="cta-form-box" style={{ background:'rgba(255,255,255,0.10)', border:'1px solid rgba(255,255,255,0.18)', borderRadius:16, padding:'36px 32px', textAlign:'left' }}>
              {submitted ? (
                <div style={{ textAlign:'center', padding:'24px 0' }}>
                  <div style={{ fontSize:48, marginBottom:16 }}>🎉</div>
                  <div style={{ fontFamily:ar, fontSize:20, fontWeight:700, color:'#fff', direction:'rtl', marginBottom:8 }}>شكراً لانضمامك!</div>
                  <div style={{ fontSize:18, fontWeight:700, color:'#fff', marginBottom:12 }}>You&apos;re on the list!</div>
                  <div style={{ fontSize:14, color:'rgba(255,255,255,0.65)', lineHeight:1.7 }}>
                    We&apos;ll email you at launch on <strong style={{ color:'#fff' }}>1 August 2025</strong> with your early access link and exclusive discount.<br/>
                    سنراسلك عند الإطلاق في 1 أغسطس 2025.
                  </div>
                </div>
              ) : (
                <form onSubmit={handleWaitlist}>
                  <div className="waitlist-name-row" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.6)', marginBottom:6, letterSpacing:'0.04em' }}>Full Name <span style={{ fontFamily:ar, fontSize:11, color:'rgba(255,255,255,0.35)' }}>الاسم</span></label>
                      <input type="text" value={wlName} onChange={e => setWlName(e.target.value)} placeholder="Ahmed Al-Rashidi" required
                        style={{ width:'100%', padding:'12px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.08)', color:'#fff', fontSize:14, fontFamily:en, outline:'none', boxSizing:'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.6)', marginBottom:6, letterSpacing:'0.04em' }}>Company <span style={{ fontFamily:ar, fontSize:11, color:'rgba(255,255,255,0.35)' }}>الشركة</span></label>
                      <input type="text" value={wlCompany} onChange={e => setWlCompany(e.target.value)} placeholder="Al Noor School"
                        style={{ width:'100%', padding:'12px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.08)', color:'#fff', fontSize:14, fontFamily:en, outline:'none', boxSizing:'border-box' }} />
                    </div>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label style={{ display:'block', fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.6)', marginBottom:6, letterSpacing:'0.04em' }}>Work Email <span style={{ fontFamily:ar, fontSize:11, color:'rgba(255,255,255,0.35)' }}>البريد الإلكتروني</span></label>
                    <input type="email" value={wlEmail} onChange={e => setWlEmail(e.target.value)} placeholder="ahmed@company.com" required
                      style={{ width:'100%', padding:'12px 14px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.08)', color:'#fff', fontSize:14, fontFamily:en, outline:'none', boxSizing:'border-box' }} />
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <label style={{ display:'block', fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.6)', marginBottom:8, letterSpacing:'0.04em' }}>Industry <span style={{ fontFamily:ar, fontSize:11, color:'rgba(255,255,255,0.35)' }}>القطاع</span></label>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                      {[['Schools','🏫'],['Retail','🏬'],['Compounds','🏘️'],['Hotels','🏨'],['Other','🏢']].map(([val, emoji]) => (
                        <button key={val} type="button" onClick={() => setIndustry(val)}
                          className={`industry-btn${industry === val ? ' selected' : ''}`}>
                          {emoji} {val}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="submit" disabled={submitting}
                    style={{ width:'100%', padding:14, background:'#fff', color:navy, border:'none', borderRadius:8, fontSize:15, fontWeight:700, fontFamily:en, cursor:'pointer', transition:'all 0.18s', opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? 'Joining...' : 'Join the Waitlist — انضم لقائمة الانتظار →'}
                  </button>
                  <p style={{ fontSize:12, color:'rgba(255,255,255,0.35)', textAlign:'center', marginTop:14 }}>
                    No spam. Unsubscribe anytime. · لا رسائل مزعجة. إلغاء الاشتراك في أي وقت.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background:navy, padding:'60px 0 28px', color:'rgba(255,255,255,0.55)' }}>
        <div style={{ maxWidth:1140, margin:'0 auto', padding:'0 24px' }}>
          <div className="footer-grid" style={{ display:'grid', gridTemplateColumns:'1.8fr 1fr 1fr 1.2fr', gap:40, marginBottom:48 }}>
            <div>
              <div style={{ marginBottom:8 }}>
                <Logo variant="white" size={140} />
              </div>
              <div style={{ fontFamily:ar, fontSize:13, color:'rgba(255,255,255,0.45)', direction:'rtl', marginBottom:4 }}>منصة إدارة المرافق الذكية</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginBottom:20, lineHeight:1.6 }}>The smart facility management platform<br/>built for Saudi Arabia.</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {['🇸🇦 Saudi-Built','ZATCA Compliant','PDPL Compliant'].map(b => (
                  <span key={b} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', fontSize:11, fontWeight:500, padding:'4px 12px', borderRadius:999, color:'rgba(255,255,255,0.6)' }}>{b}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(255,255,255,0.35)', marginBottom:20 }}>Product</div>
              <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:10 }}>
                {[['/features/work-orders','Work Orders','أوامر العمل'],['/features/assets','Asset Management','الأصول'],['/features/preventive-maintenance','Preventive Maintenance','الصيانة الوقائية'],['/features/mobile-app','Mobile App','التطبيق']].map(([href,label,ar_]) => (
                  <li key={label}><a href={href} style={{ fontSize:13, color:'rgba(255,255,255,0.5)', transition:'color 0.15s' }}>{label} <span style={{ fontFamily:ar, fontSize:11, color:'rgba(255,255,255,0.28)' }}>{ar_}</span></a></li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(255,255,255,0.35)', marginBottom:20 }}>Company</div>
              <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:10 }}>
                {[['/about','About','عن الشركة'],['mailto:admin@serviqfm.com','Contact','تواصل معنا'],['/privacy-policy','Privacy Policy','سياسة الخصوصية'],['/terms-of-service','Terms of Service','الشروط والأحكام']].map(([href,label,ar_]) => (
                  <li key={label}><a href={href} style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>{label} <span style={{ fontFamily:ar, fontSize:11, color:'rgba(255,255,255,0.28)' }}>{ar_}</span></a></li>
                ))}
              </ul>
              <div style={{ marginTop:24 }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(255,255,255,0.35)', marginBottom:12 }}>Portal Access</div>
                <Link href="/login/client" style={{ display:'block', fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:6 }}>Client Login → دخول العميل</Link>
                <Link href="/login/employee" style={{ display:'block', fontSize:13, color:'rgba(255,255,255,0.5)' }}>Employee Login → دخول الموظف</Link>
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(255,255,255,0.35)', marginBottom:20 }}>Contact</div>
              {[
                ['📧', 'admin@serviqfm.com', 'mailto:admin@serviqfm.com'],
                ['💬', 'WhatsApp Business\n+966 58 11 44 604', 'https://wa.me/966581144604'],
                ['📍', 'Jeddah, Saudi Arabia\nجدة، المملكة العربية السعودية', null],
              ].map(([icon, text, href]) => (
                <div key={icon as string} style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:16 }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{icon}</div>
                  {href ? (
                    <a href={href as string} style={{ fontSize:13, color:'rgba(255,255,255,0.5)', lineHeight:1.6, whiteSpace:'pre-line' }}>{text}</a>
                  ) : (
                    <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', lineHeight:1.6, whiteSpace:'pre-line' }}>{text}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:24, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.3)' }}>© 2026 Serviq FM. All rights reserved. جميع الحقوق محفوظة.</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.25)', textAlign:'right', lineHeight:1.7 }}>
              PDPL Compliant · ZATCA E-Invoicing Phase 2 Compliant
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
