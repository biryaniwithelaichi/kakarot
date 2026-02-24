import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import type { AppSettings, CustomMeetingType, StandardMeetingTypeOverride } from '@shared/types';
import {
  Plus, X, Settings, Sparkles, Users, Rocket, Code, FileText, Target, Calendar,
  Edit, RotateCcw, Building2, Globe, ChevronDown, ChevronUp
} from 'lucide-react';
import { toast } from '../stores/toastStore';

// Standard meeting objectives with default values
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
  }
];

type TabType = 'standard' | 'custom';

// Generate unique ID
const generateId = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

interface MeetingTypeFormData {
  name: string;
  description: string;
  attendeeRoles: string[];
  isExternal: boolean;
  objectives: string[];
  customPrompt: string;
}

const emptyFormData: MeetingTypeFormData = {
  name: '',
  description: '',
  attendeeRoles: [],
  isExternal: false,
  objectives: [],
  customPrompt: ''
};

export default function InteractView() {
  const { settings, setSettings } = useAppStore();
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('standard');

  // Form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingType, setEditingType] = useState<CustomMeetingType | null>(null);
  const [editingStandardId, setEditingStandardId] = useState<string | null>(null);
  const [formData, setFormData] = useState<MeetingTypeFormData>(emptyFormData);
  const [newRole, setNewRole] = useState('');
  const [newObjective, setNewObjective] = useState('');
  const [expandedStandardType, setExpandedStandardType] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setLocalSettings({ ...settings });
    }
  }, [settings]);

  // Custom meeting objectives (v2 structured)
  const customMeetingTypes = localSettings?.customMeetingTypesV2 || [];
  const standardOverrides = localSettings?.standardMeetingTypeOverrides || [];

  // Get override for standard type
  const getStandardOverride = (id: string) => {
    return standardOverrides.find(o => o.id === id);
  };

  // Check if standard type has been modified
  const isStandardModified = (id: string) => {
    return standardOverrides.some(o => o.id === id);
  };

  // Save custom meeting objective
  const saveCustomType = useCallback(async () => {
    if (!localSettings || !formData.name.trim()) return;

    const now = Date.now();
    let nextSettings: AppSettings;

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
        ...localSettings,
        customMeetingTypesV2: customMeetingTypes.map(t => t.id === editingType.id ? updated : t)
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
        ...localSettings,
        customMeetingTypesV2: [...customMeetingTypes, newType]
      };
    }

    setLocalSettings(nextSettings);
    closeModal();

    try {
      await window.kakarot.settings.update(nextSettings);
      setSettings(nextSettings);
      toast.success(editingType ? 'Meeting objective updated' : 'Meeting objective created');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save changes');
    }
  }, [localSettings, formData, editingType, customMeetingTypes, setSettings]);

  // Save standard type override
  const saveStandardOverride = useCallback(async () => {
    if (!localSettings || !editingStandardId) return;

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
      ...localSettings,
      standardMeetingTypeOverrides: newOverrides
    };

    setLocalSettings(nextSettings);
    closeModal();

    try {
      await window.kakarot.settings.update(nextSettings);
      setSettings(nextSettings);
      toast.success('Meeting objective updated');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save changes');
    }
  }, [localSettings, editingStandardId, formData, standardOverrides, setSettings]);

  // Reset standard type to default
  const resetStandardToDefault = useCallback(async (id: string) => {
    if (!localSettings) return;

    const nextSettings = {
      ...localSettings,
      standardMeetingTypeOverrides: standardOverrides.filter(o => o.id !== id)
    };

    setLocalSettings(nextSettings);

    try {
      await window.kakarot.settings.update(nextSettings);
      setSettings(nextSettings);
      toast.success('Reset to default');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to reset');
    }
  }, [localSettings, standardOverrides, setSettings]);

  // Delete custom type
  const deleteCustomType = useCallback(async (id: string) => {
    if (!localSettings) return;

    const nextSettings = {
      ...localSettings,
      customMeetingTypesV2: customMeetingTypes.filter(t => t.id !== id)
    };

    setLocalSettings(nextSettings);

    try {
      await window.kakarot.settings.update(nextSettings);
      setSettings(nextSettings);
      toast.success('Meeting objective deleted');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to delete');
    }
  }, [localSettings, customMeetingTypes, setSettings]);

  // Open modal for editing standard type
  const openStandardEdit = (id: string) => {
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
      setShowCreateModal(true);
    }
  };

  // Open modal for editing custom type
  const openCustomEdit = (type: CustomMeetingType) => {
    setFormData({
      name: type.name,
      description: type.description || '',
      attendeeRoles: type.attendeeRoles,
      isExternal: type.isExternal,
      objectives: type.objectives,
      customPrompt: type.customPrompt || ''
    });
    setEditingType(type);
    setShowCreateModal(true);
  };

  // Open modal for new custom type
  const openNewCustom = () => {
    setFormData(emptyFormData);
    setEditingType(null);
    setEditingStandardId(null);
    setShowCreateModal(true);
  };

  // Close modal
  const closeModal = () => {
    setShowCreateModal(false);
    setEditingType(null);
    setEditingStandardId(null);
    setFormData(emptyFormData);
    setNewRole('');
    setNewObjective('');
  };

  // Add role
  const addRole = () => {
    if (newRole.trim() && !formData.attendeeRoles.includes(newRole.trim())) {
      setFormData(prev => ({
        ...prev,
        attendeeRoles: [...prev.attendeeRoles, newRole.trim()]
      }));
      setNewRole('');
    }
  };

  // Add objective
  const addObjective = () => {
    if (newObjective.trim() && !formData.objectives.includes(newObjective.trim())) {
      setFormData(prev => ({
        ...prev,
        objectives: [...prev.objectives, newObjective.trim()]
      }));
      setNewObjective('');
    }
  };

  if (!localSettings) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin">
          <Sparkles className="w-8 h-8 text-[#4ea8dd]" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-[#0C0C0C] via-[#0D0D0F] to-[#0C0C14]">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#3d96cb]/20">
            <Settings className="w-5 h-5 text-[#3d96cb]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Meeting Objectives</h1>
            <p className="text-sm text-slate-400">Customize meeting objectives for better AI preparation</p>
          </div>
        </div>

      </div>

      {/* Tab Navigation */}
      <div className="px-8 pt-6 pb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('standard')}
            className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === 'standard'
                ? 'bg-[#2A2A2A] border-2 border-[#3d96cb]/50 text-white'
                : 'bg-[#2A2A2A] border-2 border-white/5 text-slate-400 hover:border-white/10'
            }`}
          >
            Standard Objectives
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
              activeTab === 'custom'
                ? 'bg-[#2A2A2A] border-2 border-[#3d96cb]/50 text-white'
                : 'bg-[#2A2A2A] border-2 border-white/5 text-slate-400 hover:border-white/10'
            }`}
          >
            Custom Objectives ({customMeetingTypes.length})
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 px-8 pb-8 overflow-y-auto">
        {activeTab === 'standard' ? (
          // Standard Meeting Objectives
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {DEFAULT_STANDARD_TYPES.map((type) => {
                const IconComponent = type.icon;
                const override = getStandardOverride(type.id);
                const isModified = isStandardModified(type.id);
                const isExpanded = expandedStandardType === type.id;

                return (
                  <div
                    key={type.id}
                    className="bg-[#2A2A2A] border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all flex flex-col"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-3 bg-[#3d96cb]/10 rounded-xl">
                        <IconComponent className="w-6 h-6 text-[#3d96cb]" />
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openStandardEdit(type.id)}
                          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4 text-slate-400" />
                        </button>
                        {isModified && (
                          <button
                            onClick={() => resetStandardToDefault(type.id)}
                            className="p-2 hover:bg-amber-500/10 rounded-lg transition-colors"
                            title="Reset to default"
                          >
                            <RotateCcw className="w-4 h-4 text-amber-400" />
                          </button>
                        )}
                      </div>
                    </div>

                    <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
                      {type.title}
                      {isModified && (
                        <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded">Modified</span>
                      )}
                    </h3>

                    <p className="text-slate-400 text-sm leading-relaxed flex-grow">
                      {override?.description || type.description}
                    </p>

                    {/* Expandable details - pushed to bottom */}
                    <div className="mt-4">
                      <button
                        onClick={() => setExpandedStandardType(isExpanded ? null : type.id)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-[#0D0D0D] rounded-lg text-sm text-slate-400 hover:text-white transition-colors"
                      >
                        <span>View details</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-3 space-y-3 text-sm">
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Roles</p>
                            <div className="flex flex-wrap gap-1">
                              {(override?.attendeeRoles || type.defaultRoles).map((role, i) => (
                                <span key={i} className="px-2 py-0.5 bg-[#4ea8dd]/20 text-[#4ea8dd] rounded text-xs">
                                  {role}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Objectives</p>
                            <ul className="space-y-1">
                              {(override?.objectives || type.defaultObjectives).map((obj, i) => (
                                <li key={i} className="text-slate-300 text-xs flex items-center gap-1">
                                  <Target className="w-3 h-3 text-[#F0EBE3]" />
                                  {obj}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // Custom Meeting Objectives
          <div className="max-w-5xl mx-auto">
            <div className="flex justify-end mb-6">
              <button
                onClick={openNewCustom}
                className="px-6 py-3 bg-[#3d96cb] hover:bg-[#566051] text-white font-medium rounded-xl transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Create New Objective
              </button>
            </div>

            {customMeetingTypes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="mb-4 p-4 bg-[#2A2A2A] rounded-2xl">
                  <FileText className="w-12 h-12 text-slate-600" />
                </div>
                <p className="text-slate-400 mb-2">No custom meeting objectives yet</p>
                <p className="text-slate-500 text-sm mb-6">Create meeting objectives tailored to your workflow</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {customMeetingTypes.map((type) => (
                  <div
                    key={type.id}
                    className="bg-[#2A2A2A] border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all flex flex-col"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-3 bg-[#3d96cb]/10 rounded-xl">
                        <Sparkles className="w-6 h-6 text-[#3d96cb]" />
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openCustomEdit(type)}
                          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4 text-slate-400" />
                        </button>
                        <button
                          onClick={() => deleteCustomType(type.id)}
                          className="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <h3 className="text-white font-semibold mb-1">{type.name}</h3>
                    <p className="text-slate-400 text-sm flex-grow">
                      {type.description || 'No description'}
                    </p>

                    {/* Badges - pushed to bottom */}
                    <div className="mt-4">
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          type.isExternal
                            ? 'bg-blue-500/20 text-blue-300'
                            : 'bg-[#F0EBE3]/20 text-[#F0EBE3]'
                        }`}>
                          {type.isExternal ? (
                            <span className="inline-flex items-center gap-1">
                              <Globe className="w-3 h-3" /> External
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3 h-3" /> Internal
                            </span>
                          )}
                        </span>
                        {type.attendeeRoles.length > 0 && (
                          <span className="text-xs px-2 py-1 bg-[#4ea8dd]/20 text-[#4ea8dd] rounded-full">
                            {type.attendeeRoles.length} roles
                          </span>
                        )}
                        {type.objectives.length > 0 && (
                          <span className="text-xs px-2 py-1 bg-amber-500/20 text-amber-300 rounded-full">
                            {type.objectives.length} objectives
                          </span>
                        )}
                      </div>

                      {/* Preview roles */}
                      {type.attendeeRoles.length > 0 && (
                        <div className="text-xs text-slate-500">
                          Roles: {type.attendeeRoles.slice(0, 2).join(', ')}
                          {type.attendeeRoles.length > 2 && ` +${type.attendeeRoles.length - 2}`}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2A2A2A] border border-white/10 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
              {/* Name */}
              {!editingStandardId && (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Customer Discovery Call"
                    className="w-full px-4 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-[#3d96cb] focus:outline-none"
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
                  className="w-full px-4 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-[#3d96cb] focus:outline-none resize-none"
                />
              </div>

              {/* Internal/External Toggle */}
              {!editingStandardId && (
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Meeting Context</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, isExternal: false }))}
                      className={`flex-1 px-4 py-3 rounded-lg border flex items-center justify-center gap-2 transition-colors ${
                        !formData.isExternal
                          ? 'border-[#3d96cb] bg-[#3d96cb]/20 text-white'
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
                          ? 'border-[#3d96cb] bg-[#3d96cb]/20 text-white'
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
                    className="flex-1 px-3 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 text-sm focus:border-[#3d96cb] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addRole}
                    className="px-3 py-2 bg-[#4ea8dd] text-white rounded-lg hover:bg-[#3d96cb] transition-colors"
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
                      <Target className="w-4 h-4 text-[#F0EBE3] flex-shrink-0" />
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
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addObjective())}
                    placeholder="Add objective (e.g., Identify pain points)"
                    className="flex-1 px-3 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 text-sm focus:border-[#3d96cb] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addObjective}
                    className="px-3 py-2 bg-[#4ea8dd] text-white rounded-lg hover:bg-[#3d96cb] transition-colors"
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
                  placeholder="Instructions for AI when preparing for this meeting objective..."
                  rows={3}
                  className="w-full px-4 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-[#3d96cb] focus:outline-none resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
              <div>
                {editingStandardId && (
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
                  className="px-4 py-2 bg-[#3d96cb] hover:bg-[#566051] text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
