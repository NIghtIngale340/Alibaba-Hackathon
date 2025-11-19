import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { 
  createTask,
  delegateTask,
  executeTask,
  getTaskStatus,
  getPendingTasks 
} from "@/lib/action-delegator";

/**
 * POST /api/delegate
 * Create and delegate a task to appropriate agent
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { type, data, priority } = body;

    if (!type || !data) {
      return NextResponse.json(
        { error: "Missing required fields: type, data" },
        { status: 400 }
      );
    }

    // Create the task
    const task = createTask(type, data, priority || 'normal');

    // If this is an outbound email task, attach the user's OAuth tokens
    // so the outbound agent can call Gmail API on behalf of the user.
    if (type === 'send_email' || type === 'send_reply') {
      // session.accessToken and session.refreshToken come from next-auth callbacks
      (task.data as any)._auth = {
        accessToken: (session as any).accessToken,
        refreshToken: (session as any).refreshToken,
      };
    }

    // Delegate immediately
    const result = await delegateTask(task);

    return NextResponse.json({
      success: true,
      task,
      result,
    });
  } catch (error) {
    console.error("Delegation error:", error);
    return NextResponse.json(
      { 
        error: "Failed to delegate task",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/delegate?taskId=xxx
 * Get task status
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (taskId) {
      // Get specific task
      const task = getTaskStatus(taskId);

      if (!task) {
        return NextResponse.json(
          { error: "Task not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        task,
      });
    } else {
      // Get all pending tasks
      const tasks = getPendingTasks();

      return NextResponse.json({
        success: true,
        tasks,
      });
    }
  } catch (error) {
    console.error("Get task error:", error);
    return NextResponse.json(
      { 
        error: "Failed to get task",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
