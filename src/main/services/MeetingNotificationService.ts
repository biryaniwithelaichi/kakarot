import { Notification, shell } from 'electron';
import { CalendarService } from './CalendarService';
import { createLogger } from '../core/logger';

const logger = createLogger('MeetingNotificationService');

interface PendingNotification {
  eventId: string;
  timeout: NodeJS.Timeout;
}

export class MeetingNotificationService {
  private calendarService: CalendarService;
  private pendingNotifications: Map<string, PendingNotification> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(calendarService: CalendarService) {
    this.calendarService = calendarService;
  }

  /**
   * Start monitoring for upcoming meetings
   */
  start(): void {
    if (this.checkInterval) {
      logger.warn('Meeting notification service already started');
      return;
    }

    logger.info('Starting meeting notification service');
    
    // Check every 60 seconds for meetings starting soon to avoid rate limiting
    this.checkInterval = setInterval(() => {
      this.checkUpcomingMeetings();
    }, 60000);

    // Check immediately on start
    this.checkUpcomingMeetings();
    
    logger.info('Meeting notification service started - checking every 60 seconds');
  }

  /**
   * Stop monitoring for upcoming meetings
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all pending notifications
    for (const notification of this.pendingNotifications.values()) {
      clearTimeout(notification.timeout);
    }
    this.pendingNotifications.clear();

    logger.info('Stopped meeting notification service');
  }

  /**
   * Check for meetings starting soon and schedule notifications
   */
  private async checkUpcomingMeetings(): Promise<void> {
    try {
      const meetings = await this.calendarService.getUpcomingMeetings();
      const now = Date.now();
      const oneMinuteMs = 60 * 1000;

      if (!meetings || meetings.length === 0) {
        logger.debug('No upcoming meetings found');
        return;
      }

      logger.debug('Checking upcoming meetings', { 
        count: meetings.length,
        now: new Date(now).toLocaleTimeString()
      });

      for (const meeting of meetings) {
        // Handle both Date objects and ISO strings
        const startDate = meeting.start instanceof Date ? meeting.start : new Date(meeting.start);
        const meetingStartMs = startDate.getTime();
        const timeUntilMeeting = meetingStartMs - now;
        const timeUntilMinutes = Math.round(timeUntilMeeting / 1000 / 60);

        const withinOneMinuteWindow = timeUntilMeeting <= oneMinuteMs && timeUntilMeeting >= 0;
        const alreadyScheduled = this.pendingNotifications.has(meeting.id);

        logger.debug('Meeting check', { 
          title: meeting.title, 
          scheduledTime: startDate.toLocaleTimeString(),
          timeUntilMinutes,
          withinOneMinuteWindow,
          alreadyScheduled
        });

        // Clean up notifications for meetings that are now out of range (already started or far away)
        if (timeUntilMeeting < 0 && alreadyScheduled) {
          const notification = this.pendingNotifications.get(meeting.id);
          if (notification && notification.timeout) {
            clearTimeout(notification.timeout);
          }
          this.pendingNotifications.delete(meeting.id);
          logger.debug('Removed out-of-range notification', { 
            eventId: meeting.id, 
            title: meeting.title,
            timeUntilMinutes 
          });
          continue;
        }

        // Only notify at the 1-minute mark (or if app starts with < 60s remaining)
        if (!alreadyScheduled) {
          if (timeUntilMeeting > oneMinuteMs) {
            const delayMs = Math.max(timeUntilMeeting - oneMinuteMs, 0);
            const timeout = setTimeout(() => {
              logger.info('Showing scheduled notification (T-60s)', { title: meeting.title });
              this.showMeetingNotification(meeting);
              this.pendingNotifications.delete(meeting.id);
            }, delayMs);

            this.pendingNotifications.set(meeting.id, { eventId: meeting.id, timeout });
            logger.info('Scheduled notification', {
              eventId: meeting.id,
              title: meeting.title,
              delaySeconds: Math.round(delayMs / 1000),
            });
          } else if (withinOneMinuteWindow) {
            logger.info('Missed the 1-minute window; skipping notification', {
              title: meeting.title,
              timeUntilMinutes,
            });
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      logger.error('Failed to check upcoming meetings', { error: message });
    }
  }

  /**
   * Show a native notification for the meeting
   */
  private showMeetingNotification(meeting: any): void {
    const startDate = meeting.start instanceof Date ? meeting.start : new Date(meeting.start);
    const endDate =
      meeting.end instanceof Date
        ? meeting.end
        : meeting.end
          ? new Date(meeting.end)
          : startDate;
    const formatTime = (date: Date): string =>
      date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    const timeRange = `${formatTime(startDate)} – ${formatTime(endDate)}`;
    const truncate = (text: string, max = 60): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

    logger.debug('Creating notification', {
      title: meeting.title,
      timeRange,
      hasLocation: !!meeting.location,
    });

    const notification = new Notification({
      title: truncate(meeting.title),
      subtitle: timeRange,
      body: 'Join meeting & open Treeto',
      urgency: 'critical',
      closeButtonText: 'Dismiss',
      actions: [
        {
          type: 'button',
          text: 'Join Meeting',
        },
      ],
    });

    // Handle notification action buttons
    notification.on('action', (event: any) => {
      const actionIndex = event;
      if (actionIndex === 0) {
        logger.info('Notification action clicked (Join Meeting)', { title: meeting.title });
        this.handleJoinMeeting(meeting);
      } else {
        logger.debug('Notification action ignored', { actionIndex });
      }
    });

    notification.on('click', () => {
      // Default action on notification click
      logger.info('Notification clicked (default action)', { title: meeting.title });
      this.handleJoinMeeting(meeting);
    });

    notification.on('close', () => {
      logger.debug('Notification closed', { eventId: meeting.id });
      this.pendingNotifications.delete(meeting.id);
    });

    notification.show();
    logger.info('Showed meeting notification', {
      eventId: meeting.id,
      title: meeting.title,
      timeRange,
    });
  }

  /**
   * Handle joining the meeting
   */
  private handleJoinMeeting(meeting: any): void {
    logger.info('User clicked to join meeting', { 
      eventId: meeting.id, 
      title: meeting.title,
      hasLocation: !!meeting.location
    });

    // Open meeting link if available
    // Location might be a string or an object with a description
    let meetingUrl = '';
    if (typeof meeting.location === 'string') {
      meetingUrl = meeting.location;
    } else if (meeting.location && typeof meeting.location === 'object' && meeting.location.description) {
      meetingUrl = meeting.location.description;
    }

    if (meetingUrl && (meetingUrl.startsWith('http://') || meetingUrl.startsWith('https://'))) {
      try {
        shell.openExternal(meetingUrl);
        logger.info('Opened meeting link', { url: meetingUrl });
      } catch (err) {
        logger.error('Failed to open meeting link', { error: (err as Error).message });
      }
    } else if (meetingUrl) {
      logger.warn('Meeting location is not a valid URL', { location: meetingUrl });
    } else {
      logger.warn('No meeting location found', { eventId: meeting.id });
    }

    // Send IPC message to start recording via notification:start-recording
    // This will be received by the renderer's preload listener
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      logger.info('Starting recording from notification click', { eventId: meeting.id, title: meeting.title });
      global.mainWindow.webContents.send('notification:start-recording', {
        calendarEventId: meeting.id,
        calendarEventTitle: meeting.title,
        calendarEventAttendees: meeting.attendees || [],
        calendarEventStart: meeting.start instanceof Date ? meeting.start.toISOString() : meeting.start,
        calendarEventEnd: meeting.end instanceof Date ? meeting.end.toISOString() : meeting.end,
        calendarProvider: meeting.provider || 'google',
      });
    } else {
      logger.error('Main window not available for IPC', { mainWindowExists: !!global.mainWindow });
    }
  }
}
