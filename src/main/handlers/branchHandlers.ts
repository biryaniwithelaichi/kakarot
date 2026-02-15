import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/ipcChannels';
import { getContainer } from '../core/container';
import { createLogger } from '../core/logger';
import type { Branch } from '@shared/types';

const logger = createLogger('BranchHandlers');

export function registerBranchHandlers(): void {
  const { branchRepo } = getContainer();

  // List all branches
  ipcMain.handle(IPC_CHANNELS.BRANCHES_LIST, async () => {
    logger.debug('Listing all branches');
    try {
      const branches = branchRepo.listAll();
      logger.info('Listed branches', { count: branches.length });
      return branches;
    } catch (error) {
      logger.error('Failed to list branches', { error: (error as Error).message });
      throw error;
    }
  });

  // Get branch by ID
  ipcMain.handle(IPC_CHANNELS.BRANCHES_GET, async (_, id: string) => {
    logger.debug('Getting branch by ID', { id });
    try {
      const branch = branchRepo.getById(id);
      if (!branch) {
        logger.warn('Branch not found', { id });
      }
      return branch;
    } catch (error) {
      logger.error('Failed to get branch', { error: (error as Error).message, id });
      throw error;
    }
  });

  // Create a new branch
  ipcMain.handle(IPC_CHANNELS.BRANCHES_CREATE, async (_, branchData: Omit<Branch, 'createdAt' | 'updatedAt'>) => {
    logger.debug('Creating new branch', { name: branchData.name });
    try {
      const branch = branchRepo.create(branchData);
      logger.info('Created branch', { id: branch.id, name: branch.name });
      return branch;
    } catch (error) {
      logger.error('Failed to create branch', { error: (error as Error).message });
      throw error;
    }
  });

  // Update a branch
  ipcMain.handle(IPC_CHANNELS.BRANCHES_UPDATE, async (_, id: string, updates: Partial<Omit<Branch, 'id' | 'createdAt' | 'updatedAt'>>) => {
    logger.debug('Updating branch', { id });
    try {
      const branch = branchRepo.update(id, updates);
      if (!branch) {
        logger.warn('Branch not found for update', { id });
        throw new Error('Branch not found');
      }
      logger.info('Updated branch', { id, name: branch.name });
      return branch;
    } catch (error) {
      logger.error('Failed to update branch', { error: (error as Error).message, id });
      throw error;
    }
  });

  // Delete a branch
  ipcMain.handle(IPC_CHANNELS.BRANCHES_DELETE, async (_, id: string) => {
    logger.debug('Deleting branch', { id });
    try {
      const deleted = branchRepo.delete(id);
      if (!deleted) {
        logger.warn('Branch not found for deletion', { id });
        throw new Error('Branch not found');
      }
      logger.info('Deleted branch', { id });
      return true;
    } catch (error) {
      logger.error('Failed to delete branch', { error: (error as Error).message, id });
      throw error;
    }
  });

  logger.info('Branch handlers registered');
}
