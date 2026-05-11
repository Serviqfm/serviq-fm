'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/context/LanguageContext';
import { NOTIFICATION_TYPES, getAllCategories, getDefaultPreferences } from '@/lib/notificationTypes';
import { C, cardStyle, labelStyle, primaryBtn, sectionCard } from '@/lib/brand';

export default function NotificationsTab() {
  const { t, isRTL } = useLanguage();
  const supabase = createClient();
  const [preferences, setPreferences] = useState<Record<string, boolean>>(getDefaultPreferences());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadPreferences();
  }, []);

  async function loadPreferences() {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('preferences')
        .eq('user_id', user.user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data?.preferences) {
        setPreferences(data.preferences);
      } else {
        setPreferences(getDefaultPreferences());
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      setMessage({ type: 'error', text: 'Failed to load preferences' });
    } finally {
      setLoading(false);
    }
  }

  async function savePreferences() {
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      await supabase.from('user_notification_preferences').upsert(
        {
          user_id: user.user.id,
          preferences,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      setMessage({ type: 'success', text: 'Preferences saved successfully' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving preferences:', error);
      setMessage({ type: 'error', text: 'Failed to save preferences' });
    } finally {
      setSaving(false);
    }
  }

  const handleToggle = (typeKey: string) => {
    setPreferences(prev => ({
      ...prev,
      [typeKey]: !prev[typeKey],
    }));
  };

  const categories = getAllCategories();

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <h3 style={{ ...labelStyle, marginBottom: '1.5rem', fontSize: '18px' }}>
        Notification Preferences
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

      {categories.map(category => {
        const categoryTypes = Object.values(NOTIFICATION_TYPES).filter(t => t.category === category);
        const categoryLabel = category
          .replace(/_/g, ' ')
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        return (
          <div key={category} style={{ ...sectionCard, marginBottom: '1.5rem' }}>
            <h4 style={{ ...labelStyle, marginBottom: '1rem', fontSize: '14px', color: C.navy }}>
              {categoryLabel}
            </h4>

            {categoryTypes.map(type => (
              <div
                key={type.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  marginBottom: '1rem',
                  gap: '0.75rem',
                  direction: isRTL ? 'rtl' : 'ltr',
                }}
              >
                <input
                  type="checkbox"
                  id={type.key}
                  checked={preferences[type.key] !== false}
                  onChange={() => handleToggle(type.key)}
                  style={{
                    marginTop: '2px',
                    cursor: 'pointer',
                    accentColor: C.teal,
                  }}
                />
                <label
                  htmlFor={type.key}
                  style={{
                    flex: 1,
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: C.textDark,
                    lineHeight: '1.4',
                  }}
                >
                  {type.label}
                </label>
              </div>
            ))}
          </div>
        );
      })}

      <button
        onClick={savePreferences}
        disabled={saving}
        style={{
          ...primaryBtn,
          opacity: saving ? 0.7 : 1,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>
    </div>
  );
}
