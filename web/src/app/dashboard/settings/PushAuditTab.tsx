'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/context/LanguageContext';

interface DeliveryLogEntry {
  type_key: string;
  status: string;
  created_at: string;
}

export default function PushAuditTab() {
  const { isRTL } = useLanguage();
  const supabase = createClient();
  const [sendingTest, setSendingTest] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deliveryLog, setDeliveryLog] = useState<DeliveryLogEntry[]>([]);

  useEffect(() => {
    loadDeliveryLog();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <h3 className="text-lg font-bold text-on-surface mb-6">
        Push Notifications Audit
      </h3>

      {message && (
        <div
          className={`rounded-[12px] border px-4 py-4 mb-4 text-sm ${
            message.type === 'success'
              ? 'bg-primary/10 border-primary/20 text-primary'
              : 'bg-error/10 border-error/20 text-error'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 mb-6">
        <h4 className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-4">
          Send Test Push
        </h4>
        <p className="text-sm text-on-surface-variant mb-4">
          Send a test notification to verify push is working on your devices.
        </p>
        <button
          onClick={sendTestPush}
          disabled={sendingTest}
          className={`bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors${sendingTest ? ' opacity-70 cursor-not-allowed' : ''}`}
        >
          {sendingTest ? 'Sending...' : 'Send Test Push'}
        </button>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
        <h4 className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-4">
          Recent Push Delivery Log
        </h4>
        {deliveryLog.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No push notifications sent yet</p>
        ) : (
          <div className="border border-outline-variant rounded-[12px] overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Type</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Status</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Time</th>
                </tr>
              </thead>
              <tbody>
                {deliveryLog.map((log, idx) => (
                  <tr key={idx} className="bg-surface-container-lowest border-b border-outline-variant">
                    <td className="px-4 py-3 text-sm text-on-surface">{log.type_key}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-3 py-0.5 rounded text-xs font-medium ${
                          log.status === 'sent'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-error/10 text-error'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">
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
