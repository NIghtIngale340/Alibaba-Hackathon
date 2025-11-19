# Alibaba Hackathon - Smart Calendar System

This is a [Next.js](https://nextjs.org) project featuring AI-powered calendar automation using Alibaba's Qwen LLM.

## 🚀 Features

- **🤖 AI Calendar Agent**: Automatically extracts calendar events from email content using Qwen LLM
- **📅 Google Calendar Integration**: Seamless integration with Google Calendar API
- **🔐 OAuth Authentication**: Secure authentication via NextAuth.js
- **☁️ Alibaba Cloud Storage**: OSS integration for file management
- **✨ Modern UI**: Built with Next.js 16, React 19, and Tailwind CSS

## 🛠️ Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Google OAuth (for Calendar access)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret

# Alibaba Cloud Qwen API (for AI Calendar Agent)
QWEN_API_KEY=your_qwen_api_key
```

**Get your Qwen API key**: [https://dashscope.aliyun.com/](https://dashscope.aliyun.com/)

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Test the AI Calendar Agent

1. Sign in with your Google account
2. Navigate to `/dashboard`
3. Scroll to the "🤖 AI Calendar Agent" section
4. Try the sample emails or paste your own
5. Click "Analyze Email" to see extracted event details
6. Click "Auto-Create Event" to create the event in your Google Calendar

## 📖 Documentation

- **[Calendar Agent Guide](./CALENDAR_AGENT_README.md)**: Comprehensive documentation for the AI Calendar Agent feature
  - How the agent works
  - Sample email scenarios
  - API reference
  - Customization options
  - Integration guide

## 🎯 Project Structure

```
alibaba-hackerz/
├── app/
│   ├── api/
│   │   ├── calendar/
│   │   │   ├── route.ts          # Google Calendar API endpoints
│   │   │   └── agent/
│   │   │       └── route.ts      # AI Calendar Agent endpoint
│   │   └── auth/                 # NextAuth configuration
│   └── dashboard/
│       ├── page.tsx              # Dashboard page
│       └── CalendarTest.tsx      # Calendar testing interface
├── lib/
│   ├── auth.ts                   # Authentication logic
│   ├── oss.ts                    # Alibaba Cloud OSS
│   └── qwen-agent.ts            # Qwen AI Calendar Agent
└── types/
    └── next-auth.d.ts           # TypeScript definitions
```

## 🧪 Testing the Calendar Agent

The system includes 5 sample email scenarios:

1. **Meeting**: Team standup with date, time, and location
2. **Call**: Quick sync with inferred duration
3. **Appointment**: Doctor's appointment with precise details
4. **Deadline**: Project deadline as all-day event
5. **No Event**: Informational email (should not create event)

## 🔧 Technologies Used

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Authentication**: NextAuth.js with Google OAuth
- **AI Model**: Alibaba Qwen (qwen-plus)
- **Calendar API**: Google Calendar API v3
- **Cloud Storage**: Alibaba Cloud OSS

## 📝 Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## 🚀 Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 📄 License

Part of the Alibaba Hackathon 2025 project.

