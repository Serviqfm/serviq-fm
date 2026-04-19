// ServiqFM Brand Design System — NativeWind / React Native Theme
// Fonts: DM Sans (EN) · Readex Pro (AR)
// Palette: teal #6DCFB0 → teal-blue #3AAECC → blue #1A7FC1
// Version: 2.0 | 2026

// ─── Font Loading (Expo) ──────────────────────────────────────────────────
// In app/_layout.tsx:
//
// import { useFonts } from 'expo-font';
// const [fontsLoaded] = useFonts({
//   'DMSans-Regular':       require('./assets/fonts/DMSans-Regular.ttf'),
//   'DMSans-Medium':        require('./assets/fonts/DMSans-Medium.ttf'),
//   'DMSans-SemiBold':      require('./assets/fonts/DMSans-SemiBold.ttf'),
//   'ReadexPro-Light':      require('./assets/fonts/ReadexPro-Light.ttf'),
//   'ReadexPro-Regular':    require('./assets/fonts/ReadexPro-Regular.ttf'),
//   'ReadexPro-Medium':     require('./assets/fonts/ReadexPro-Medium.ttf'),
//   'ReadexPro-SemiBold':   require('./assets/fonts/ReadexPro-SemiBold.ttf'),
//   'ReadexPro-Bold':       require('./assets/fonts/ReadexPro-Bold.ttf'),
// });

import { StyleSheet } from 'react-native';

// ─── Colour Tokens ────────────────────────────────────────────────────────
export const colors = {
  brand: {
    navy:        '#1E2D4E',
    navyLight:   '#E8ECF2',
    teal:        '#6DCFB0',
    tealMid:     '#3AAECC',
    tealLight:   '#B8DDD8',
    tealBg:      '#E8F7F3',
    blue:        '#1A7FC1',
    blueLight:   '#E6F1FB',
    muted:       '#A0B0BF',
    offwhite:    '#F8FAFC',
    white:       '#FFFFFF',
  },
  status: {
    success:       '#22C997',
    successLight:  '#E8F7F3',
    successText:   '#0F6E56',
    warning:       '#F5A623',
    warningLight:  '#FFF4E0',
    warningText:   '#854F0B',
    danger:        '#E24B4A',
    dangerLight:   '#FCEBEB',
    dangerText:    '#A32D2D',
    info:          '#1A7FC1',
    infoLight:     '#E6F1FB',
    infoText:      '#185FA5',
    neutral:       '#A0B0BF',
    neutralLight:  '#F1F4F6',
  },
  text: {
    primary:   '#1E2D4E',
    secondary: '#4A5568',
    muted:     '#A0B0BF',
    inverse:   '#FFFFFF',
  },
  border: {
    default: '#E8ECF0',
    medium:  '#D0D8E0',
  },
  background: {
    primary:   '#FFFFFF',
    secondary: '#F8FAFC',
    tertiary:  '#F1F4F6',
  },
};

// ─── Typography ───────────────────────────────────────────────────────────
// EN weight mapping: 400 → 500 → 600
// AR weight mapping: EN-500 → AR-600 (SemiBold) | EN-600 → AR-700 (Bold)
// Readex Pro designed as unified dual-script — no optical size adjustment needed

export const typography = {
  fonts: {
    en: {
      regular:  'DMSans-Regular',
      medium:   'DMSans-Medium',
      semibold: 'DMSans-SemiBold',
    },
    ar: {
      regular:  'ReadexPro-Regular',
      medium:   'ReadexPro-Medium',
      semibold: 'ReadexPro-SemiBold',  // Use where EN uses medium (500)
      bold:     'ReadexPro-Bold',      // Use where EN uses semibold (600)
    },
  },
  scale: {
    uiLabel: { fontSize: 11, lineHeight: 15, letterSpacing: 1.0 },
    caption:  { fontSize: 12, lineHeight: 18 },
    bodySm:   { fontSize: 13, lineHeight: 20 },
    body:     { fontSize: 14, lineHeightEN: 22, lineHeightAR: 26 },
    h3:       { fontSize: 17, lineHeight: 26 },
    h2:       { fontSize: 22, lineHeight: 30 },
    h1:       { fontSize: 28, lineHeight: 36 },
    display:  { fontSize: 36, lineHeight: 44 },
  },
};

// ─── Spacing & Radius ─────────────────────────────────────────────────────
export const spacing = { xs:4, sm:8, '12':12, md:16, lg:24, xl:32, '2xl':48, '3xl':64 };
export const radius  = { input:4, btn:8, card:12, modal:16, pill:24, full:9999 };

// ─── Base Styles ──────────────────────────────────────────────────────────
export const baseStyles = StyleSheet.create({

  // Buttons
  btnPrimary:       { backgroundColor:colors.brand.navy,    borderRadius:radius.btn, paddingVertical:10, paddingHorizontal:20 },
  btnAccent:        { backgroundColor:colors.brand.teal,    borderRadius:radius.btn, paddingVertical:10, paddingHorizontal:20 },
  btnSecondary:     { backgroundColor:'transparent', borderRadius:radius.btn, borderWidth:1.5, borderColor:colors.brand.navy, paddingVertical:10, paddingHorizontal:20 },
  btnDanger:        { backgroundColor:colors.status.danger, borderRadius:radius.btn, paddingVertical:10, paddingHorizontal:20 },

  btnTextEN:        { color:'#fff', fontSize:13, fontFamily:typography.fonts.en.medium },
  btnTextAR:        { color:'#fff', fontSize:13, fontFamily:typography.fonts.ar.semibold, writingDirection:'rtl' },
  btnTextSecondaryEN: { color:colors.brand.navy, fontSize:13, fontFamily:typography.fonts.en.medium },
  btnTextSecondaryAR: { color:colors.brand.navy, fontSize:13, fontFamily:typography.fonts.ar.semibold, writingDirection:'rtl' },

  // Cards
  card:     { backgroundColor:colors.background.primary,   borderRadius:radius.card, borderWidth:0.5, borderColor:colors.border.default, padding:16 },
  statCard: { backgroundColor:colors.background.secondary, borderRadius:radius.btn, padding:14 },

  // Inputs
  input:   { borderWidth:0.5, borderColor:colors.border.medium, borderRadius:radius.input, paddingVertical:9, paddingHorizontal:12, fontSize:13, fontFamily:typography.fonts.en.regular, color:colors.text.primary, backgroundColor:colors.background.primary },
  inputAR: { borderWidth:0.5, borderColor:colors.border.medium, borderRadius:radius.input, paddingVertical:9, paddingHorizontal:12, fontSize:13, fontFamily:typography.fonts.ar.regular, color:colors.text.primary, backgroundColor:colors.background.primary, textAlign:'right', writingDirection:'rtl' },

  // Badges
  badgeTeal:   { paddingVertical:3, paddingHorizontal:10, borderRadius:radius.pill, backgroundColor:colors.status.successLight },
  badgeAmber:  { paddingVertical:3, paddingHorizontal:10, borderRadius:radius.pill, backgroundColor:colors.status.warningLight },
  badgeRed:    { paddingVertical:3, paddingHorizontal:10, borderRadius:radius.pill, backgroundColor:colors.status.dangerLight },
  badgeBlue:   { paddingVertical:3, paddingHorizontal:10, borderRadius:radius.pill, backgroundColor:colors.status.infoLight },
  badgeNavy:   { paddingVertical:3, paddingHorizontal:10, borderRadius:radius.pill, backgroundColor:colors.brand.navyLight },

  badgeTextEN: { fontSize:11, fontFamily:typography.fonts.en.medium },
  badgeTextAR: { fontSize:11, fontFamily:typography.fonts.ar.semibold, writingDirection:'rtl' },

  // Typography helpers
  bodyEN:    { fontSize:14, fontFamily:typography.fonts.en.regular,  color:colors.text.secondary, lineHeight:22 },
  bodyAR:    { fontSize:14, fontFamily:typography.fonts.ar.regular,  color:colors.text.secondary, lineHeight:26, writingDirection:'rtl', textAlign:'right' },
  captionEN: { fontSize:12, fontFamily:typography.fonts.en.regular,  color:colors.text.muted, lineHeight:18 },
  captionAR: { fontSize:12, fontFamily:typography.fonts.ar.regular,  color:colors.text.muted, lineHeight:18, writingDirection:'rtl', textAlign:'right' },
  uiLabelEN: { fontSize:11, fontFamily:typography.fonts.en.medium,   color:colors.text.muted, letterSpacing:1.0, textTransform:'uppercase' },
  uiLabelAR: { fontSize:11, fontFamily:typography.fonts.ar.semibold, color:colors.text.muted, writingDirection:'rtl', textAlign:'right' },
});
