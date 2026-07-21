'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useLanguage } from '@/context/LanguageContext';
import { NOTIFICATION_TYPES, getAllCategories, getDefaultPreferences, isEmitted } from '@/lib/notificationTypes';

export default function NotificationsTab() {
  const { isRTL } = useLanguage();
  const supabase = createClient();
  const [preferences, setPreferences] = useState<Record<string, boolean>>(getDefaultPreferences());
  // CORE-11: '' = follow app default (en), 'en' | 'ar' = explicit per-user override.
  const [notifLang, setNotifLang] = useState<'' | 'en' | 'ar'>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadPreferences();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

      const { data: profile } = await supabase
        .from('users')
        .select('notification_language')
        .eq('id', user.user.id)
        .maybeSingle();
      const lang = (profile as { notification_language?: string | null } | null)?.notification_language;
      setNotifLang(lang === 'en' || lang === 'ar' ? lang : '');
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

      // CORE-11: column-scoped RPC (w5-6-notif-language.sql) — sets only the
      // caller's own users.notification_language. '' clears the override → NULL.
      const { error: langErr } = await supabase.rpc('set_notification_language', { lang: notifLang });
      if (langErr) throw langErr;

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
    return <div className="text-on-surface-variant text-sm">Loading...</div>;
  }

  return (
    <div style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <h3 className="text-lg font-bold text-on-surface mb-6">
        Notification Preferences
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
          Notification Language
        </h4>
        <p className="text-sm text-on-surface-variant mb-3">
          Language used for the emails and alerts we send you.
        </p>
        <select
          value={notifLang}
          onChange={e => setNotifLang(e.target.value as '' | 'en' | 'ar')}
          className="bg-surface-container border border-outline-variant rounded-xl px-3 py-2 text-sm text-on-surface"
        >
          <option value="">App default (English)</option>
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </select>
      </div>

      {categories.map(category => {
        const categoryTypes = Object.values(NOTIFICATION_TYPES).filter(
          t => t.category === category && isEmitted(t)
        );
        if (categoryTypes.length === 0) return null; // 1C-29: skip categories with only dead toggles
        const categoryLabel = category
          .replace(/_/g, ' ')
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        return (
          <div key={category} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 mb-6">
            <h4 className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-4">
              {categoryLabel}
            </h4>

            {categoryTypes.map(type => (
              <div
                key={type.key}
                className="flex items-start mb-4 gap-3"
                style={{ direction: isRTL ? 'rtl' : 'ltr' }}
              >
                <input
                  type="checkbox"
                  id={type.key}
                  checked={preferences[type.key] !== false}
                  onChange={() => handleToggle(type.key)}
                  className="mt-0.5 cursor-pointer accent-primary"
                />
                <label
                  htmlFor={type.key}
                  className="flex-1 cursor-pointer text-sm text-on-surface leading-snug"
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
        className={`bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors${saving ? ' opacity-70 cursor-not-allowed' : ''}`}
      >
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>
    </div>
  );
}
