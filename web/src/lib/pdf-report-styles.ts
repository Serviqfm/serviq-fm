import { StyleSheet } from '@react-pdf/renderer'

// Shared styles for branded report PDFs across the dashboard.
// Visual language: navy heading on white, teal accents, off-white table headers.
export const reportStyles = StyleSheet.create({
  page:            { padding: 36, fontFamily: 'Helvetica', backgroundColor: '#ffffff' },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, borderBottomWidth: 2, borderBottomColor: '#006b54', paddingBottom: 12 },
  brand:           { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#006b54' },
  brandSub:        { fontSize: 8, color: '#A0B0BF', marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
  reportTitle:     { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#1E2D4E', textAlign: 'right' },
  reportMeta:      { fontSize: 9, color: '#A0B0BF', textAlign: 'right', marginTop: 4 },
  sectionTitle:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#006b54', textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  kpiGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  kpiCard:         { width: '23%', backgroundColor: '#F8FAFC', borderLeftWidth: 3, borderLeftColor: '#006b54', padding: 10, borderRadius: 4 },
  kpiLabel:        { fontSize: 8, color: '#A0B0BF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  kpiValue:        { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#1E2D4E' },
  table:           { borderTopWidth: 1, borderTopColor: '#E8ECF0', borderLeftWidth: 1, borderLeftColor: '#E8ECF0' },
  tableHeaderRow:  { flexDirection: 'row', backgroundColor: '#F8FAFC' },
  tableHeaderCell: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#A0B0BF', textTransform: 'uppercase', letterSpacing: 0.5, padding: 6, borderBottomWidth: 1, borderBottomColor: '#E8ECF0', borderRightWidth: 1, borderRightColor: '#E8ECF0' },
  tableRow:        { flexDirection: 'row' },
  tableCell:       { fontSize: 9, color: '#1E2D4E', padding: 6, borderBottomWidth: 1, borderBottomColor: '#E8ECF0', borderRightWidth: 1, borderRightColor: '#E8ECF0' },
  badge:           { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff', backgroundColor: '#006b54', paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6, borderRadius: 8, alignSelf: 'flex-start' },
  detailRow:       { flexDirection: 'row', marginBottom: 5 },
  detailLabel:     { fontSize: 9, color: '#A0B0BF', textTransform: 'uppercase', letterSpacing: 0.5, width: 110 },
  detailValue:     { fontSize: 10, color: '#1E2D4E', flex: 1 },
  paragraph:       { fontSize: 10, color: '#1E2D4E', lineHeight: 1.5, marginBottom: 6 },
  footer:          { position: 'absolute', bottom: 18, left: 36, right: 36, borderTopWidth: 1, borderTopColor: '#E8ECF0', paddingTop: 8 },
  footerText:      { fontSize: 8, color: '#A0B0BF', textAlign: 'center' },
})

export type ReportHeaderProps = {
  orgName: string
  reportTitle: string
  generatedAt: string
}
