import { createLogger } from '../core/logger';

const logger = createLogger('Performance');

interface TimingEntry {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

interface PerformanceMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
  cpuUsage: NodeJS.CpuUsage;
}

const activeTimings = new Map<string, TimingEntry>();
const completedTimings: TimingEntry[] = [];
const MAX_COMPLETED_TIMINGS = 100;

let lastCpuUsage: NodeJS.CpuUsage | null = null;

// Start timing an operation
export function startTiming(name: string, metadata?: Record<string, unknown>): string {
  const id = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  activeTimings.set(id, {
    name,
    startTime: performance.now(),
    metadata,
  });
  return id;
}

// End timing and log result
export function endTiming(id: string): number | null {
  const entry = activeTimings.get(id);
  if (!entry) {
    logger.warn('Timing not found', { id });
    return null;
  }

  entry.endTime = performance.now();
  entry.duration = entry.endTime - entry.startTime;
  activeTimings.delete(id);

  // Store completed timing
  completedTimings.push(entry);
  if (completedTimings.length > MAX_COMPLETED_TIMINGS) {
    completedTimings.shift();
  }

  // Log slow operations (> 100ms)
  if (entry.duration > 100) {
    logger.info('Slow operation detected', {
      name: entry.name,
      duration: `${entry.duration.toFixed(2)}ms`,
      ...entry.metadata,
    });
  }

  return entry.duration;
}

// Decorator-style timing wrapper
export async function withTiming<T>(
  name: string,
  fn: () => T | Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const id = startTiming(name, metadata);
  try {
    return await fn();
  } finally {
    endTiming(id);
  }
}

// Get current memory usage
export function getMemoryUsage(): NodeJS.MemoryUsage {
  return process.memoryUsage();
}

// Get formatted memory stats
export function getMemoryStats(): Record<string, string> {
  const usage = getMemoryUsage();
  const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

  return {
    heapUsed: formatMB(usage.heapUsed),
    heapTotal: formatMB(usage.heapTotal),
    external: formatMB(usage.external),
    rss: formatMB(usage.rss),
  };
}

// Get CPU usage since last call
export function getCpuUsage(): { user: number; system: number } {
  const current = process.cpuUsage(lastCpuUsage || undefined);
  lastCpuUsage = process.cpuUsage();

  return {
    user: current.user / 1000, // Convert to ms
    system: current.system / 1000,
  };
}

// Get all performance metrics
export function getPerformanceMetrics(): PerformanceMetrics {
  return {
    memoryUsage: getMemoryUsage(),
    uptime: process.uptime(),
    cpuUsage: process.cpuUsage(),
  };
}

// Get recent timings summary
export function getTimingsSummary(): Record<string, { count: number; avgMs: number; maxMs: number }> {
  const summary: Record<string, { count: number; totalMs: number; maxMs: number }> = {};

  for (const entry of completedTimings) {
    if (!entry.duration) continue;

    if (!summary[entry.name]) {
      summary[entry.name] = { count: 0, totalMs: 0, maxMs: 0 };
    }

    summary[entry.name].count++;
    summary[entry.name].totalMs += entry.duration;
    summary[entry.name].maxMs = Math.max(summary[entry.name].maxMs, entry.duration);
  }

  const result: Record<string, { count: number; avgMs: number; maxMs: number }> = {};
  for (const [name, data] of Object.entries(summary)) {
    result[name] = {
      count: data.count,
      avgMs: Math.round(data.totalMs / data.count),
      maxMs: Math.round(data.maxMs),
    };
  }

  return result;
}

// Log current performance state
export function logPerformanceSnapshot(): void {
  const memory = getMemoryStats();
  const cpu = getCpuUsage();
  const uptime = process.uptime();

  logger.info('Performance snapshot', {
    uptime: `${Math.round(uptime)}s`,
    memory,
    cpu: {
      userMs: cpu.user.toFixed(2),
      systemMs: cpu.system.toFixed(2),
    },
  });
}

// Start periodic performance logging (dev mode)
let performanceInterval: NodeJS.Timeout | null = null;

export function startPerformanceLogging(intervalMs = 60000): void {
  if (performanceInterval) return;

  performanceInterval = setInterval(() => {
    logPerformanceSnapshot();
  }, intervalMs);

  logger.info('Performance logging started', { intervalMs });
}

export function stopPerformanceLogging(): void {
  if (performanceInterval) {
    clearInterval(performanceInterval);
    performanceInterval = null;
    logger.info('Performance logging stopped');
  }
}
