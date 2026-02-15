import React, { useState, useEffect, useRef } from 'react';
import { Users, ChevronRight, Mail, Linkedin, X } from 'lucide-react';
import type { Person } from '@shared/types';

interface AttendeesListProps {
  attendeeEmails: string[];
  organizationName?: string;
}

export default function AttendeesList({ attendeeEmails, organizationName }: AttendeesListProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [attendees, setAttendees] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Load attendees when popover opens
  useEffect(() => {
    if (isOpen && attendeeEmails.length > 0 && attendees.length === 0) {
      loadAttendees();
    }
  }, [isOpen]);

  const loadAttendees = async () => {
    setIsLoading(true);
    try {
      const attendeesList: Person[] = [];
      for (const email of attendeeEmails) {
        try {
          const person = await window.kakarot.people.get(email);
          if (person) {
            attendeesList.push(person);
          } else {
            // If person not found in database, create a stub with email
            attendeesList.push({
              email,
              name: email.split('@')[0],
              lastMeetingAt: new Date(),
              meetingCount: 0,
              totalDuration: 0,
              organization: '',
              notes: '',
            });
          }
        } catch (error) {
          console.error(`Failed to load attendee ${email}:`, error);
          // Still add them with email as fallback
          attendeesList.push({
            email,
            name: email.split('@')[0],
            lastMeetingAt: new Date(),
            meetingCount: 0,
            totalDuration: 0,
            organization: '',
            notes: '',
          });
        }
      }
      setAttendees(attendeesList);
    } catch (error) {
      console.error('Failed to load attendees:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = (person: Person) => {
    if (person.name) {
      return person.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return person.email[0].toUpperCase();
  };

  const getAvatarColor = (email: string) => {
    const colors = [
      'bg-blue-500',
      'bg-[#F0EBE3]',
      'bg-[#C17F3E]',
      'bg-pink-500',
      'bg-[#C17F3E]',
      'bg-yellow-500',
      'bg-red-500',
      'bg-teal-500',
    ];
    const hash = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/60 dark:bg-[#161616]/60 border border-slate-200 dark:border-[#2A2A2A] hover:bg-white/80 dark:hover:bg-[#2A2A2A]/80 transition text-slate-600 dark:text-slate-400 whitespace-nowrap"
      >
        <Users className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm">
          {attendeeEmails.length} {attendeeEmails.length === 1 ? 'Participant' : 'Participants'}
        </span>
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute left-0 right-0 top-full mt-2 w-96 bg-[#0C0C0C] dark:bg-[#0C0C0C] rounded-xl border border-slate-800 dark:border-[#2A2A2A] shadow-2xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Participants</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-200 transition rounded hover:bg-[#1E1E1E]/50"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Organization Section */}
          {organizationName && (
            <div className="px-4 py-3 border-b border-slate-800">
              <p className="text-sm text-slate-400 font-medium">{organizationName}</p>
            </div>
          )}

          {/* Attendees List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-6 text-center">
                <div className="inline-block animate-spin">
                  <div className="w-5 h-5 border-2 border-slate-700 border-t-[#C17F3E] rounded-full" />
                </div>
                <p className="text-slate-400 text-sm mt-2">Loading attendees...</p>
              </div>
            ) : attendees.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">
                No attendee details available
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {attendees.map((person) => (
                  <div key={person.email} className="p-4 hover:bg-[#1E1E1E]/50 transition flex items-center justify-between group">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-full ${getAvatarColor(person.email)} flex items-center justify-center text-white font-semibold text-sm flex-shrink-0`}>
                        {getInitials(person)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-white truncate">
                          {person.name || person.email}
                        </h4>
                        {person.name && (
                          <p className="text-xs text-slate-400 truncate">{person.email}</p>
                        )}
                        {person.organization && (
                          <p className="text-xs text-slate-500 truncate mt-0.5">{person.organization}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <button
                        title="Email"
                        className="p-2 rounded hover:bg-[#2A2A2A] text-slate-400 hover:text-white transition opacity-0 group-hover:opacity-100"
                      >
                        <Mail className="w-4 h-4" />
                      </button>
                      <button
                        title="LinkedIn"
                        className="p-2 rounded hover:bg-[#2A2A2A] text-slate-400 hover:text-white transition opacity-0 group-hover:opacity-100"
                      >
                        <Linkedin className="w-4 h-4" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
