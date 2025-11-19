"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { SAMPLE_EMAILS } from "@/lib/qwen-agent";

interface CalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  htmlLink?: string;
}

interface AgentAnalysisResult {
  shouldCreateEvent: boolean;
  event?: any;
  reasoning?: string;
  eventCreated?: boolean;
}

export default function CalendarTest() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [needsReauth, setNeedsReauth] = useState(false);
  
  // Form state
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");

  // LLM Agent state
  const [emailInput, setEmailInput] = useState("");
  const [selectedSample, setSelectedSample] = useState<keyof typeof SAMPLE_EMAILS | "">("");
  const [agentResult, setAgentResult] = useState<AgentAnalysisResult | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);

  const fetchEvents = async () => {
    setLoading(true);
    setMessage("");
    setNeedsReauth(false);
    try {
      const res = await fetch("/api/calendar");
      const data = await res.json();
      
      if (data.needsReauth) {
        setNeedsReauth(true);
        setMessage("🔐 " + data.details);
      } else if (data.success) {
        setEvents(data.events || []);
        setMessage(`✓ Loaded ${data.events?.length || 0} upcoming events`);
      } else {
        setMessage("⚠ " + (data.error || "Failed to fetch events"));
      }
    } catch (error) {
      setMessage("⚠ Error fetching events: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const createTestEvent = async () => {
    setLoading(true);
    setMessage("");
    setNeedsReauth(false);
    
    // Create a test event 1 hour from now, lasting 30 minutes
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 minutes later

    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: "🧪 Test Event from Alibaba Hackathon",
          description: "This event was created automatically via the Google Calendar API integration!",
          location: "Virtual",
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      });

      const data = await res.json();
      
      if (data.needsReauth) {
        setNeedsReauth(true);
        setMessage("🔐 " + data.details);
      } else if (data.success) {
        setMessage("✓ Test event created successfully! Check your Google Calendar.");
        fetchEvents(); // Refresh the list
      } else {
        setMessage("⚠ " + (data.error || "Failed to create event"));
      }
    } catch (error) {
      setMessage("⚠ Error creating event: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const createCustomEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setNeedsReauth(false);

    if (!summary || !startDate || !startTime || !endDate || !endTime) {
      setMessage("⚠ Please fill in all required fields");
      setLoading(false);
      return;
    }

    const start = new Date(`${startDate}T${startTime}`).toISOString();
    const end = new Date(`${endDate}T${endTime}`).toISOString();

    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          description,
          location,
          start,
          end,
        }),
      });

      const data = await res.json();
      
      if (data.needsReauth) {
        setNeedsReauth(true);
        setMessage("🔐 " + data.details);
      } else if (data.success) {
        setMessage("✓ Event created successfully!");
        // Clear form
        setSummary("");
        setDescription("");
        setLocation("");
        setStartDate("");
        setStartTime("");
        setEndDate("");
        setEndTime("");
        fetchEvents(); // Refresh the list
      } else {
        setMessage("⚠ " + (data.error || "Failed to create event"));
      }
    } catch (error) {
      setMessage("⚠ Error: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const analyzeEmailWithAgent = async (autoCreate: boolean = false) => {
    if (!emailInput.trim()) {
      setMessage("⚠ Please enter email content");
      return;
    }

    setAgentLoading(true);
    setAgentResult(null);
    setMessage("");

    try {
      const res = await fetch("/api/calendar/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailContent: emailInput,
          autoCreate,
        }),
      });

      const data = await res.json();

      if (data.needsReauth) {
        setNeedsReauth(true);
        setMessage("🔐 " + data.details);
      } else if (data.success) {
        setAgentResult(data);
        
        if (data.eventCreated) {
          setMessage("✓ Event analyzed and created successfully!");
          fetchEvents(); // Refresh the events list
        } else if (data.shouldCreateEvent) {
          setMessage("✓ Event extracted successfully! Review and create manually.");
        } else {
          setMessage("ℹ No event detected in the email.");
        }
      } else {
        setMessage("⚠ " + (data.error || "Failed to analyze email"));
      }
    } catch (error) {
      setMessage("⚠ Error: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setAgentLoading(false);
    }
  };

  const loadSampleEmail = (sample: keyof typeof SAMPLE_EMAILS) => {
    setSelectedSample(sample);
    setEmailInput(SAMPLE_EMAILS[sample]);
    setAgentResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Re-auth Notice Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">
              📌 First Time Setup Required
            </h3>
            <div className="mt-2 text-sm text-blue-700 dark:text-blue-400">
              <p>
                If you haven't granted Calendar permissions yet, you'll need to:
              </p>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>Click "Sign Out & Re-authenticate" below if you see a permission error</li>
                <li>Sign in again with your Google account</li>
                <li>Grant Calendar permissions when prompted</li>
                <li>Come back to this page and test again!</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          📅 Google Calendar Integration Test
        </h2>

        {message && (
          <div className={`mb-4 p-4 rounded-lg ${
            message.startsWith("✓") 
              ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300" 
              : message.startsWith("🔐")
              ? "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300"
              : "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300"
          }`}>
            <div className="flex items-start justify-between">
              <p>{message}</p>
              {needsReauth && (
                <button
                  onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                  className="ml-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all text-sm font-medium whitespace-nowrap"
                >
                  Sign Out & Re-authenticate
                </button>
              )}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex gap-4">
            <button
              onClick={fetchEvents}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Loading..." : "📋 Fetch My Events"}
            </button>

            <button
              onClick={createTestEvent}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Creating..." : "🧪 Create Test Event"}
            </button>
          </div>

          {/* Events List */}
          {events.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Upcoming Events ({events.length})
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {event.summary || "Untitled Event"}
                        </h4>
                        {event.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {event.description}
                          </p>
                        )}
                        {event.location && (
                          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                            📍 {event.location}
                          </p>
                        )}
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                          🕐 {event.start?.dateTime 
                            ? new Date(event.start.dateTime).toLocaleString()
                            : event.start?.date}
                        </p>
                      </div>
                      {event.htmlLink && (
                        <a
                          href={event.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-4 text-indigo-600 hover:text-indigo-700 text-sm"
                        >
                          View →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LLM Calendar Agent Section */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            🤖 AI Calendar Agent (Qwen Model)
          </h3>
          <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 px-3 py-1 rounded-full">
            Test Mode
          </span>
        </div>
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          The AI agent analyzes email content and automatically extracts calendar event information.
        </p>

        {/* Sample Email Selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            📧 Load Sample Email
          </label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SAMPLE_EMAILS) as Array<keyof typeof SAMPLE_EMAILS>).map((key) => (
              <button
                key={key}
                onClick={() => loadSampleEmail(key)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                  selectedSample === key
                    ? "bg-purple-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Email Input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Email Content
          </label>
          <textarea
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
            placeholder="Paste email content here or select a sample above..."
            rows={8}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => analyzeEmailWithAgent(false)}
            disabled={agentLoading || !emailInput.trim()}
            className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
          >
            {agentLoading ? "🔄 Analyzing..." : "🔍 Analyze Email"}
          </button>
          <button
            onClick={() => analyzeEmailWithAgent(true)}
            disabled={agentLoading || !emailInput.trim()}
            className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
          >
            {agentLoading ? "🔄 Creating..." : "⚡ Auto-Create Event"}
          </button>
        </div>

        {/* Agent Result */}
        {agentResult && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
              🎯 Agent Analysis Result
            </h4>
            
            {agentResult.reasoning && (
              <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Reasoning:</strong> {agentResult.reasoning}
                </p>
              </div>
            )}

            {agentResult.shouldCreateEvent && agentResult.event ? (
              <div className="space-y-2">
                <div className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                  <h5 className="font-medium text-gray-900 dark:text-white text-sm mb-2">
                    📅 Extracted Event Details:
                  </h5>
                  <dl className="grid grid-cols-1 gap-2 text-sm">
                    <div>
                      <dt className="font-medium text-gray-700 dark:text-gray-300">Title:</dt>
                      <dd className="text-gray-900 dark:text-white mt-0.5">{agentResult.event.title}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-700 dark:text-gray-300">Description:</dt>
                      <dd className="text-gray-900 dark:text-white mt-0.5">{agentResult.event.description}</dd>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <dt className="font-medium text-gray-700 dark:text-gray-300">Start:</dt>
                        <dd className="text-gray-900 dark:text-white mt-0.5">
                          {new Date(agentResult.event.start_time).toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-700 dark:text-gray-300">End:</dt>
                        <dd className="text-gray-900 dark:text-white mt-0.5">
                          {new Date(agentResult.event.end_time).toLocaleString()}
                        </dd>
                      </div>
                    </div>
                    {agentResult.event.location && (
                      <div>
                        <dt className="font-medium text-gray-700 dark:text-gray-300">Location:</dt>
                        <dd className="text-gray-900 dark:text-white mt-0.5">{agentResult.event.location}</dd>
                      </div>
                    )}
                    {agentResult.event.attendees && agentResult.event.attendees.length > 0 && (
                      <div>
                        <dt className="font-medium text-gray-700 dark:text-gray-300">Attendees:</dt>
                        <dd className="text-gray-900 dark:text-white mt-0.5">
                          {agentResult.event.attendees.join(", ")}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
                
                {agentResult.eventCreated && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                    <p className="text-sm text-green-800 dark:text-green-300 font-medium">
                      ✅ Event has been created in your Google Calendar!
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  ℹ️ No calendar event detected in this email.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Custom Event Form */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          ➕ Create Custom Event
        </h3>
        <form onSubmit={createCustomEvent} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Event Title *
            </label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Team Meeting"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Discuss project progress..."
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Conference Room A / Zoom Link"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Time *
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                End Date *
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                End Time *
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? "Creating Event..." : "✨ Create Event"}
          </button>
        </form>
      </div>
    </div>
  );
}
