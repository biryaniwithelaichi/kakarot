import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import type { AppSettings } from '@shared/types';
import { Calendar } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { toast } from '../stores/toastStore';
import salesforceLogo from '../assets/salesforce logo.png';
import hubspotLogo from '../assets/hubspotlogo.png';
import { SlackIntegration } from './SlackIntegration';

export default function SettingsView() {
  const { settings, setSettings } = useAppStore();
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<'google' | 'outlook' | 'icloud' | null>(null);
  const [connectingCRM, setConnectingCRM] = useState<'salesforce' | 'hubspot' | null>(null);
  const [connectedCalendars, setConnectedCalendars] = useState<{
    google: boolean;
    outlook: boolean;
    icloud: boolean;
  }>({
    google: false,
    outlook: false,
    icloud: false,
  });
  const [connectedCRMs, setConnectedCRMs] = useState<{
    salesforce: boolean;
    hubspot: boolean;
  }>({
    salesforce: false,
    hubspot: false,
  });
  const [googleCalendars, setGoogleCalendars] = useState<Array<{ id: string; name: string }>>([]);
  const [visibleGoogleIds, setVisibleGoogleIds] = useState<string[]>([]);
  const [disconnectConfirm, setDisconnectConfirm] = useState<{
    isOpen: boolean;
    type: 'calendar' | 'crm' | null;
    provider: string | null;
    label: string;
  }>({ isOpen: false, type: null, provider: null, label: '' });

  useEffect(() => {
    if (settings) {
      setLocalSettings({ ...settings });
      setConnectedCalendars({
        google: !!settings.calendarConnections?.google,
        outlook: !!settings.calendarConnections?.outlook,
        icloud: !!settings.calendarConnections?.icloud,
      });
      setConnectedCRMs({
        salesforce: !!settings.crmConnections?.salesforce,
        hubspot: !!settings.crmConnections?.hubspot,
      });
      setVisibleGoogleIds(settings.visibleCalendars?.google || []);
    }
  }, [settings]);

  // Check for unsaved changes
  useEffect(() => {
    if (settings && localSettings) {
      const hasChanges = JSON.stringify(settings) !== JSON.stringify(localSettings);
      setHasUnsavedChanges(hasChanges);
    }
  }, [settings, localSettings]);

  useEffect(() => {
    async function loadCalendars() {
      try {
        if (connectedCalendars.google) {
          const list = await window.kakarot.calendar.listCalendars('google');
          setGoogleCalendars(list);
        } else {
          setGoogleCalendars([]);
        }
      } catch (err) {
        console.warn('Failed to load calendars', err);
      }
    }
    loadCalendars();
  }, [connectedCalendars.google]);

  const handleChange = (key: keyof AppSettings, value: string | boolean) => {
    if (!localSettings) return;
    setLocalSettings({ ...localSettings, [key]: value });
  };

  const providerLabels: Record<'google' | 'outlook' | 'icloud', string> = {
    google: 'Google Calendar',
    outlook: 'Outlook Calendar',
    icloud: 'iCloud Calendar',
  };

  const handleConnectCalendar = async (provider: 'google' | 'outlook' | 'icloud') => {
    if (!localSettings) return;

    setConnectingProvider(provider);

    try {
      let payload: { appleId: string; appPassword: string } | undefined;
      if (provider === 'icloud') {
        const appleId = prompt('Enter your Apple ID email for iCloud Calendar:');
        const appPassword = prompt('Enter your iCloud app-specific password:');
        if (!appleId || !appPassword) {
          throw new Error('Apple ID and app-specific password are required');
        }
        payload = { appleId, appPassword };
      }

      const connections = await window.kakarot.calendar.connect(provider, payload);
      const nextSettings = { ...localSettings, calendarConnections: connections };
      setLocalSettings(nextSettings);
      setSettings(nextSettings);
      setConnectedCalendars({
        google: !!connections.google,
        outlook: !!connections.outlook,
        icloud: !!connections.icloud,
      });
      toast.success(`${providerLabels[provider]} connected`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to connect ${providerLabels[provider]}: ${message}`);
    } finally {
      setConnectingProvider(null);
    }
  };

  const showDisconnectConfirm = (type: 'calendar' | 'crm', provider: string, label: string) => {
    setDisconnectConfirm({ isOpen: true, type, provider, label });
  };

  const handleDisconnectCalendar = async (provider: 'google' | 'outlook' | 'icloud') => {
    if (!localSettings) return;
    setConnectingProvider(provider);

    try {
      const connections = await window.kakarot.calendar.disconnect(provider);
      const nextSettings = { ...localSettings, calendarConnections: connections };
      setLocalSettings(nextSettings);
      setSettings(nextSettings);
      setConnectedCalendars({
        google: !!connections.google,
        outlook: !!connections.outlook,
        icloud: !!connections.icloud,
      });
      toast.success(`${providerLabels[provider]} disconnected`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to disconnect ${providerLabels[provider]}: ${message}`);
    } finally {
      setConnectingProvider(null);
    }
  };

  const confirmDisconnect = async () => {
    const { type, provider } = disconnectConfirm;
    setDisconnectConfirm({ isOpen: false, type: null, provider: null, label: '' });

    if (type === 'calendar' && provider) {
      await handleDisconnectCalendar(provider as 'google' | 'outlook' | 'icloud');
    } else if (type === 'crm' && provider) {
      await handleDisconnectCRM(provider as 'salesforce' | 'hubspot');
    }
  };

  const handleSave = async () => {
    if (!localSettings) return;

    setIsSaving(true);

    try {
      await window.kakarot.settings.update(localSettings);
      setSettings(localSettings);
      setHasUnsavedChanges(false);
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectCRM = async (provider: 'salesforce' | 'hubspot') => {
    if (!localSettings) return;

    setConnectingCRM(provider);

    try {
      const result = await window.kakarot.crm?.connect(provider);
      if (result) {
        const nextConnections = {
          ...(localSettings.crmConnections || {}),
          [provider]: result,
        };
        const nextSettings = { ...localSettings, crmConnections: nextConnections };
        setLocalSettings(nextSettings);
        setSettings(nextSettings);
        setConnectedCRMs({
          ...connectedCRMs,
          [provider]: true,
        });
        toast.success(`${provider.charAt(0).toUpperCase() + provider.slice(1)} connected`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to connect ${provider}: ${message}`);
    } finally {
      setConnectingCRM(null);
    }
  };

  const handleDisconnectCRM = async (provider: 'salesforce' | 'hubspot') => {
    if (!localSettings) return;

    setConnectingCRM(provider);

    try {
      await window.kakarot.crm?.disconnect(provider);
      const nextConnections = { ...(localSettings.crmConnections || {}) };
      delete nextConnections[provider];
      const nextSettings = { ...localSettings, crmConnections: nextConnections };
      setLocalSettings(nextSettings);
      setSettings(nextSettings);
      setConnectedCRMs({
        ...connectedCRMs,
        [provider]: false,
      });
      toast.success(`${provider.charAt(0).toUpperCase() + provider.slice(1)} disconnected`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to disconnect ${provider}: ${message}`);
    } finally {
      setConnectingCRM(null);
    }
  };

  if (!localSettings) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <div>
          <h1 className="text-3xl font-display text-[#F0EBE3]">Settings</h1>
          <p className="text-[#5C5750] text-sm mt-1">
            Configure your preferences and integrations
          </p>
        </div>

        {/* UI Preferences */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-white border-b border-[#2A2A2A] pb-2">
            General
          </h2>

          <div className="space-y-3">
            {/* Live Meeting Indicator */}
            <div className="flex items-start justify-between px-4 py-3 rounded-lg border border-[#2A2A2A] bg-[#1E1E1E]">
              <div className="flex-1 pr-4">
                <h3 className="text-sm font-medium text-white mb-1">
                  Show the live meeting indicator
                </h3>
                <p className="text-xs text-slate-400">
                  The meeting indicator sits on the right of your screen, and shows when you're transcribing
                </p>
              </div>
              <ToggleSwitch
                enabled={localSettings.showLiveMeetingIndicator ?? true}
                onChange={(enabled) => handleChange('showLiveMeetingIndicator', enabled)}
              />
            </div>

            {/* Open on Login */}
            <div className="flex items-start justify-between px-4 py-3 rounded-lg border border-[#2A2A2A] bg-[#1E1E1E]">
              <div className="flex-1 pr-4">
                <h3 className="text-sm font-medium text-white mb-1">
                  Open Treeto when you log in
                </h3>
                <p className="text-xs text-slate-400">
                  Treeto will open automatically when you log in
                </p>
              </div>
              <ToggleSwitch
                enabled={localSettings.openOnLogin ?? false}
                onChange={async (enabled) => {
                  handleChange('openOnLogin', enabled);
                  try {
                    await window.kakarot.settings.setLoginItem(enabled);
                  } catch (err) {
                    console.error('Failed to set login item:', err);
                  }
                }}
              />
            </div>
          </div>
        </section>

        {/* Transcription */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-white border-b border-[#2A2A2A] pb-2">
            Transcription
          </h2>

          <div>
            <label className="block text-sm text-slate-300 mb-2">Language</label>
            <select
              value={localSettings.transcriptionLanguage}
              onChange={(e) => handleChange('transcriptionLanguage', e.target.value)}
              className="w-full bg-[#1E1E1E] border border-[#2A2A2A] text-[#F0EBE3] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C17F3E]/30 focus:border-[#C17F3E]/20"
            >
              <option value="auto">Auto-detect</option>
              <optgroup label="Common Languages">
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
                <option value="zh">Chinese (Mandarin)</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                <option value="hi">Hindi</option>
                <option value="ar">Arabic</option>
                <option value="ru">Russian</option>
              </optgroup>
              <optgroup label="European Languages">
                <option value="nl">Dutch</option>
                <option value="pl">Polish</option>
                <option value="tr">Turkish</option>
                <option value="sv">Swedish</option>
                <option value="da">Danish</option>
                <option value="fi">Finnish</option>
                <option value="no">Norwegian</option>
                <option value="cs">Czech</option>
                <option value="el">Greek</option>
                <option value="hu">Hungarian</option>
                <option value="ro">Romanian</option>
                <option value="uk">Ukrainian</option>
              </optgroup>
              <optgroup label="Asian Languages">
                <option value="th">Thai</option>
                <option value="vi">Vietnamese</option>
                <option value="id">Indonesian</option>
                <option value="ms">Malay</option>
                <option value="tl">Tagalog</option>
              </optgroup>
              <optgroup label="Other Languages">
                <option value="he">Hebrew</option>
                <option value="bn">Bengali</option>
                <option value="ta">Tamil</option>
                <option value="te">Telugu</option>
                <option value="mr">Marathi</option>
                <option value="gu">Gujarati</option>
              </optgroup>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Language availability depends on transcription provider
            </p>
          </div>
        </section>

        {/* Calendar Integrations */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-white border-b border-[#2A2A2A] pb-2">
            Calendar Integrations
          </h2>
          <p className="text-sm text-slate-400">
            Connect your calendars to automatically prepare for upcoming meetings
          </p>

          <div className="space-y-3">
            <CalendarConnectionButton
              provider="google"
              label="Google Calendar"
              isConnected={connectedCalendars.google}
              isLoading={connectingProvider === 'google'}
              onConnect={() => handleConnectCalendar('google')}
              onDisconnect={() => showDisconnectConfirm('calendar', 'google', 'Google Calendar')}
              icon={<Calendar className="w-5 h-5 text-slate-400" />}
            />
            <CalendarConnectionButton
              provider="outlook"
              label="Outlook Calendar"
              isConnected={connectedCalendars.outlook}
              isLoading={connectingProvider === 'outlook'}
              onConnect={() => handleConnectCalendar('outlook')}
              onDisconnect={() => showDisconnectConfirm('calendar', 'outlook', 'Outlook Calendar')}
              icon={<Calendar className="w-5 h-5 text-slate-400" />}
            />
          </div>
        </section>

        {/* Visible Calendars */}
        {connectedCalendars.google && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium text-white border-b border-[#2A2A2A] pb-2">
              Visible Calendars
            </h2>
            <div className="space-y-2">
              {googleCalendars.length === 0 && (
                <p className="text-sm text-slate-400">No calendars found</p>
              )}
              {googleCalendars.map((cal) => {
                const enabled = visibleGoogleIds.includes(cal.id);
                return (
                  <div key={cal.id} className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#2A2A2A] bg-[#1E1E1E]">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-sm bg-[#F0EBE3]" />
                      <p className="text-sm text-white">{cal.name}</p>
                    </div>
                    <ToggleSwitch
                      enabled={enabled}
                      onChange={(on) => {
                        const next = on
                          ? Array.from(new Set([...visibleGoogleIds, cal.id]))
                          : visibleGoogleIds.filter((id) => id !== cal.id);
                        setVisibleGoogleIds(next);
                        const nextSettings = { ...localSettings!, visibleCalendars: { ...(localSettings!.visibleCalendars || {}), google: next } };
                        setLocalSettings(nextSettings);
                        // Update visible calendars - settings change event will trigger automatic refresh
                        window.kakarot.calendar.setVisibleCalendars('google', next).catch(() => {});
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Slack Integration */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-white border-b border-[#2A2A2A] pb-2">
            Slack Integration
          </h2>
          <p className="text-sm text-slate-400">
            Connect Slack to send notes directly to channels.
          </p>
          <SlackIntegration showTitle={false} />
        </section>

        {/* CRM Integrations */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium text-white border-b border-[#2A2A2A] pb-2">
            CRM Integrations
          </h2>
          <p className="text-sm text-slate-400">
            Connect your CRM to automatically push meeting notes to contact records.
          </p>

          <div className="space-y-3">
            {/* Salesforce */}
            <button
              onClick={() =>
                connectedCRMs.salesforce
                  ? handleDisconnectCRM('salesforce')
                  : handleConnectCRM('salesforce')
              }
              disabled={connectingCRM === 'salesforce'}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${
                connectedCRMs.salesforce
                  ? 'border-[#F0EBE3]/50 bg-[#F0EBE3]/10'
                  : 'border-[#2A2A2A] bg-[#1E1E1E] hover:border-[#2A2A2A]'
              }`}
            >
              <div className="flex items-center gap-3">
                <img src={salesforceLogo} alt="Salesforce" className="w-5 h-5 object-contain" />
                <div className="text-left">
                  <p className="text-sm font-medium text-white">
                    {connectedCRMs.salesforce ? 'Salesforce Connected' : 'Connect Salesforce'}
                  </p>
                  {connectedCRMs.salesforce && (
                    <p className="text-xs text-slate-500">Notes will be synced to contact records</p>
                  )}
                </div>
              </div>
              {connectedCRMs.salesforce ? (
                <span className="text-sm text-[#F0EBE3]">
                  {connectingCRM === 'salesforce' ? 'Disconnecting...' : 'Disconnect'}
                </span>
              ) : (
                <span className="text-sm text-primary-400">
                  {connectingCRM === 'salesforce' ? 'Connecting...' : '+ Connect'}
                </span>
              )}
            </button>

            {/* HubSpot */}
            <button
              onClick={() =>
                connectedCRMs.hubspot
                  ? handleDisconnectCRM('hubspot')
                  : handleConnectCRM('hubspot')
              }
              disabled={connectingCRM === 'hubspot'}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${
                connectedCRMs.hubspot
                  ? 'border-[#F0EBE3]/50 bg-[#F0EBE3]/10'
                  : 'border-[#2A2A2A] bg-[#1E1E1E] hover:border-[#2A2A2A]'
              }`}
            >
              <div className="flex items-center gap-3">
                <img src={hubspotLogo} alt="HubSpot" className="w-5 h-5 object-contain" />
                <div className="text-left">
                  <p className="text-sm font-medium text-white">
                    {connectedCRMs.hubspot ? 'HubSpot Connected' : 'Connect HubSpot'}
                  </p>
                  {connectedCRMs.hubspot && (
                    <p className="text-xs text-slate-500">Notes will be synced to contact records</p>
                  )}
                </div>
              </div>
              {connectedCRMs.hubspot ? (
                <span className="text-sm text-[#F0EBE3]">
                  {connectingCRM === 'hubspot' ? 'Disconnecting...' : 'Disconnect'}
                </span>
              ) : (
                <span className="text-sm text-primary-400">
                  {connectingCRM === 'hubspot' ? 'Connecting...' : '+ Connect'}
                </span>
              )}
            </button>
          </div>

          {/* CRM Notes Behavior */}
          {(connectedCRMs.salesforce || connectedCRMs.hubspot) && (
            <div>
              <label className="block text-sm text-slate-300 mb-3">
                When sending notes to CRM
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[#2A2A2A] bg-[#1E1E1E] cursor-pointer hover:border-[#2A2A2A] transition">
                  <input
                    type="radio"
                    name="crmNotes"
                    value="always"
                    checked={localSettings?.crmNotesBehavior === 'always' || localSettings?.crmNotesBehavior === undefined}
                    onChange={(e) => handleChange('crmNotesBehavior', e.target.value as any)}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">Send All Notes Automatically</p>
                    <p className="text-xs text-slate-500">Notes are always pushed to participant records</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[#2A2A2A] bg-[#1E1E1E] cursor-pointer hover:border-[#2A2A2A] transition">
                  <input
                    type="radio"
                    name="crmNotes"
                    value="ask"
                    checked={localSettings?.crmNotesBehavior === 'ask'}
                    onChange={(e) => handleChange('crmNotesBehavior', e.target.value as any)}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">Ask Before Sending</p>
                    <p className="text-xs text-slate-500">You'll be prompted after each meeting</p>
                  </div>
                </label>
              </div>
            </div>
          )}
        </section>

        {/* Save button - now floating */}
      </div>

      {/* Floating Save Button - Only shown when there are changes */}
      {hasUnsavedChanges && (
        <div className="fixed bottom-8 right-8 z-50">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-3 bg-[#C17F3E] hover:bg-[#D4923F] disabled:opacity-50 text-[#0C0C0C] rounded-xl font-medium transition-all shadow-copper-soft hover:shadow-copper-glow"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={disconnectConfirm.isOpen}
        title={`Disconnect ${disconnectConfirm.label}`}
        message={`Are you sure you want to disconnect ${disconnectConfirm.label}? You'll need to reconnect to sync events again.`}
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={confirmDisconnect}
        onCancel={() => setDisconnectConfirm({ isOpen: false, type: null, provider: null, label: '' })}
      />
    </div>
  );
}

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

function ToggleSwitch({ enabled, onChange }: ToggleSwitchProps) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        enabled ? 'bg-[#C17F3E]' : 'bg-[#2A2A2A]'
      }`}
    >
      <div
        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

type CalendarProvider = 'google' | 'outlook' | 'icloud';

interface CalendarConnectionButtonProps {
  provider: CalendarProvider;
  label: string;
  isConnected: boolean;
  isLoading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  icon: React.ReactNode;
}

function CalendarConnectionButton({
  provider,
  label,
  isConnected,
  isLoading,
  onConnect,
  onDisconnect,
  icon,
}: CalendarConnectionButtonProps) {
  const handleClick = () => {
    if (isConnected) {
      onDisconnect();
    } else {
      onConnect();
    }
  };

  const getActionLabel = (): string => {
    if (isConnected) {
      return isLoading ? 'Disconnecting...' : 'Disconnect';
    }
    return isLoading ? 'Connecting...' : '+ Connect';
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${
        isConnected
          ? 'border-[#F0EBE3]/50 bg-[#F0EBE3]/10'
          : 'border-[#2A2A2A] bg-[#1E1E1E] hover:border-[#2A2A2A]'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div className="text-left">
          <p className="text-sm font-medium text-white">
            {isConnected ? `${label} Connected` : `Connect Your ${label}`}
          </p>
          {isConnected && (
            <p className="text-xs text-slate-500">Syncing your {provider.charAt(0).toUpperCase() + provider.slice(1)} events</p>
          )}
        </div>
      </div>
      <span className={`text-sm ${isConnected ? 'text-[#F0EBE3]' : 'text-[#C17F3E]'}`}>
        {getActionLabel()}
      </span>
    </button>
  );
}
