import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import {
  Users,
  Sparkles,
  AlertCircle,
  CheckCircle,
  X,
  Lightbulb,
  Rocket,
  Code,
  Briefcase,
  Calendar,
  Target,
  ListChecks,
  Plus,
  Info,
  Building2,
  Linkedin,
  ExternalLink,
  MoreHorizontal,
  Globe,
  FileText,
} from 'lucide-react';
import type { Person, TaskCommitment, CompanyInfo, CustomMeetingType, MeetingObjectiveUsage } from '@shared/types';

interface PrepViewProps {
  onSelectTab?: (tab: 'notes' | 'prep' | 'interact') => void;
}

interface MeetingPrepResult {
  meeting: {
    type: string;
    duration_minutes: number;
  };
  generated_at: string;
  participants: Array<{
    name: string;
    email: string | null;
    history_strength: 'strong' | 'weak' | 'org-only' | 'none';
    is_first_meeting: boolean;
    org_has_met_before: boolean;
    confidence_score: number;
    data_gaps: string[];
    pending_task_commitments: TaskCommitment[];
    company_info?: CompanyInfo;
    context: {
      last_meeting_date: string | null;
      meeting_count: number;
      recent_topics: string[];
      key_points: string[];
    };
    talking_points: string[];
    questions_to_ask: string[];
    background: string;
  }>;
  agenda: {
    opening: string;
    key_topics: string[];
    closing: string;
  };
  success_metrics: string[];
  risk_mitigation: string[];
}

// Standard meeting objectives (matches InteractView's DEFAULT_STANDARD_TYPES)
const STANDARD_MEETING_OBJECTIVES = [
  { id: '1-on-1', label: '1:1 Meeting', icon: Users },
  { id: 'kick-off', label: 'Kick-Off', icon: Rocket },
  { id: 'technical-sync', label: 'Technical Sync', icon: Code },
  { id: 'status-update', label: 'Status Update', icon: FileText },
  { id: 'planning', label: 'Planning Session', icon: Target },
  { id: 'retrospective', label: 'Retrospective', icon: Calendar },
  { id: 'brainstorm', label: 'Brainstorming', icon: Lightbulb },
  { id: 'client', label: 'Client Sync', icon: Briefcase },
];

// Form data for creating custom objectives
interface MeetingObjectiveFormData {
  name: string;
  description: string;
  attendeeRoles: string[];
  isExternal: boolean;
  objectives: string[];
  customPrompt: string;
}

const emptyFormData: MeetingObjectiveFormData = {
  name: '',
  description: '',
  attendeeRoles: [],
  isExternal: false,
  objectives: [],
  customPrompt: ''
};

// Generate unique ID
const generateId = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export default function PrepView({ onSelectTab }: PrepViewProps) {
  const { settings, setSettings } = useAppStore();
  const [people, setPeople] = useState<Person[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([]);
  const [, setIsLoadingPeople] = useState(true);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingError, setGeneratingError] = useState<string | null>(null);
  const [briefingResult, setBriefingResult] = useState<MeetingPrepResult | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [fetchingCompanyInfo, setFetchingCompanyInfo] = useState<string | null>(null);
  const [companyInfoCache, setCompanyInfoCache] = useState<Record<string, CompanyInfo | null>>({});

  // Modal state for creating custom objectives
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<MeetingObjectiveFormData>(emptyFormData);
  const [newRole, setNewRole] = useState('');
  const [newObjective, setNewObjective] = useState('');

  // Get custom meeting objectives from settings
  const customObjectives = settings?.customMeetingTypesV2 || [];
  const objectiveUsage = settings?.meetingObjectiveUsage || [];

  // Combine and sort meeting objectives by last used
  const sortedObjectives = useMemo(() => {
    // Create a unified list of all objectives
    const allObjectives: Array<{
      id: string;
      label: string;
      icon: React.ComponentType<any>;
      isCustom: boolean;
      lastUsedAt: number;
    }> = [];

    // Add standard objectives
    STANDARD_MEETING_OBJECTIVES.forEach(obj => {
      const usage = objectiveUsage.find(u => u.id === obj.id);
      allObjectives.push({
        ...obj,
        isCustom: false,
        lastUsedAt: usage?.lastUsedAt || 0
      });
    });

    // Add custom objectives
    customObjectives.forEach(obj => {
      allObjectives.push({
        id: obj.id,
        label: obj.name,
        icon: Sparkles,
        isCustom: true,
        lastUsedAt: obj.lastUsedAt || 0
      });
    });

    // Sort by last used (most recent first), then alphabetically for unused
    return allObjectives.sort((a, b) => {
      if (a.lastUsedAt === 0 && b.lastUsedAt === 0) {
        return a.label.localeCompare(b.label);
      }
      return b.lastUsedAt - a.lastUsedAt;
    });
  }, [customObjectives, objectiveUsage]);

  // Get the selected objective's label for display
  const selectedObjectiveLabel = useMemo(() => {
    if (!selectedObjectiveId) return '';
    const obj = sortedObjectives.find(o => o.id === selectedObjectiveId);
    return obj?.label || selectedObjectiveId;
  }, [selectedObjectiveId, sortedObjectives]);

  // Handle task completion toggle
  const handleToggleTask = useCallback(async (taskId: string) => {
    const newCompleted = !completedTasks.has(taskId);
    setCompletedTasks(prev => {
      const next = new Set(prev);
      if (newCompleted) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
    // Persist to backend
    try {
      await window.kakarot.prep.toggleTaskCommitment(taskId, newCompleted);
    } catch (error) {
      console.error('Failed to toggle task:', error);
    }
  }, [completedTasks]);

  // Fetch company info for a participant
  const handleFetchCompanyInfo = useCallback(async (email: string) => {
    if (!email || fetchingCompanyInfo === email) return;
    setFetchingCompanyInfo(email);
    try {
      const info = await window.kakarot.prep.fetchCompanyInfo(email);
      setCompanyInfoCache(prev => ({ ...prev, [email]: info }));
    } catch (error) {
      console.error('Failed to fetch company info:', error);
      setCompanyInfoCache(prev => ({ ...prev, [email]: null }));
    } finally {
      setFetchingCompanyInfo(null);
    }
  }, [fetchingCompanyInfo]);

  // Show LinkedIn coming soon toast
  const handleLinkedInClick = useCallback(() => {
    alert('LinkedIn integration coming soon!');
  }, []);

  // Update meeting objective usage when generating briefing
  const updateObjectiveUsage = useCallback(async (objectiveId: string) => {
    const now = Date.now();
    const updatedUsage = [...objectiveUsage];
    const existingIndex = updatedUsage.findIndex(u => u.id === objectiveId);

    if (existingIndex >= 0) {
      updatedUsage[existingIndex] = { ...updatedUsage[existingIndex], lastUsedAt: now };
    } else {
      updatedUsage.push({ id: objectiveId, lastUsedAt: now });
    }

    // Also update lastUsedAt for custom objectives
    const customIndex = customObjectives.findIndex(c => c.id === objectiveId);
    if (customIndex >= 0) {
      const updatedCustom = [...customObjectives];
      updatedCustom[customIndex] = { ...updatedCustom[customIndex], lastUsedAt: now };
      await window.kakarot.settings.update({
        meetingObjectiveUsage: updatedUsage,
        customMeetingTypesV2: updatedCustom
      });
      setSettings({ ...settings!, meetingObjectiveUsage: updatedUsage, customMeetingTypesV2: updatedCustom });
    } else {
      await window.kakarot.settings.update({ meetingObjectiveUsage: updatedUsage });
      setSettings({ ...settings!, meetingObjectiveUsage: updatedUsage });
    }
  }, [objectiveUsage, customObjectives, settings, setSettings]);

  // Modal handlers
  const openCreateModal = useCallback(() => {
    setFormData(emptyFormData);
    setShowCreateModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowCreateModal(false);
    setFormData(emptyFormData);
    setNewRole('');
    setNewObjective('');
  }, []);

  const addRole = useCallback(() => {
    if (newRole.trim() && !formData.attendeeRoles.includes(newRole.trim())) {
      setFormData(prev => ({
        ...prev,
        attendeeRoles: [...prev.attendeeRoles, newRole.trim()]
      }));
      setNewRole('');
    }
  }, [newRole, formData.attendeeRoles]);

  const addObjectiveItem = useCallback(() => {
    if (newObjective.trim() && !formData.objectives.includes(newObjective.trim())) {
      setFormData(prev => ({
        ...prev,
        objectives: [...prev.objectives, newObjective.trim()]
      }));
      setNewObjective('');
    }
  }, [newObjective, formData.objectives]);

  const saveCustomObjective = useCallback(async () => {
    if (!formData.name.trim()) return;

    const now = Date.now();
    const newObjective: CustomMeetingType = {
      id: generateId(),
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      attendeeRoles: formData.attendeeRoles,
      isExternal: formData.isExternal,
      objectives: formData.objectives,
      customPrompt: formData.customPrompt.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: undefined
    };

    const updatedCustom = [...customObjectives, newObjective];
    await window.kakarot.settings.update({ customMeetingTypesV2: updatedCustom });
    setSettings({ ...settings!, customMeetingTypesV2: updatedCustom });
    closeModal();
  }, [formData, customObjectives, settings, setSettings, closeModal]);

  // Navigate to Interact tab
  const handleViewMore = useCallback(() => {
    onSelectTab?.('interact');
  }, [onSelectTab]);

  useEffect(() => {
    loadPeople();
  }, []);

  const loadPeople = async () => {
    setIsLoadingPeople(true);
    try {
      const peopleList = await window.kakarot.people.list();
      setPeople(peopleList);
    } finally {
      setIsLoadingPeople(false);
    }
  };

  const filteredPeople = useMemo(() => {
    if (!searchQuery.trim()) return people;
    const query = searchQuery.toLowerCase();
    return people.filter(
      (p) =>
        p.name?.toLowerCase().includes(query) ||
        p.email.toLowerCase().includes(query) ||
        p.organization?.toLowerCase().includes(query)
    );
  }, [people, searchQuery]);

  const getDisplayName = (person: Person): string => {
    if (person.name && person.name.trim()) return person.name;
    const localPart = person.email.split('@')[0];
    const nameParts = localPart.split(/[._-]/).filter((part) => part.length > 0);
    return nameParts
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  };

  const getAvatarColor = (email: string) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-teal-500',
    ];
    const hash = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const getInitials = (person: Person) => {
    const displayName = getDisplayName(person);
    const nameParts = displayName.split(' ');
    if (nameParts.length >= 2) {
      return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  };

  const formatLastMeeting = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const togglePerson = (person: Person) => {
    const exists = selectedPeople.some((p) => p.email === person.email);
    setSelectedPeople((prev) =>
      exists ? prev.filter((p) => p.email !== person.email) : [...prev, person]
    );
    setSearchQuery('');
  };

  const handleGenerateBriefing = async () => {
    if (!selectedObjectiveId || selectedPeople.length === 0) {
      setGeneratingError('Please pick at least one participant and a meeting objective');
      return;
    }

    setIsGenerating(true);
    setGeneratingError(null);
    setBriefingResult(null);

    try {
      const payload = {
        meeting: {
          meeting_type: selectedObjectiveLabel,
          objective: selectedObjectiveLabel,
        },
        participants: selectedPeople.map((person) => ({
          name: getDisplayName(person),
          email: person.email,
          company: person.organization || null,
          domain: person.email?.split('@')[1] || null,
        })),
      };

      const result = await window.kakarot.prep.generateBriefing(payload);
      setBriefingResult(result);

      // Update usage tracking
      await updateObjectiveUsage(selectedObjectiveId);
    } catch (error) {
      setGeneratingError(error instanceof Error ? error.message : 'Failed to generate briefing');
      console.error('Failed to generate briefing:', error);
    } finally {
      setIsGenerating(false);
    }
  };


  const renderParticipantSelection = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
      <div className="relative bg-[#0C0C0F] border border-purple-700/40 rounded-2xl p-5 shadow-[0_10px_50px_rgba(124,58,237,0.25)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <p className="text-sm text-purple-200 uppercase tracking-wide">Select Participants</p>
            <h3 className="text-xl font-semibold text-white">Who are you meeting?</h3>
          </div>
          <Sparkles className="w-5 h-5 text-purple-300" />
        </div>

        <div className="flex flex-wrap gap-2 mb-3 min-h-[36px] flex-shrink-0">
          {selectedPeople.length === 0 && (
            <span className="text-sm text-slate-400">No participants selected yet</span>
          )}
          {selectedPeople.map((person) => (
            <button
              key={person.email}
              onClick={() => togglePerson(person)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-purple-500/40 text-sm text-white hover:bg-purple-600/30 transition"
            >
              <span className={`w-6 h-6 rounded-full ${getAvatarColor(person.email)} flex items-center justify-center text-white text-xs font-semibold`}>
                {getInitials(person)}
              </span>
              <span>{getDisplayName(person)}</span>
              <X className="w-3 h-3" />
            </button>
          ))}
        </div>

        <div className="relative mb-4 flex-shrink-0">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111019] border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
          />
          {searchQuery && filteredPeople.length > 0 && (
            <div className="absolute z-10 mt-2 w-full max-h-60 overflow-y-auto bg-[#0C0C0F] border border-white/10 rounded-xl shadow-2xl">
              {filteredPeople.slice(0, 8).map((person) => (
                <button
                  key={person.email}
                  onClick={() => togglePerson(person)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left border-b border-white/5 last:border-none"
                >
                  <span className={`w-8 h-8 rounded-full ${getAvatarColor(person.email)} flex items-center justify-center text-white text-sm font-semibold`}>
                    {getInitials(person)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{getDisplayName(person)}</p>
                    <p className="text-xs text-slate-400 truncate">{person.email}</p>
                  </div>
                  {selectedPeople.some((p) => p.email === person.email) && (
                    <span className="text-xs text-purple-300">Selected</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <p className="text-sm text-slate-400 mb-3 flex-shrink-0">Recent contacts</p>
          <div className="space-y-2 flex-1 overflow-y-auto">
            {people.slice(0, 3).map((person) => (
              <button
                key={person.email}
                onClick={() => togglePerson(person)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-left"
              >
                <span className={`w-8 h-8 rounded-full ${getAvatarColor(person.email)} flex items-center justify-center text-white text-sm font-semibold`}>
                  {getInitials(person)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{getDisplayName(person)}</p>
                  <p className="text-xs text-slate-400 truncate">{person.email}</p>
                </div>
                {person.lastMeetingAt && (
                  <span className="text-xs text-slate-400">{formatLastMeeting(person.lastMeetingAt)}</span>
                )}
              </button>             
            ))}
          </div>
        </div>
      </div>

      {/* Meeting Objective Selection */}
      <div className="bg-[#0C0C0F] border border-purple-700/40 rounded-2xl p-5 shadow-[0_10px_50px_rgba(124,58,237,0.25)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <p className="text-sm text-purple-200 uppercase tracking-wide">Meeting Objective</p>
            <h3 className="text-xl font-semibold text-white">What's the meeting about?</h3>
          </div>
          <Sparkles className="w-5 h-5 text-purple-300" />
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Show top 7 objectives sorted by last used + View More */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {sortedObjectives.slice(0, 7).map((objective) => {
              const Icon = objective.icon;
              const isActive = selectedObjectiveId === objective.id;
              return (
                <button
                  key={objective.id}
                  onClick={() => setSelectedObjectiveId(objective.id)}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border transition ${
                    isActive
                      ? 'border-purple-500 bg-purple-600/20 shadow-[0_10px_30px_rgba(124,58,237,0.35)]'
                      : 'border-white/10 bg-white/5 hover:border-purple-400/60'
                  }`}
                >
                  <span className="p-2 rounded-lg bg-white/10">
                    <Icon className="w-4 h-4 text-purple-200" />
                  </span>
                  <div className="flex-1 min-w-0 text-left">
                    <span className="text-sm text-white block truncate">{objective.label}</span>
                    {objective.isCustom && (
                      <span className="text-xs text-purple-400">Custom</span>
                    )}
                  </div>
                </button>
              );
            })}
            {/* View More button */}
            <button
              onClick={handleViewMore}
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:border-purple-400/60 transition"
            >
              <span className="p-2 rounded-lg bg-white/10">
                <MoreHorizontal className="w-4 h-4 text-purple-200" />
              </span>
              <span className="text-sm text-white text-left">View More</span>
            </button>
          </div>
        </div>

        <button
          onClick={openCreateModal}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:border-purple-400/60 transition mt-4 flex-shrink-0"
        >
          <Plus className="w-4 h-4 text-purple-300" />
          <span className="text-sm text-white">Add Custom Meeting Objective</span>
        </button>
      </div>
    </div>
  );

  if (briefingResult) {
    return (
      <div className="h-[calc(100vh-200px)] flex flex-col overflow-hidden">
        {/* Briefing Result View */}
        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-slate-700">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-white mb-1">Meeting Briefing</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Generated on {new Date(briefingResult.generated_at).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => {
                setBriefingResult(null);
                setSelectedObjectiveId('');
                setSelectedPeople([]);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Generate Another
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                {briefingResult.meeting.type}
              </h2>
              <p className="text-sm text-gray-700 dark:text-gray-300">{briefingResult.meeting.duration_minutes} minutes</p>
            </div>

            <div className="bg-white dark:bg-slate-800/50 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Agenda</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-purple-600 dark:text-purple-400 mb-1">Opening</p>
                  <p className="text-gray-700 dark:text-gray-300">{briefingResult.agenda.opening}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-purple-600 dark:text-purple-400 mb-2">Key Topics</p>
                  <ul className="space-y-2">
                    {briefingResult.agenda.key_topics.map((topic, idx) => (
                      <li key={idx} className="flex gap-3">
                        <span className="text-purple-500 flex-shrink-0 mt-1">•</span>
                        <span className="text-gray-700 dark:text-gray-300">{topic}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-medium text-purple-600 dark:text-purple-400 mb-1">Closing</p>
                  <p className="text-gray-700 dark:text-gray-300">{briefingResult.agenda.closing}</p>
                </div>
              </div>
            </div>

            {briefingResult.success_metrics.length > 0 && (
              <div className="bg-white dark:bg-slate-800/50 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Success Metrics</h3>
                <ul className="space-y-2">
                  {briefingResult.success_metrics.map((metric, idx) => (
                    <li key={idx} className="flex gap-3">
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-1" />
                      <span className="text-gray-700 dark:text-gray-300">{metric}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {briefingResult.risk_mitigation.length > 0 && (
              <div className="bg-white dark:bg-slate-800/50 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Risk Mitigation</h3>
                <ul className="space-y-2">
                  {briefingResult.risk_mitigation.map((risk, idx) => (
                    <li key={idx} className="flex gap-3">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-1" />
                      <span className="text-gray-700 dark:text-gray-300">{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Participant Insights</h3>
              {briefingResult.participants.map((participant, idx) => (
                <div key={idx} className="bg-white dark:bg-slate-800/50 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{participant.name}</h4>
                      {participant.email && <p className="text-sm text-gray-500 dark:text-gray-400">{participant.email}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        participant.history_strength === 'strong'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : participant.history_strength === 'weak'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                          : participant.history_strength === 'org-only'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-300'
                      }`}>
                        {participant.history_strength === 'strong' && 'Strong History'}
                        {participant.history_strength === 'weak' && 'Weak History'}
                        {participant.history_strength === 'org-only' && 'Same Org'}
                        {participant.history_strength === 'none' && 'No History'}
                      </span>
                      {participant.confidence_score > 0 && (
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          participant.confidence_score >= 70
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            : participant.confidence_score >= 40
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400'
                        }`}>
                          {participant.confidence_score}% confidence
                        </span>
                      )}
                    </div>
                  </div>

                  {/* First-time meeting banner */}
                  {participant.is_first_meeting && (
                    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                            First meeting with {participant.name}
                          </p>
                          {participant.org_has_met_before ? (
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                              Others in your organization have met with them before.
                            </p>
                          ) : (
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                              No one in your organization has met them yet.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Data fetch options */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={handleLinkedInClick}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition"
                        >
                          <Linkedin className="w-3 h-3" />
                          Fetch from LinkedIn
                        </button>
                        {participant.email && (
                          <button
                            onClick={() => handleFetchCompanyInfo(participant.email!)}
                            disabled={fetchingCompanyInfo === participant.email}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition disabled:opacity-50"
                          >
                            <Building2 className="w-3 h-3" />
                            {fetchingCompanyInfo === participant.email ? 'Fetching...' : 'Check Company Website'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Company info display */}
                  {participant.email && companyInfoCache[participant.email] && (
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                            {companyInfoCache[participant.email]!.name || companyInfoCache[participant.email]!.domain}
                          </p>
                          {companyInfoCache[participant.email]!.description && (
                            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 line-clamp-2">
                              {companyInfoCache[participant.email]!.description}
                            </p>
                          )}
                        </div>
                        <a
                          href={companyInfoCache[participant.email]!.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Data gaps warning */}
                  {participant.data_gaps && participant.data_gaps.length > 0 && (
                    <div className="mb-4 p-2 bg-gray-50 dark:bg-slate-700/30 rounded-lg border border-gray-200 dark:border-slate-600">
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        Limited data: {participant.data_gaps.join(', ')}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-2">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Meetings</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{participant.context.meeting_count}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-2">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Recent Topics</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{participant.context.recent_topics.length}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-2">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Last Meeting</p>
                      <p className="font-semibold text-gray-900 dark:text-white text-xs">
                        {participant.context.last_meeting_date ? new Date(participant.context.last_meeting_date).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {participant.background && (
                    <div className="mb-4 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">Background</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{participant.background}</p>
                    </div>
                  )}

                  {/* Task Commitments Section */}
                  {participant.pending_task_commitments && participant.pending_task_commitments.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <ListChecks className="w-4 h-4 text-purple-500" />
                        Previous Commitments
                      </p>
                      <ul className="space-y-2">
                        {participant.pending_task_commitments.slice(0, 5).map((task) => (
                          <li key={task.id} className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={completedTasks.has(task.id) || task.completed}
                              onChange={() => handleToggleTask(task.id)}
                              className="mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                            <div className="flex-1">
                              <span className={`${completedTasks.has(task.id) || task.completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                {task.description}
                              </span>
                              <span className="text-xs text-gray-400 ml-2">
                                from {new Date(task.meetingDate).toLocaleDateString()}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {participant.talking_points.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Talking Points</p>
                      <ul className="space-y-1">
                        {participant.talking_points.map((point, pidx) => (
                          <li key={pidx} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <span className="text-purple-500 flex-shrink-0">→</span>
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {participant.questions_to_ask.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Questions to Ask</p>
                      <ul className="space-y-1">
                        {participant.questions_to_ask.map((question, qidx) => (
                          <li key={qidx} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <span className="text-blue-500 flex-shrink-0">?</span>
                            <span>{question}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col text-white">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Meeting Preparation</h1>
        <p className="text-slate-400">Pick participants and set the objective before generating your briefing.</p>
      </div>

      <div className="flex-1 min-h-0">
        {renderParticipantSelection()}
      </div>

      <div className="mt-3 bg-[#0C0C0F] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-purple-600/20 text-purple-200">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-slate-400">Summary</p>
            <p className="text-sm text-white">
              {selectedPeople.length} participant{selectedPeople.length === 1 ? '' : 's'} · {selectedObjectiveLabel || 'No objective yet'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateBriefing}
            disabled={isGenerating || selectedPeople.length === 0 || !selectedObjectiveId}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-semibold shadow-[0_12px_30px_rgba(124,58,237,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>

      {generatingError && (
        <p className="mt-2 text-sm text-amber-300">{generatingError}</p>
      )}

      {/* Create Custom Objective Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Create Meeting Objective</h3>
              <button onClick={closeModal} className="p-2 hover:bg-white/5 rounded-lg">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Customer Discovery Call"
                  className="w-full px-4 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-[#7C3AED] focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What is this meeting objective for?"
                  rows={2}
                  className="w-full px-4 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-[#7C3AED] focus:outline-none resize-none"
                />
              </div>

              {/* Internal/External Toggle */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Meeting Context</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, isExternal: false }))}
                    className={`flex-1 px-4 py-3 rounded-lg border flex items-center justify-center gap-2 transition-colors ${
                      !formData.isExternal
                        ? 'border-[#7C3AED] bg-[#7C3AED]/20 text-white'
                        : 'border-white/10 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    Internal
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, isExternal: true }))}
                    className={`flex-1 px-4 py-3 rounded-lg border flex items-center justify-center gap-2 transition-colors ${
                      formData.isExternal
                        ? 'border-[#7C3AED] bg-[#7C3AED]/20 text-white'
                        : 'border-white/10 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    External
                  </button>
                </div>
              </div>

              {/* Attendee Roles */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Typical Attendee Roles</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.attendeeRoles.map((role, idx) => (
                    <span key={idx} className="px-3 py-1 bg-purple-600/20 text-purple-200 rounded-full text-sm flex items-center gap-1">
                      {role}
                      <button onClick={() => setFormData(prev => ({
                        ...prev,
                        attendeeRoles: prev.attendeeRoles.filter((_, i) => i !== idx)
                      }))}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addRole())}
                    placeholder="Add role (e.g., Product Manager)"
                    className="flex-1 px-3 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 text-sm focus:border-[#7C3AED] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addRole}
                    className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Objectives */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Key Objectives</label>
                <div className="space-y-2 mb-2">
                  {formData.objectives.map((obj, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span className="flex-1 text-sm text-white">{obj}</span>
                      <button onClick={() => setFormData(prev => ({
                        ...prev,
                        objectives: prev.objectives.filter((_, i) => i !== idx)
                      }))}>
                        <X className="w-4 h-4 text-slate-400 hover:text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newObjective}
                    onChange={(e) => setNewObjective(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addObjectiveItem())}
                    placeholder="Add objective (e.g., Identify pain points)"
                    className="flex-1 px-3 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 text-sm focus:border-[#7C3AED] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addObjectiveItem}
                    className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Custom Prompt */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">AI Preparation Prompt</label>
                <textarea
                  value={formData.customPrompt}
                  onChange={(e) => setFormData(prev => ({ ...prev, customPrompt: e.target.value }))}
                  placeholder="Instructions for AI when preparing for this meeting..."
                  rows={3}
                  className="w-full px-4 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-[#7C3AED] focus:outline-none resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/5">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCustomObjective}
                disabled={!formData.name.trim()}
                className="px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}