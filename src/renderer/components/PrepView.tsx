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
  Globe,
  FileText,
  Edit,
  RotateCcw,
  Trash2,
  Clock,
  Mail,
  MessageSquare,
  TrendingUp,
  DollarSign,
  User,
  History,
  ChevronRight,
} from 'lucide-react';
import type {
  Person,
  CompanyInfo,
  CustomMeetingType,
  StandardMeetingTypeOverride,
  EnhancedMeetingPrepResult,
  EnhancedPrepParticipant,
  TimelineEvent,
  ActionItemStatus,
  CRMSnapshot,
} from '@shared/types';
import { toast } from '../stores/toastStore';

interface PrepViewProps {
  onSelectTab?: (tab: 'notes' | 'prep') => void;
}

// Standard meeting objectives with full details for editing
const DEFAULT_STANDARD_TYPES = [
  {
    id: '1-on-1',
    title: '1:1 Meeting',
    description: 'One-on-one discussions with team members or stakeholders',
    icon: Users,
    prompt: 'Prepare for a focused one-on-one meeting with clear objectives and talking points.',
    defaultRoles: ['Manager', 'Direct Report'],
    defaultObjectives: ['Discuss progress', 'Address concerns', 'Set goals']
  },
  {
    id: 'kick-off',
    title: 'Kick-Off',
    description: 'Project or initiative launch meetings',
    icon: Rocket,
    prompt: 'Set the stage for a new project with goals, timelines, and team alignment.',
    defaultRoles: ['Project Lead', 'Team Members', 'Stakeholders'],
    defaultObjectives: ['Define project scope', 'Assign responsibilities', 'Set timeline']
  },
  {
    id: 'technical-sync',
    title: 'Technical Sync',
    description: 'Deep technical discussions and architecture reviews',
    icon: Code,
    prompt: 'Facilitate technical discussions with clear context and decision points.',
    defaultRoles: ['Tech Lead', 'Engineers', 'Architect'],
    defaultObjectives: ['Review architecture', 'Discuss implementation', 'Make technical decisions']
  },
  {
    id: 'status-update',
    title: 'Status Update',
    description: 'Progress reviews and checkpoint meetings',
    icon: FileText,
    prompt: 'Share project progress, blockers, and next steps effectively.',
    defaultRoles: ['Project Manager', 'Team Leads', 'Stakeholders'],
    defaultObjectives: ['Share progress', 'Identify blockers', 'Align on next steps']
  },
  {
    id: 'planning',
    title: 'Planning Session',
    description: 'Strategic planning and roadmap discussions',
    icon: Target,
    prompt: 'Organize strategic planning with clear priorities and action items.',
    defaultRoles: ['Product Manager', 'Engineering Lead', 'Design Lead'],
    defaultObjectives: ['Prioritize backlog', 'Plan sprint', 'Estimate effort']
  },
  {
    id: 'retrospective',
    title: 'Retrospective',
    description: 'Reflect on what went well and what to improve',
    icon: Calendar,
    prompt: 'Facilitate constructive reflection on team processes and outcomes.',
    defaultRoles: ['Scrum Master', 'Team Members'],
    defaultObjectives: ['Celebrate wins', 'Identify improvements', 'Create action items']
  },
  {
    id: 'brainstorm',
    title: 'Brainstorming',
    description: 'Creative ideation and problem-solving sessions',
    icon: Lightbulb,
    prompt: 'Foster creative thinking and capture innovative ideas.',
    defaultRoles: ['Facilitator', 'Team Members'],
    defaultObjectives: ['Generate ideas', 'Evaluate options', 'Select approach']
  },
  {
    id: 'client',
    title: 'Client Sync',
    description: 'External client meetings and relationship building',
    icon: Briefcase,
    prompt: 'Prepare for client interactions with context and talking points.',
    defaultRoles: ['Account Manager', 'Project Lead', 'Client'],
    defaultObjectives: ['Review deliverables', 'Address concerns', 'Plan next steps']
  }
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
  const [briefingResult, setBriefingResult] = useState<EnhancedMeetingPrepResult | null>(null);
  const [completedActionItems, setCompletedActionItems] = useState<Set<string>>(new Set());
  const [fetchingCompanyInfo, setFetchingCompanyInfo] = useState<string | null>(null);
  const [companyInfoCache, setCompanyInfoCache] = useState<Record<string, CompanyInfo | null>>({});

  // Modal state for creating/editing objectives
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<MeetingObjectiveFormData>(emptyFormData);
  const [newRole, setNewRole] = useState('');
  const [newObjective, setNewObjective] = useState('');
  const [editingType, setEditingType] = useState<CustomMeetingType | null>(null);
  const [editingStandardId, setEditingStandardId] = useState<string | null>(null);

  // Get custom meeting objectives from settings
  const customObjectives = settings?.customMeetingTypesV2 || [];
  const objectiveUsage = settings?.meetingObjectiveUsage || [];
  const standardOverrides = settings?.standardMeetingTypeOverrides || [];

  // Get override for standard type
  const getStandardOverride = (id: string) => {
    return standardOverrides.find(o => o.id === id);
  };

  // Check if standard type has been modified
  const isStandardModified = (id: string) => {
    return standardOverrides.some(o => o.id === id);
  };

  // Combine and sort meeting objectives by last used
  const sortedObjectives = useMemo(() => {
    // Create a unified list of all objectives
    const allObjectives: Array<{
      id: string;
      label: string;
      icon: React.ComponentType<any>;
      isCustom: boolean;
      isModified: boolean;
      lastUsedAt: number;
    }> = [];

    // Add standard objectives
    DEFAULT_STANDARD_TYPES.forEach(obj => {
      const usage = objectiveUsage.find(u => u.id === obj.id);
      allObjectives.push({
        id: obj.id,
        label: obj.title,
        icon: obj.icon,
        isCustom: false,
        isModified: isStandardModified(obj.id),
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
        isModified: false,
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
  }, [customObjectives, objectiveUsage, standardOverrides]);

  // Get the selected objective's label for display
  const selectedObjectiveLabel = useMemo(() => {
    if (!selectedObjectiveId) return '';
    const obj = sortedObjectives.find(o => o.id === selectedObjectiveId);
    return obj?.label || selectedObjectiveId;
  }, [selectedObjectiveId, sortedObjectives]);

  // Handle action item completion toggle (new enhanced prep)
  const handleToggleActionItem = useCallback(async (actionItemId: string) => {
    const newCompleted = !completedActionItems.has(actionItemId);
    setCompletedActionItems(prev => {
      const next = new Set(prev);
      if (newCompleted) {
        next.add(actionItemId);
      } else {
        next.delete(actionItemId);
      }
      return next;
    });
    // Persist to backend
    try {
      await window.kakarot.prep.toggleActionItem(actionItemId, newCompleted);
    } catch (error) {
      console.error('Failed to toggle action item:', error);
    }
  }, [completedActionItems]);

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
    setEditingType(null);
    setEditingStandardId(null);
    setShowCreateModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowCreateModal(false);
    setFormData(emptyFormData);
    setEditingType(null);
    setEditingStandardId(null);
    setNewRole('');
    setNewObjective('');
  }, []);

  // Open modal for editing standard type
  const openStandardEdit = useCallback((id: string) => {
    const defaultType = DEFAULT_STANDARD_TYPES.find(t => t.id === id);
    const override = getStandardOverride(id);

    if (defaultType) {
      setFormData({
        name: defaultType.title,
        description: override?.description || defaultType.description,
        attendeeRoles: override?.attendeeRoles || defaultType.defaultRoles,
        isExternal: false,
        objectives: override?.objectives || defaultType.defaultObjectives,
        customPrompt: override?.customPrompt || defaultType.prompt
      });
      setEditingStandardId(id);
      setEditingType(null);
      setShowCreateModal(true);
    }
  }, [standardOverrides]);

  // Open modal for editing custom type
  const openCustomEdit = useCallback((type: CustomMeetingType) => {
    setFormData({
      name: type.name,
      description: type.description || '',
      attendeeRoles: type.attendeeRoles,
      isExternal: type.isExternal,
      objectives: type.objectives,
      customPrompt: type.customPrompt || ''
    });
    setEditingType(type);
    setEditingStandardId(null);
    setShowCreateModal(true);
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

  // Save custom meeting objective (create or update)
  const saveCustomType = useCallback(async () => {
    if (!formData.name.trim()) return;

    const now = Date.now();
    let nextSettings;

    if (editingType) {
      // Update existing
      const updated: CustomMeetingType = {
        ...editingType,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        attendeeRoles: formData.attendeeRoles,
        isExternal: formData.isExternal,
        objectives: formData.objectives,
        customPrompt: formData.customPrompt.trim() || undefined,
        updatedAt: now
      };

      nextSettings = {
        ...settings!,
        customMeetingTypesV2: customObjectives.map(t => t.id === editingType.id ? updated : t)
      };
    } else {
      // Create new
      const newType: CustomMeetingType = {
        id: generateId(),
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        attendeeRoles: formData.attendeeRoles,
        isExternal: formData.isExternal,
        objectives: formData.objectives,
        customPrompt: formData.customPrompt.trim() || undefined,
        createdAt: now,
        updatedAt: now
      };

      nextSettings = {
        ...settings!,
        customMeetingTypesV2: [...customObjectives, newType]
      };
    }

    closeModal();

    try {
      await window.kakarot.settings.update(nextSettings);
      setSettings(nextSettings);
      toast.success(editingType ? 'Meeting objective updated' : 'Meeting objective created');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save changes');
    }
  }, [formData, editingType, customObjectives, settings, setSettings, closeModal]);

  // Save standard type override
  const saveStandardOverride = useCallback(async () => {
    if (!editingStandardId) return;

    const override: StandardMeetingTypeOverride = {
      id: editingStandardId,
      description: formData.description.trim() || undefined,
      attendeeRoles: formData.attendeeRoles.length > 0 ? formData.attendeeRoles : undefined,
      objectives: formData.objectives.length > 0 ? formData.objectives : undefined,
      customPrompt: formData.customPrompt.trim() || undefined,
      updatedAt: Date.now()
    };

    const existingIndex = standardOverrides.findIndex(o => o.id === editingStandardId);
    const newOverrides = existingIndex >= 0
      ? standardOverrides.map(o => o.id === editingStandardId ? override : o)
      : [...standardOverrides, override];

    const nextSettings = {
      ...settings!,
      standardMeetingTypeOverrides: newOverrides
    };

    closeModal();

    try {
      await window.kakarot.settings.update(nextSettings);
      setSettings(nextSettings);
      toast.success('Meeting objective updated');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save changes');
    }
  }, [editingStandardId, formData, standardOverrides, settings, setSettings, closeModal]);

  // Reset standard type to default
  const resetStandardToDefault = useCallback(async (id: string) => {
    const nextSettings = {
      ...settings!,
      standardMeetingTypeOverrides: standardOverrides.filter(o => o.id !== id)
    };

    try {
      await window.kakarot.settings.update(nextSettings);
      setSettings(nextSettings);
      toast.success('Reset to default');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to reset');
    }
  }, [standardOverrides, settings, setSettings]);

  // Delete custom type
  const deleteCustomType = useCallback(async (id: string) => {
    const nextSettings = {
      ...settings!,
      customMeetingTypesV2: customObjectives.filter(t => t.id !== id)
    };

    closeModal();

    try {
      await window.kakarot.settings.update(nextSettings);
      setSettings(nextSettings);
      toast.success('Meeting objective deleted');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to delete');
    }
  }, [customObjectives, settings, setSettings, closeModal]);

  // Handle edit button click
  const handleEditObjective = useCallback((objectiveId: string, isCustom: boolean, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the objective

    if (isCustom) {
      const customType = customObjectives.find(c => c.id === objectiveId);
      if (customType) {
        openCustomEdit(customType);
      }
    } else {
      openStandardEdit(objectiveId);
    }
  }, [customObjectives, openCustomEdit, openStandardEdit]);

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
      'bg-[#4ea8dd]',
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

      // Use new enhanced briefing API
      const result = await window.kakarot.prep.generateEnhancedBriefing(payload);
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
      <div className="relative bg-[#0C0C0F] border border-[#4ea8dd]/40 rounded-2xl p-5 shadow-[0_10px_50px_rgba(78,168,221,0.25)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <p className="text-sm text-[#4ea8dd] uppercase tracking-wide">Select Participants</p>
            <h3 className="text-xl font-semibold text-white">Who are you meeting?</h3>
          </div>
          <Sparkles className="w-5 h-5 text-[#4ea8dd]" />
        </div>

        <div className="flex flex-wrap gap-2 mb-3 min-h-[36px] flex-shrink-0">
          {selectedPeople.length === 0 && (
            <span className="text-sm text-slate-400">No participants selected yet</span>
          )}
          {selectedPeople.map((person) => (
            <button
              key={person.email}
              onClick={() => togglePerson(person)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-[#4ea8dd]/40 text-sm text-white hover:bg-[#4ea8dd]/30 transition"
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
              {filteredPeople.slice(0, 8).map((person) => {
                const isSelected = selectedPeople.some((p) => p.email === person.email);
                return (
                  <button
                    key={person.email}
                    onClick={() => togglePerson(person)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-white/5 last:border-none transition ${
                      isSelected
                        ? 'bg-[#4ea8dd]/20'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <span className={`w-8 h-8 rounded-full ${getAvatarColor(person.email)} flex items-center justify-center text-white text-sm font-semibold`}>
                      {getInitials(person)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{getDisplayName(person)}</p>
                      <p className="text-xs text-slate-400 truncate">{person.email}</p>
                    </div>
                    {isSelected && (
                      <span className="text-xs text-[#4ea8dd]">Selected</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <p className="text-sm text-slate-400 mb-3 flex-shrink-0">Recent contacts</p>
          <div className="space-y-2 flex-1 overflow-y-auto">
            {people.slice(0, 3).map((person) => {
              const isSelected = selectedPeople.some((p) => p.email === person.email);
              return (
                <button
                  key={person.email}
                  onClick={() => togglePerson(person)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition ${
                    isSelected
                      ? 'border-[#4ea8dd] bg-[#4ea8dd]/20 shadow-[0_10px_30px_rgba(78,168,221,0.35)] border'
                      : 'bg-white/5 hover:bg-white/10 border border-white/5'
                  }`}
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
              );
            })}
          </div>
        </div>
      </div>

      {/* Meeting Objective Selection */}
      <div className="bg-[#0C0C0F] border border-[#4ea8dd]/40 rounded-2xl p-5 shadow-[0_10px_50px_rgba(78,168,221,0.25)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <p className="text-sm text-[#4ea8dd] uppercase tracking-wide">Meeting Objective</p>
            <h3 className="text-xl font-semibold text-white">What's the meeting about?</h3>
          </div>
          <Sparkles className="w-5 h-5 text-[#4ea8dd]" />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {sortedObjectives.map((objective) => {
            const Icon = objective.icon;
            const isActive = selectedObjectiveId === objective.id;
            return (
              <div
                key={objective.id}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition ${
                  isActive
                    ? 'border-[#4ea8dd] bg-[#4ea8dd]/20 shadow-[0_10px_30px_rgba(78,168,221,0.35)] border'
                    : 'bg-white/5 hover:bg-white/10 border border-white/5'
                }`}
              >
                <button
                  onClick={() => setSelectedObjectiveId(objective.id)}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <span className="p-2 rounded-lg bg-white/10 flex-shrink-0">
                    <Icon className="w-4 h-4 text-[#4ea8dd]" />
                  </span>
                  <div className="flex-1 min-w-0 text-left">
                    <span className="text-sm text-white block truncate">{objective.label}</span>
                    <div className="flex items-center gap-2">
                      {objective.isCustom && (
                        <span className="text-xs text-[#4ea8dd]">Custom</span>
                      )}
                      {objective.isModified && !objective.isCustom && (
                        <span className="text-xs text-amber-400">Modified</span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => handleEditObjective(objective.id, objective.isCustom, e)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
                  title="Edit objective"
                >
                  <Edit className="w-4 h-4 text-slate-400 hover:text-[#4ea8dd]" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={openCreateModal}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:border-[#4ea8dd]/60 transition mt-4 flex-shrink-0"
        >
          <Plus className="w-4 h-4 text-[#4ea8dd]" />
          <span className="text-sm text-white">Add Custom Meeting Objective</span>
        </button>
      </div>
    </div>
  );

  // Helper to get timeline event icon
  const getTimelineIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'meeting': return <Calendar className="w-3.5 h-3.5" />;
      case 'email': return <Mail className="w-3.5 h-3.5" />;
      case 'note': return <MessageSquare className="w-3.5 h-3.5" />;
      case 'deal_update': return <TrendingUp className="w-3.5 h-3.5" />;
      case 'call': return <Users className="w-3.5 h-3.5" />;
      default: return <Clock className="w-3.5 h-3.5" />;
    }
  };

  // Helper to get timeline source color
  const getSourceColor = (source: TimelineEvent['source']) => {
    switch (source) {
      case 'Meeting Notes': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
      case 'HubSpot': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
      case 'Salesforce': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'Email': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700/30 dark:text-gray-300';
    }
  };

  // Helper to format relative date
  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Render participant card with new 3-block structure
  const renderParticipantCard = (participant: EnhancedPrepParticipant, idx: number) => (
    <div key={idx} className="bg-[#0C0C0F] border border-[#4ea8dd]/30 rounded-2xl overflow-hidden">
      {/* Header with Last Seen Context */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-lg font-semibold text-white">{participant.name}</h4>
            {participant.email && (
              <p className="text-sm text-slate-400">{participant.email}</p>
            )}
          </div>
          {/* Confidence Badge with Source Attribution */}
          <div className="relative group">
            <div className={`text-xs px-3 py-1.5 rounded-full cursor-help ${
              participant.confidence.score >= 70
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : participant.confidence.score >= 40
                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                : 'bg-slate-700/50 text-slate-400 border border-slate-600'
            }`}>
              {participant.confidence.score}% confidence
            </div>
            {/* Tooltip with source breakdown */}
            <div className="absolute right-0 top-full mt-2 w-48 p-3 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <p className="text-xs text-slate-300 mb-2">{participant.confidence.explanation}</p>
              <div className="space-y-1 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Meetings:</span>
                  <span className="text-white">{participant.confidence.sources.meetings}</span>
                </div>
                <div className="flex justify-between">
                  <span>Emails:</span>
                  <span className="text-white">{participant.confidence.sources.emails}</span>
                </div>
                <div className="flex justify-between">
                  <span>CRM Notes:</span>
                  <span className="text-white">{participant.confidence.sources.crmNotes}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Last Seen Context */}
        {participant.lastSeen && (
          <div className="mt-3 p-3 bg-[#4ea8dd]/10 rounded-lg border border-[#4ea8dd]/20">
            <p className="text-sm text-[#4ea8dd]">
              <Clock className="w-3.5 h-3.5 inline mr-1.5" />
              We last spoke <span className="font-semibold">{participant.lastSeen.daysAgo} days ago</span> about "{participant.lastSeen.topic}"
              <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                participant.lastSeen.sentiment === 'Positive' ? 'bg-green-500/20 text-green-300' :
                participant.lastSeen.sentiment === 'Tense' ? 'bg-red-500/20 text-red-300' :
                'bg-slate-600/50 text-slate-300'
              }`}>
                {participant.lastSeen.sentiment}
              </span>
            </p>
          </div>
        )}

        {/* First Meeting Notice */}
        {participant.isFirstMeeting && (
          <div className="mt-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <p className="text-sm text-amber-300">First meeting with {participant.name}</p>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleLinkedInClick}
                className="text-xs px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition flex items-center gap-1.5"
              >
                <Linkedin className="w-3 h-3" />
                LinkedIn
              </button>
              {participant.email && (
                <button
                  onClick={() => handleFetchCompanyInfo(participant.email!)}
                  disabled={fetchingCompanyInfo === participant.email}
                  className="text-xs px-3 py-1.5 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Building2 className="w-3 h-3" />
                  {fetchingCompanyInfo === participant.email ? 'Fetching...' : 'Company Info'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Block A: The "Who" (Participant Intel) */}
      <div className="p-5 border-b border-white/10">
        <h5 className="text-sm font-semibold text-[#4ea8dd] uppercase tracking-wide mb-3 flex items-center gap-2">
          <User className="w-4 h-4" />
          Participant Intel
        </h5>
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <span className="text-xs text-slate-500 w-24 flex-shrink-0">Persona</span>
            <span className={`text-xs px-2 py-1 rounded ${
              participant.intel.persona === 'Technical' ? 'bg-blue-500/20 text-blue-300' :
              participant.intel.persona === 'Executive' ? 'bg-purple-500/20 text-purple-300' :
              participant.intel.persona === 'Skeptic' ? 'bg-red-500/20 text-red-300' :
              participant.intel.persona === 'Champion' ? 'bg-green-500/20 text-green-300' :
              'bg-slate-600/50 text-slate-300'
            }`}>
              {participant.intel.persona}
            </span>
          </div>
          {participant.intel.crmRole && (
            <div className="flex items-start gap-3">
              <span className="text-xs text-slate-500 w-24 flex-shrink-0">CRM Role</span>
              <span className="text-sm text-white">{participant.intel.crmRole}</span>
            </div>
          )}
          {participant.intel.personalFacts.length > 0 && (
            <div className="flex items-start gap-3">
              <span className="text-xs text-slate-500 w-24 flex-shrink-0">Personal</span>
              <span className="text-sm text-slate-300">{participant.intel.personalFacts.join(' • ')}</span>
            </div>
          )}
          {participant.intel.recentActivity.length > 0 && (
            <div className="flex items-start gap-3">
              <span className="text-xs text-slate-500 w-24 flex-shrink-0">Activity</span>
              <div className="space-y-1">
                {participant.intel.recentActivity.map((activity, i) => (
                  <p key={i} className="text-sm text-slate-300">{activity}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CRM Snapshot (if available) */}
      {participant.crmSnapshot && (
        <div className="p-5 border-b border-white/10 bg-gradient-to-r from-[#4ea8dd]/5 to-transparent">
          <h5 className="text-sm font-semibold text-[#4ea8dd] uppercase tracking-wide mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            CRM Snapshot
            <span className="text-xs font-normal normal-case text-slate-500">
              via {participant.crmSnapshot.source === 'hubspot' ? 'HubSpot' : 'Salesforce'}
            </span>
          </h5>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-500">Deal</p>
              <p className="text-sm text-white font-medium">{participant.crmSnapshot.dealName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Value</p>
              <p className="text-sm text-white font-medium">
                {participant.crmSnapshot.dealValue
                  ? `$${participant.crmSnapshot.dealValue.toLocaleString()}`
                  : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Stage</p>
              <p className="text-sm text-[#4ea8dd] font-medium">{participant.crmSnapshot.dealStage || 'N/A'}</p>
            </div>
          </div>
          {participant.crmSnapshot.blockers && participant.crmSnapshot.blockers.length > 0 && (
            <div className="mt-3 p-2 bg-red-500/10 rounded border border-red-500/20">
              <p className="text-xs text-red-300">
                <AlertCircle className="w-3 h-3 inline mr-1" />
                Blockers: {participant.crmSnapshot.blockers.join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Block B: The "History" (Action Items) */}
      {participant.actionItems.length > 0 && (
        <div className="p-5 border-b border-white/10">
          <h5 className="text-sm font-semibold text-[#4ea8dd] uppercase tracking-wide mb-3 flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            Action Items
          </h5>
          <div className="space-y-2">
            {participant.actionItems.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-start gap-3 group">
                <input
                  type="checkbox"
                  checked={completedActionItems.has(item.id) || item.completed}
                  onChange={() => handleToggleActionItem(item.id)}
                  className="mt-1 rounded border-slate-600 bg-slate-800 text-[#4ea8dd] focus:ring-[#4ea8dd] focus:ring-offset-0"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${
                    completedActionItems.has(item.id) || item.completed
                      ? 'line-through text-slate-500'
                      : 'text-slate-300'
                  }`}>
                    {item.description}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs mr-2 ${
                      item.assignedTo === 'them' ? 'bg-orange-500/20 text-orange-300' : 'bg-blue-500/20 text-blue-300'
                    }`}>
                      {item.assignedTo === 'them' ? 'Their action' : 'Our action'}
                    </span>
                    {formatRelativeDate(item.meetingDate)} • {item.meetingTitle}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unresolved Threads */}
      {participant.unresolvedThreads.length > 0 && (
        <div className="p-5 border-b border-white/10 bg-amber-500/5">
          <h5 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Unresolved Threads
          </h5>
          <div className="space-y-2">
            {participant.unresolvedThreads.map((thread) => (
              <div key={thread.id} className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <p className="text-sm text-amber-200">{thread.description}</p>
                <p className="text-xs text-amber-400/70 mt-1">
                  From {thread.originMeetingTitle} • {formatRelativeDate(thread.originMeetingDate)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Block C: Timeline */}
      {participant.timeline.length > 0 && (
        <div className="p-5">
          <h5 className="text-sm font-semibold text-[#4ea8dd] uppercase tracking-wide mb-3 flex items-center gap-2">
            <History className="w-4 h-4" />
            Timeline
          </h5>
          <div className="space-y-3">
            {participant.timeline.slice(0, 8).map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                  {getTimelineIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500">{formatRelativeDate(event.date)}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getSourceColor(event.source)}`}>
                      {event.source}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 mt-0.5">{event.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Company Info (fetched separately) */}
      {participant.email && companyInfoCache[participant.email] && (
        <div className="p-5 border-t border-white/10 bg-blue-500/5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-blue-300">
                {companyInfoCache[participant.email]!.name || companyInfoCache[participant.email]!.domain}
              </p>
              {companyInfoCache[participant.email]!.description && (
                <p className="text-xs text-blue-400/70 mt-1 line-clamp-2">
                  {companyInfoCache[participant.email]!.description}
                </p>
              )}
            </div>
            <a
              href={companyInfoCache[participant.email]!.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  );

  if (briefingResult) {
    return (
      <div className="h-[calc(100vh-200px)] flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700">
          <div>
            <h1 className="text-2xl font-semibold text-white mb-1">
              Prep Summary: {briefingResult.meeting.type}
            </h1>
            <p className="text-sm text-slate-400">
              {briefingResult.participants.map((p, idx) => (
                <span key={idx}>
                  {p.name}
                  {idx < briefingResult.participants.length - 1 && ', '}
                </span>
              ))}
            </p>
          </div>
          <button
            onClick={() => {
              setBriefingResult(null);
              setSelectedObjectiveId('');
              setSelectedPeople([]);
              setCompletedActionItems(new Set());
            }}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-lg transition-colors border border-slate-600"
          >
            Generate Another
          </button>
        </div>

        {/* Participant Cards */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {briefingResult.participants.map((participant, idx) => renderParticipantCard(participant, idx))}
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
          <div className="p-2 rounded-full bg-[#4ea8dd]/20 text-[#4ea8dd]">
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

      {/* Create/Edit Meeting Objective Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">
                {editingStandardId
                  ? 'Edit Standard Objective'
                  : editingType
                  ? 'Edit Meeting Objective'
                  : 'Create Meeting Objective'}
              </h3>
              <button onClick={closeModal} className="p-2 hover:bg-white/5 rounded-lg">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name - only for custom objectives */}
              {!editingStandardId && (
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
              )}

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

              {/* Internal/External Toggle - only for custom objectives */}
              {!editingStandardId && (
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
              )}

              {/* Attendee Roles */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Typical Attendee Roles</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.attendeeRoles.map((role, idx) => (
                    <span key={idx} className="px-3 py-1 bg-[#4ea8dd]/20 text-[#4ea8dd] rounded-full text-sm flex items-center gap-1">
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
            <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
              <div className="flex gap-2">
                {/* Reset to default button for standard objectives */}
                {editingStandardId && isStandardModified(editingStandardId) && (
                  <button
                    onClick={() => {
                      resetStandardToDefault(editingStandardId);
                      closeModal();
                    }}
                    className="px-4 py-2 text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset to Default
                  </button>
                )}
                {/* Delete button for custom objectives */}
                {editingType && (
                  <button
                    onClick={() => deleteCustomType(editingType.id)}
                    className="px-4 py-2 text-red-400 hover:text-red-300 transition-colors flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={editingStandardId ? saveStandardOverride : saveCustomType}
                  disabled={!editingStandardId && !formData.name.trim()}
                  className="px-4 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {editingStandardId ? 'Save Changes' : editingType ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}