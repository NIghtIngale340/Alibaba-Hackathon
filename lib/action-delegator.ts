/**
 * Action Delegation Layer - Mobile Version
 * Routes tasks to appropriate agents and manages execution flow
 */

import { ExtractedEventData } from './email-handler';

export type AgentType = 'calendar' | 'outbound' | 'email' | 'voice';

export interface Task {
  taskId: string;
  type: 'create_event' | 'send_email' | 'update_event' | 'delete_event' | 'send_reply';
  agent: AgentType;
  data: any;
  priority: 'urgent' | 'normal' | 'low';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
}

export interface DelegationResult {
  success: boolean;
  taskId: string;
  agent: AgentType;
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface AgentCapability {
  agent: AgentType;
  canHandle: (task: Task) => boolean;
  execute: (task: Task) => Promise<DelegationResult>;
}

// Task queue (use AsyncStorage in production for persistence)
const taskQueue = new Map<string, Task>();
const agentRegistry = new Map<AgentType, AgentCapability>();

/**
 * Register an agent with its capabilities
 */
export function registerAgent(capability: AgentCapability): void {
  agentRegistry.set(capability.agent, capability);
  console.log(`Agent registered: ${capability.agent}`);
}

/**
 * Create a new task
 */
export function createTask(
  type: Task['type'],
  data: any,
  priority: Task['priority'] = 'normal'
): Task {
  const taskId = generateTaskId();
  
  // Determine which agent should handle this
  const agent = determineAgent(type);
  
  const task: Task = {
    taskId,
    type,
    agent,
    data,
    priority,
    status: 'pending',
    createdAt: new Date(),
  };
  
  taskQueue.set(taskId, task);
  return task;
}

/**
 * Delegate task to appropriate agent
 */
export async function delegateTask(task: Task): Promise<DelegationResult> {
  const startTime = Date.now();
  
  try {
    // Update task status
    task.status = 'processing';
    taskQueue.set(task.taskId, task);
    
    // Get the agent capability
    const capability = agentRegistry.get(task.agent);
    
    if (!capability) {
      throw new Error(`No agent registered for type: ${task.agent}`);
    }
    
    // Verify agent can handle this task
    if (!capability.canHandle(task)) {
      throw new Error(`Agent ${task.agent} cannot handle task type: ${task.type}`);
    }
    
    // Execute the task
    console.log(`Delegating task ${task.taskId} to ${task.agent} agent`);
    const result = await capability.execute(task);
    
    // Update task status
    task.status = result.success ? 'completed' : 'failed';
    task.completedAt = new Date();
    task.result = result.result;
    task.error = result.error;
    taskQueue.set(task.taskId, task);
    
    const executionTime = Date.now() - startTime;
    
    return {
      ...result,
      executionTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Update task as failed
    task.status = 'failed';
    task.completedAt = new Date();
    task.error = errorMessage;
    taskQueue.set(task.taskId, task);
    
    return {
      success: false,
      taskId: task.taskId,
      agent: task.agent,
      error: errorMessage,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Execute task and handle result
 */
export async function executeTask(taskId: string): Promise<DelegationResult> {
  const task = taskQueue.get(taskId);
  
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  
  return await delegateTask(task);
}

/**
 * Determine which agent should handle a task type
 */
function determineAgent(taskType: Task['type']): AgentType {
  const agentMap: Record<Task['type'], AgentType> = {
    'create_event': 'calendar',
    'update_event': 'calendar',
    'delete_event': 'calendar',
    'send_email': 'outbound',
    'send_reply': 'outbound',
  };
  
  return agentMap[taskType] || 'calendar';
}

/**
 * Get task status
 */
export function getTaskStatus(taskId: string): Task | undefined {
  return taskQueue.get(taskId);
}

/**
 * Get all pending tasks
 */
export function getPendingTasks(): Task[] {
  return Array.from(taskQueue.values())
    .filter(task => task.status === 'pending')
    .sort((a, b) => {
      // Sort by priority
      const priorityOrder = { urgent: 0, normal: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
}

/**
 * Process all pending tasks
 */
export async function processPendingTasks(): Promise<DelegationResult[]> {
  const pending = getPendingTasks();
  const results: DelegationResult[] = [];
  
  for (const task of pending) {
    const result = await delegateTask(task);
    results.push(result);
  }
  
  return results;
}

/**
 * Handle error and recovery
 */
export async function handleTaskError(
  taskId: string,
  recovery: 'retry' | 'skip' | 'manual'
): Promise<DelegationResult | null> {
  const task = taskQueue.get(taskId);
  
  if (!task || task.status !== 'failed') {
    return null;
  }
  
  switch (recovery) {
    case 'retry':
      task.status = 'pending';
      task.error = undefined;
      taskQueue.set(taskId, task);
      return await delegateTask(task);
      
    case 'skip':
      task.status = 'completed';
      task.result = { skipped: true };
      taskQueue.set(taskId, task);
      return {
        success: true,
        taskId,
        agent: task.agent,
        result: { skipped: true },
      };
      
    case 'manual':
      return {
        success: false,
        taskId,
        agent: task.agent,
        error: 'Awaiting manual intervention',
      };
      
    default:
      return null;
  }
}

/**
 * Generate unique task ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Clear completed tasks older than specified minutes
 */
export function clearCompletedTasks(olderThanMinutes: number = 60): void {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  
  for (const [taskId, task] of taskQueue.entries()) {
    if (
      task.status === 'completed' &&
      task.completedAt &&
      task.completedAt < cutoff
    ) {
      taskQueue.delete(taskId);
    }
  }
}

// ============================================================================
// Actual Agent Implementations
// ============================================================================

import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getUpcomingEvents,
} from './calendar-agent';

import {
  sendEmail,
  draftReply,
  generateAIReply,
} from './outbound-agent';

/**
 * Calendar Agent Implementation - Connected to Google Calendar API
 */
export const calendarAgentCapability: AgentCapability = {
  agent: 'calendar',
  
  canHandle: (task: Task) => {
    return ['create_event', 'update_event', 'delete_event'].includes(task.type);
  },
  
  execute: async (task: Task): Promise<DelegationResult> => {
    try {
      if (task.type === 'create_event') {
        const eventData = task.data as ExtractedEventData;
        
        // Validate required fields
        const required = ['title', 'description', 'date', 'start_time', 'end_time'];
        for (const field of required) {
          if (!eventData[field as keyof ExtractedEventData]) {
            throw new Error(`Missing required field: ${field}`);
          }
        }
        
        // Check for conflicts with existing events
        const upcoming = await getUpcomingEvents(50);
        const newStart = new Date(eventData.start_time);
        const newEnd = new Date(eventData.end_time);
        
        const conflicts = upcoming.filter(event => {
          const existingStart = new Date(event.start.dateTime);
          const existingEnd = new Date(event.end.dateTime);
          
          // Check if times overlap
          return (
            (newStart >= existingStart && newStart < existingEnd) ||
            (newEnd > existingStart && newEnd <= existingEnd) ||
            (newStart <= existingStart && newEnd >= existingEnd)
          );
        });
        
        if (conflicts.length > 0) {
          console.warn('⚠️ Scheduling conflict detected:', {
            newEvent: eventData.title,
            conflicts: conflicts.map(e => ({ title: e.summary, start: e.start.dateTime })),
          });
        }
        
        // Create the event
        const result = await createCalendarEvent(eventData);
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to create calendar event');
        }
        
        return {
          success: true,
          taskId: task.taskId,
          agent: 'calendar',
          result: {
            eventId: result.eventId,
            event: result.event,
            hasConflicts: conflicts.length > 0,
            conflicts: conflicts.map(e => ({ title: e.summary, start: e.start.dateTime })),
          },
        };
      }
      
      if (task.type === 'update_event') {
        const { eventId, updates } = task.data;
        const result = await updateCalendarEvent(eventId, updates);
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to update calendar event');
        }
        
        return {
          success: true,
          taskId: task.taskId,
          agent: 'calendar',
          result: {
            eventId: result.eventId,
            event: result.event,
          },
        };
      }
      
      if (task.type === 'delete_event') {
        const { eventId } = task.data;
        const result = await deleteCalendarEvent(eventId);
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to delete calendar event');
        }
        
        return {
          success: true,
          taskId: task.taskId,
          agent: 'calendar',
          result: {
            eventId,
            deleted: true,
          },
        };
      }
      
      throw new Error(`Unsupported task type: ${task.type}`);
    } catch (error) {
      return {
        success: false,
        taskId: task.taskId,
        agent: 'calendar',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

/**
 * Outbound Email Agent Implementation - Connected to Gmail API
 */
export const outboundAgentCapability: AgentCapability = {
  agent: 'outbound',
  
  canHandle: (task: Task) => {
    return ['send_email', 'send_reply'].includes(task.type);
  },
  
  execute: async (task: Task): Promise<DelegationResult> => {
    try {
      if (task.type === 'send_email') {
        const draft = task.data;
        const result = await sendEmail(draft);
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to send email');
        }
        
        return {
          success: true,
          taskId: task.taskId,
          agent: 'outbound',
          result: {
            messageId: result.messageId,
            threadId: result.threadId,
          },
        };
      }
      
      if (task.type === 'send_reply') {
        const { originalEmail, replyContent, userEmail, useAI, tone, qwenApiKey } = task.data;
        
        let finalReply = replyContent;
        
        // Generate AI reply if requested
        if (useAI && qwenApiKey) {
          const userContext = userEmail || '';
          finalReply = await generateAIReply(
            originalEmail.body,
            userContext,
            qwenApiKey,
            tone || 'professional'
          );
        }
        
        // Draft the reply
        const draft = await draftReply(originalEmail, finalReply, userEmail);
        
        // Send the reply
        const result = await sendEmail(draft);
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to send reply');
        }
        
        return {
          success: true,
          taskId: task.taskId,
          agent: 'outbound',
          result: {
            messageId: result.messageId,
            threadId: result.threadId,
            replyText: finalReply,
            aiGenerated: useAI,
          },
        };
      }
      
      throw new Error(`Unsupported task type: ${task.type}`);
    } catch (error) {
      return {
        success: false,
        taskId: task.taskId,
        agent: 'outbound',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

// Register actual agents with full implementation
registerAgent(calendarAgentCapability);
registerAgent(outboundAgentCapability);
