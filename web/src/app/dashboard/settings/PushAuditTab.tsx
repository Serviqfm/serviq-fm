'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useLanguage } from '@/context/LanguageContext';
import { C, cardStyle, labelStyle, primaryBtn, dangerBtn, sectionCard, tableHeaderCell, tableCell } from '@/lib/brand';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PushAuditTab() {
  const { isRTL } = useLanguage();
  const [sendingTest, setSendingTest] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deliveryLog, setDeliveryLog] = useState<any[]>([]);

  useEffect(() => {
    loadDeliveryLog();
  }, []);

  async function loadDeliveryLog() {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('notification_log')
        .select('*')
        .eq('user_id', user.user.id)
        .eq('channel', 'push')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setDeliveryLog(data || []);
    } catch (error) {
      console.error('Error loading delivery log:', error);
    }
  }

  async function sendTestPush() {
    setSendingTest(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const response = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.user.id,
          title: 'Test Notification',
          body: 'This is a test push notification from ServIQ-FM',
          data: { test: 'true' },
        }),
      });

      const result = await response.json();

      if (response.ok && result.sent > 0) {
        setMessage({ type: 'success', text: `Test push sent to ${result.sent} device(s)` });
        setTimeout(() => {
          loadDeliveryLog();
          setMessage(null);
        }, 2000);
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to send test push',
        });
      }
    } catch (error) {
      console.error('Error sending test push:', error);
      setMessage({ type: 'error', text: 'Error sending test push' });
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <div style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <h3 style={{ ...labelStyle, marginBottom: '1.5rem', fontSize: '18px' }}>
        Push Notifications Audit
      </h3>

      {message && (
        <div
          style={{
            ...cardStyle,
            marginBottom: '1rem',
            padding: '1rem',
            background: message.type === 'success' ? '#DCFCE7' : '#FEE2E2',
            borderColor: message.type === 'success' ? '#86EFAC' : '#FECACA',
            color: message.type === 'success' ? '#16A34A' : '#DC2626',
          }}
        >
          {message.text}
        </div>
      )}

      <div style={sectionCard}>
        <h4 style={{ ...labelStyle, marginBottom: '1rem' }}>Send Test Push</h4>
        <p style={{ fontSize: '14px', color: C.textMid, marginBottom: '1rem' }}>
          Send a test notification to verify push is working on your devices.
        </p>
        <button
          onClick={sendTestPush}
          disabled={sendingTest}
          style={{
            ...primaryBtn,
            opacity: sendingTest ? 0.7 : 1,
            cursor: sendingTest ? 'not-allowed' : 'pointer',
          }}
        >
          {sendingTest ? 'Sending...' : 'Send Test Push'}
        </button>
      </div>

      <div style={sectionCard}>
        <h4 style={{ ...labelStyle, marginBottom: '1rem' }}>Recent Push Delivery Log</h4>
        {deliveryLog.length === 0 ? (
          <p style={{ fontSize: '14px', color: C.textMid }}>No push notifications sent yet</p>
        ) : (
          <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                  <th style={tableHeaderCell}>Type</th>
                  <th style={tableHeaderCell}>Status</th>
                  <th style={tableHeaderCell}>Time</th>
                </tr>
              </thead>
              <tbody>
                {deliveryLog.map((log, idx) => (
                  <tr key={idx} style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
                    <td style={tableCell}>{log.type_key}</td>
                    <td style={tableCell}>
                      <span
                        style={{
                          background: log.status === 'sent' ? '#DCFCE7' : '#FEE2E2',
                          color: log.status === 'sent' ? '#16A34A' : '#DC2626',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '4px',
                          fontSize: '12px',
                        }}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td style={tableCell}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
