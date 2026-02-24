import { useState, useRef } from 'react';
import { useAppStore, type AppView } from '../stores/appStore';
import { Home, History, Users, Settings, Sparkles, ArrowLeft } from 'lucide-react';
import logoImage from '../assets/logo-transparent.png';
import FeedbackPopover from './FeedbackPopover';
import FeedbackModal from './FeedbackModal';

interface SidebarProps {
  pillarTab: 'notes' | 'prep';
  onPillarTabChange: (tab: 'notes' | 'prep') => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: typeof Home;
  view: AppView;
  pillar: 'notes' | 'prep' | null;
}

const isMac = /Macintosh|Mac OS/.test(navigator.userAgent);

export default function Sidebar({ pillarTab, onPillarTabChange }: SidebarProps) {
  const { view, navigate, recordingState, settings, navStack, goBack } = useAppStore();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'message' | 'feedback'>('feedback');
  const logoRef = useRef<HTMLDivElement>(null);

  const isOnHome = navStack.length <= 1 && view === 'home' && pillarTab === 'notes';

  const handleBack = () => {
    if (isOnHome) return;
    if (view === 'home' && pillarTab === 'prep') {
      onPillarTabChange('notes');
      return;
    }
    goBack();
  };

  const navItems: NavItem[] = [
    { id: 'home', label: 'Home', icon: Home, view: 'home', pillar: 'notes' },
    { id: 'prep', label: 'Prep', icon: Sparkles, view: 'home', pillar: 'prep' },
    { id: 'history', label: 'History', icon: History, view: 'history', pillar: null },
    { id: 'people', label: 'People', icon: Users, view: 'people', pillar: null },
    { id: 'settings', label: 'Settings', icon: Settings, view: 'settings', pillar: null },
  ];

  const isActive = (item: NavItem) => {
    if (item.pillar) {
      const homeViews: AppView[] = ['home', 'recording', 'meeting-detail'];
      return homeViews.includes(view) && pillarTab === item.pillar;
    }
    return view === item.view;
  };

  const handleClick = (item: NavItem) => {
    if (item.pillar) {
      onPillarTabChange(item.pillar);
      // If we're already on the target view, don't push a duplicate nav entry
      if (view === item.view) return;
    }
    navigate(item.view);
  };

  const showIndicator = settings?.showLiveMeetingIndicator ?? true;

  return (
    <aside className={`w-20 bg-surface border-r border-edge flex flex-col items-center px-2 pb-4 drag-region ${isMac ? 'pt-[52px]' : 'pt-3'}`}>
      {/* Back button below traffic lights */}
      <button
        disabled={isOnHome}
        onClick={handleBack}
        className={`no-drag w-9 h-9 rounded-lg flex items-center justify-center mb-2 transition-colors duration-150 ${
          isOnHome
            ? 'text-edge cursor-default'
            : 'text-dim hover:text-muted hover:bg-white/[0.04] active:scale-95 cursor-pointer'
        }`}
        title="Back"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      <nav className="flex-1 flex flex-col gap-1 no-drag w-full">
        {navItems.map((item) => {
          const active = isActive(item);
          return (
            <button
              key={item.id}
              onClick={() => handleClick(item)}
              className={`relative w-full py-2 rounded-lg flex flex-col items-center justify-center transition-colors duration-150 group ${
                active
                  ? 'text-accent-hover'
                  : 'text-dim hover:text-muted hover:bg-white/[0.04] active:scale-95'
              }`}
              title={item.label}
            >
              {active && (
                <div className="absolute inset-0 rounded-lg bg-accent/[0.10] border border-accent/[0.15] animate-nav-activate" />
              )}
              <item.icon className="relative w-[18px] h-[18px]" />
              <span className={`relative text-[10px] font-medium mt-0.5 leading-none ${active ? 'text-accent-hover' : 'text-dim group-hover:text-muted'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {recordingState === 'recording' && showIndicator && (
        <div className="mt-auto no-drag">
          <div className="w-2.5 h-2.5 rounded-full bg-status-error recording-indicator" />
        </div>
      )}

      {/* Logo at Bottom */}
      <div className="mt-auto no-drag pt-3">
        <div
          ref={logoRef}
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          className="flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-80 active:scale-95 transition-opacity duration-150"
        >
          <div className="w-16 h-16 -mb-4">
            <img
              src={logoImage}
              alt="Treeto"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="text-[9px] font-semibold tracking-[0.15em] uppercase text-dim">Treeto</span>
        </div>
      </div>

      <FeedbackPopover
        isOpen={isPopoverOpen}
        onClose={() => setIsPopoverOpen(false)}
        anchorEl={logoRef.current}
        onSelectFeedback={() => {
          setModalMode('feedback');
          setIsModalOpen(true);
        }}
      />

      <FeedbackModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mode={modalMode}
      />
    </aside>
  );
}
