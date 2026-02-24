import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import type { AppSettings } from '@shared/types';
import { Calendar, X } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { toast } from '../stores/toastStore';
import salesforceLogo from '../assets/salesforce-logo.png';
import hubspotLogo from '../assets/hubspotlogo.png';
import { SlackIntegration } from './SlackIntegration';
import { SettingsSkeleton } from './Skeleton';

export default function SettingsView() {
  const { settings, setSettings } = useAppStore();
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<'google' | 'outlook' | 'icloud' | null>(null);
  const [connectingCRM, setConnectingCRM] = useState<'salesforce' | 'hubspot' | null>(null);
  const [googleCalendars, setGoogleCalendars] = useState<Array<{ id: string; name: string }>>([]);
  const [visibleGoogleIds, setVisibleGoogleIds] = useState<string[]>([]);
  const [disconnectConfirm, setDisconnectConfirm] = useState<{
    isOpen: boolean;
    type: 'calendar' | 'crm' | null;
    provider: string | null;
    label: string;
  }>({ isOpen: false, type: null, provider: null, label: '' });
  const [icloudModal, setIcloudModal] = useState<{
    isOpen: boolean;
    appleId: string;
    appPassword: string;
  }>({ isOpen: false, appleId: '', appPassword: '' });

  // Derive connection state from localSettings -- single source of truth,
  // no sync effects or regression guards needed.
  const connectedCalendars = {
    google: !!localSettings?.calendarConnections?.google,
    outlook: !!localSettings?.calendarConnections?.outlook,
    icloud: !!localSettings?.calendarConnections?.icloud,
  };
  const connectedCRMs = {
    salesforce: !!localSettings?.crmConnections?.salesforce,
    hubspot: !!localSettings?.crmConnections?.hubspot,
  };

  useEffect(() => {
    if (settings) {
      setLocalSettings({ ...settings });
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

    // iCloud needs credentials -- show modal instead of connecting directly
    if (provider === 'icloud') {
      setIcloudModal({ isOpen: true, appleId: '', appPassword: '' });
      return;
    }

    setConnectingProvider(provider);

    try {
      const connections = await window.kakarot.calendar.connect(provider);
      const nextSettings = { ...localSettings, calendarConnections: connections };
      setLocalSettings(nextSettings);
      setSettings(nextSettings);
      toast.success(`${providerLabels[provider]} connected`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to connect ${providerLabels[provider]}: ${message}`);
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleIcloudConnect = async () => {
    if (!localSettings) return;
    const { appleId, appPassword } = icloudModal;
    if (!appleId.trim() || !appPassword.trim()) {
      toast.error('Apple ID and app-specific password are required');
      return;
    }

    setIcloudModal(prev => ({ ...prev, isOpen: false }));
    setConnectingProvider('icloud');

    try {
      const connections = await window.kakarot.calendar.connect('icloud', {
        appleId: appleId.trim(),
        appPassword: appPassword.trim(),
      });
      const nextSettings = { ...localSettings, calendarConnections: connections };
      setLocalSettings(nextSettings);
      setSettings(nextSettings);
      toast.success(`${providerLabels.icloud} connected`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to connect ${providerLabels.icloud}: ${message}`);
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
      toast.success(`${provider.charAt(0).toUpperCase() + provider.slice(1)} disconnected`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to disconnect ${provider}: ${message}`);
    } finally {
      setConnectingCRM(null);
    }
  };

  if (!localSettings) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-cream">Settings</h1>
          <p className="text-dim text-sm mt-1.5">
            Configure your preferences and integrations
          </p>
        </div>

        {/* UI Preferences */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted border-b border-edge pb-2">
            General
          </h2>

          <div className="space-y-3">
            {/* Live Meeting Indicator */}
            <div className="flex items-start justify-between px-4 py-3 rounded-lg border border-edge bg-input shadow-soft">
              <div className="flex-1 pr-4">
                <h3 className="text-sm font-medium text-cream mb-1">
                  Show the live meeting indicator
                </h3>
                <p className="text-xs text-muted">
                  The meeting indicator sits on the right of your screen, and shows when you're transcribing
                </p>
              </div>
              <ToggleSwitch
                enabled={localSettings.showLiveMeetingIndicator ?? true}
                onChange={(enabled) => handleChange('showLiveMeetingIndicator', enabled)}
              />
            </div>

            {/* Open on Login */}
            <div className="flex items-start justify-between px-4 py-3 rounded-lg border border-edge bg-input shadow-soft">
              <div className="flex-1 pr-4">
                <h3 className="text-sm font-medium text-cream mb-1">
                  Open Treeto when you log in
                </h3>
                <p className="text-xs text-muted">
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
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted border-b border-edge pb-2">
            Transcription
          </h2>

          <div>
            <label className="block text-sm text-muted mb-2">Language</label>
            <select
              value={localSettings.transcriptionLanguage}
              onChange={(e) => handleChange('transcriptionLanguage', e.target.value)}
              className="w-full bg-input border border-edge text-cream rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/30"
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
            <p className="text-xs text-dim mt-1">
              Language availability depends on transcription provider
            </p>
          </div>
        </section>

        {/* Calendar Integrations */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted border-b border-edge pb-2">
            Calendar integrations
          </h2>
          <p className="text-sm text-muted">
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
              icon={<Calendar className="w-5 h-5 text-muted" />}
            />
            <CalendarConnectionButton
              provider="outlook"
              label="Outlook Calendar"
              isConnected={connectedCalendars.outlook}
              isLoading={connectingProvider === 'outlook'}
              onConnect={() => handleConnectCalendar('outlook')}
              onDisconnect={() => showDisconnectConfirm('calendar', 'outlook', 'Outlook Calendar')}
              icon={<Calendar className="w-5 h-5 text-muted" />}
            />
          </div>
        </section>

        {/* Visible Calendars */}
        {connectedCalendars.google && (
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted border-b border-edge pb-2">
              Visible calendars
            </h2>
            <div className="space-y-2">
              {googleCalendars.length === 0 && (
                <p className="text-sm text-muted">No calendars found</p>
              )}
              {googleCalendars.map((cal) => {
                const enabled = visibleGoogleIds.includes(cal.id);
                return (
                  <div key={cal.id} className="flex items-center justify-between px-4 py-3 rounded-lg border border-edge bg-input shadow-soft">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-sm bg-cream" />
                      <p className="text-sm text-cream">{cal.name}</p>
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
                        window.kakarot.calendar.setVisibleCalendars('google', next).catch((err) => {
                          console.error('Failed to update visible calendars:', err);
                          setVisibleGoogleIds(visibleGoogleIds);
                          toast.error('Failed to update calendar visibility');
                        });
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
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted border-b border-edge pb-2">
            Slack integration
          </h2>
          <p className="text-sm text-muted">
            Connect Slack to send notes directly to channels.
          </p>
          <SlackIntegration showTitle={false} />
        </section>

        {/* CRM Integrations */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted border-b border-edge pb-2">
            CRM integrations
          </h2>
          <p className="text-sm text-muted">
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
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                connectedCRMs.salesforce
                  ? 'border-cream/50 bg-cream/10'
                  : 'border-edge bg-input hover:border-edge-light'
              }`}
            >
              <div className="flex items-center gap-3">
                <img src={salesforceLogo} alt="Salesforce" className="w-5 h-5 object-contain" />
                <div className="text-left">
                  <p className="text-sm font-medium text-cream">
                    {connectedCRMs.salesforce ? 'Salesforce Connected' : 'Connect Salesforce'}
                  </p>
                  {connectedCRMs.salesforce && (
                    <p className="text-xs text-dim">Notes will be synced to contact records</p>
                  )}
                </div>
              </div>
              {connectedCRMs.salesforce ? (
                <span className="text-sm text-cream">
                  {connectingCRM === 'salesforce' ? 'Disconnecting...' : 'Disconnect'}
                </span>
              ) : (
                <span className="text-sm text-accent">
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
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
                connectedCRMs.hubspot
                  ? 'border-cream/50 bg-cream/10'
                  : 'border-edge bg-input hover:border-edge-light'
              }`}
            >
              <div className="flex items-center gap-3">
                <img src={hubspotLogo} alt="HubSpot" className="w-5 h-5 object-contain" />
                <div className="text-left">
                  <p className="text-sm font-medium text-cream">
                    {connectedCRMs.hubspot ? 'HubSpot Connected' : 'Connect HubSpot'}
                  </p>
                  {connectedCRMs.hubspot && (
                    <p className="text-xs text-dim">Notes will be synced to contact records</p>
                  )}
                </div>
              </div>
              {connectedCRMs.hubspot ? (
                <span className="text-sm text-cream">
                  {connectingCRM === 'hubspot' ? 'Disconnecting...' : 'Disconnect'}
                </span>
              ) : (
                <span className="text-sm text-accent">
                  {connectingCRM === 'hubspot' ? 'Connecting...' : '+ Connect'}
                </span>
              )}
            </button>
          </div>

          {/* CRM Notes Behavior */}
          {(connectedCRMs.salesforce || connectedCRMs.hubspot) && (
            <div>
              <label className="block text-sm text-muted mb-3">
                When sending notes to CRM
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-edge bg-input shadow-soft cursor-pointer hover:border-edge-light transition-colors">
                  <input
                    type="radio"
                    name="crmNotes"
                    value="always"
                    checked={localSettings?.crmNotesBehavior === 'always' || localSettings?.crmNotesBehavior === undefined}
                    onChange={(e) => handleChange('crmNotesBehavior', e.target.value as any)}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <p className="text-sm font-medium text-cream">Send all notes automatically</p>
                    <p className="text-xs text-dim">Notes are always pushed to participant records</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-edge bg-input shadow-soft cursor-pointer hover:border-edge-light transition-colors">
                  <input
                    type="radio"
                    name="crmNotes"
                    value="ask"
                    checked={localSettings?.crmNotesBehavior === 'ask'}
                    onChange={(e) => handleChange('crmNotesBehavior', e.target.value as any)}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <p className="text-sm font-medium text-cream">Ask before sending</p>
                    <p className="text-xs text-dim">You'll be prompted after each meeting</p>
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
            className="px-6 py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-surface rounded-lg font-medium transition-colors shadow-elevated active:scale-[0.97]"
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

      {/* iCloud credentials modal */}
      {icloudModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-backdrop-in" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-card border border-edge rounded-lg shadow-overlay w-full max-w-sm mx-4 animate-modal-in">
            <div className="flex items-center justify-between p-4 border-b border-edge">
              <h3 className="text-sm font-medium text-cream">Connect iCloud Calendar</h3>
              <button
                onClick={() => setIcloudModal({ isOpen: false, appleId: '', appPassword: '' })}
                className="p-1 text-muted hover:text-cream transition-colors rounded hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs text-muted mb-1.5">Apple ID email</label>
                <input
                  type="email"
                  value={icloudModal.appleId}
                  onChange={(e) => setIcloudModal(prev => ({ ...prev, appleId: e.target.value }))}
                  placeholder="you@icloud.com"
                  className="w-full bg-input border border-edge text-cream rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/30 placeholder:text-dim"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">App-specific password</label>
                <input
                  type="password"
                  value={icloudModal.appPassword}
                  onChange={(e) => setIcloudModal(prev => ({ ...prev, appPassword: e.target.value }))}
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                  className="w-full bg-input border border-edge text-cream rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/30 placeholder:text-dim"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleIcloudConnect(); }}
                />
                <p className="text-[11px] text-dim mt-1.5">
                  Generate one at appleid.apple.com under Sign-In and Security.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setIcloudModal({ isOpen: false, appleId: '', appPassword: '' })}
                  className="px-3 py-2 text-sm text-muted hover:text-cream transition-colors rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleIcloudConnect}
                  disabled={!icloudModal.appleId.trim() || !icloudModal.appPassword.trim()}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-surface text-sm font-medium rounded-lg transition-colors"
                >
                  Connect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
        enabled ? 'bg-accent' : 'bg-edge'
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
      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
        isConnected
          ? 'border-cream/50 bg-cream/10'
          : 'border-edge bg-input hover:border-edge-light'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div className="text-left">
          <p className="text-sm font-medium text-cream">
            {isConnected ? `${label} Connected` : `Connect Your ${label}`}
          </p>
          {isConnected && (
            <p className="text-xs text-dim">Syncing your {provider.charAt(0).toUpperCase() + provider.slice(1)} events</p>
          )}
        </div>
      </div>
      <span className={`text-sm ${isConnected ? 'text-cream' : 'text-accent'}`}>
        {getActionLabel()}
      </span>
    </button>
  );
}
