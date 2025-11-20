"""
FastAPI Priority Agent Service
Real-time email classification with Gmail integration
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict
import re
import os
import sys
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from parent directory's .env file
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(parent_dir, '.env')
load_dotenv(env_path)
print(f"📂 Loading .env from: {env_path}")

# Add services to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.email_sync_service import EmailSyncService

app = FastAPI(title="Priority Agent API", version="2.0.0")

# CORS - Allow mobile app access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "*"],  # Allow all for mobile
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize email sync service
QWEN_API_KEY = os.getenv('EXPO_PUBLIC_QWEN_API_KEY', '')
email_sync_service = None

if QWEN_API_KEY:
    try:
        email_sync_service = EmailSyncService(QWEN_API_KEY, sync_interval=30)
        # Start background sync on startup
        email_sync_service.start_continuous_sync()
        print("✅ Email sync service initialized and running")
    except Exception as e:
        print(f"⚠️ Failed to initialize email sync: {e}")
        print("   API will return empty queues until Gmail is configured")
else:
    print("⚠️ QWEN_API_KEY not found - classification features disabled")

# Request/Response Models
class EmailInput(BaseModel):
    sender: str
    subject: str
    body: str
    user_email: Optional[str] = "user@company.com"

class TrustScore(BaseModel):
    overall: float
    sender_reputation: float
    domain_authentication: float
    behavioral_pattern: float
    content_analysis: float
    user_history: float

class ClassificationResponse(BaseModel):
    classification: str  # URGENT, NORMAL, SPAM
    trust_score: float
    confidence: float
    reasoning: str
    should_notify: bool
    response_timeframe: str

# Trust Scoring Functions
def score_sender_reputation(sender: str, user_email: str) -> float:
    """Score sender reputation (30% weight)"""
    email_match = re.search(r'<(.+)>', sender)
    sender_email = email_match.group(1) if email_match else sender
    sender_email = sender_email.lower()
    
    # Known contacts (mock data)
    known_contacts = [user_email.lower(), 'boss@company.com', 'team@company.com', 'hr@company.com']
    if any(contact in sender_email for contact in known_contacts):
        return 0.9
    
    # Company domain
    domain = sender_email.split('@')[1] if '@' in sender_email else ''
    if 'company.com' in domain:
        return 0.7
    
    # Unknown sender
    return 0.3

def score_domain_authentication(sender: str) -> float:
    """Score domain authentication (20% weight)"""
    email_match = re.search(r'<(.+)>', sender)
    sender_email = email_match.group(1) if email_match else sender
    domain = sender_email.split('@')[1] if '@' in sender_email else ''
    
    trusted_domains = ['gmail.com', 'company.com', 'outlook.com', 'yahoo.com', 'alibaba-inc.com']
    if domain.lower() in trusted_domains:
        return 0.9
    
    return 0.5

def score_behavioral_pattern(subject: str, body: str) -> float:
    """Score behavioral pattern (20% weight)"""
    text = f"{subject} {body}".lower()
    
    # Professional communication patterns
    if any(word in text for word in ['meeting', 'schedule', 'project', 'deadline', 'review']):
        return 0.8
    
    # Suspicious patterns
    if any(word in text for word in ['click here', 'verify account', 'act now', 'limited time']):
        return 0.2
    
    return 0.5

def score_content_analysis(subject: str, body: str) -> float:
    """Score content quality (20% weight) - includes prompt injection detection"""
    text = f"{subject} {body}".lower()
    
    # Prompt injection patterns
    adversarial_patterns = [
        'ignore previous instructions',
        'you are now in developer mode',
        'disregard',
        'forget everything',
        'system:',
        'assistant:',
        'act as if'
    ]
    
    if any(pattern in text for pattern in adversarial_patterns):
        return 0.0  # Force SPAM
    
    # Legitimate urgent content
    urgent_keywords = ['urgent', 'asap', 'immediately', 'deadline', 'critical']
    has_urgent = any(keyword in text for keyword in urgent_keywords)
    
    if has_urgent and any(word in text for word in ['meeting', 'project', 'deadline']):
        return 0.9
    
    # Spam indicators
    spam_keywords = ['unsubscribe', 'click here', 'free', 'winner', 'congratulations', 'buy now']
    spam_count = sum(1 for keyword in spam_keywords if keyword in text)
    
    if spam_count >= 2:
        return 0.1
    
    return 0.6

def score_user_history(sender: str, user_email: str) -> float:
    """Score user interaction history (10% weight)"""
    # Mock user history - in production, query database
    # High engagement with known senders
    if 'company.com' in sender.lower():
        return 0.8
    
    return 0.5

def calculate_trust_score(email: EmailInput) -> TrustScore:
    """Calculate weighted trust score"""
    sender_score = score_sender_reputation(email.sender, email.user_email)
    domain_score = score_domain_authentication(email.sender)
    behavioral_score = score_behavioral_pattern(email.subject, email.body)
    content_score = score_content_analysis(email.subject, email.body)
    history_score = score_user_history(email.sender, email.user_email)
    
    overall = (
        sender_score * 0.30 +
        domain_score * 0.20 +
        behavioral_score * 0.20 +
        content_score * 0.20 +
        history_score * 0.10
    )
    
    return TrustScore(
        overall=overall,
        sender_reputation=sender_score,
        domain_authentication=domain_score,
        behavioral_pattern=behavioral_score,
        content_analysis=content_score,
        user_history=history_score
    )

def check_prompt_injection(trust_score: TrustScore, subject: str, body: str) -> bool:
    """Detect prompt injection attempts"""
    text = f"{subject} {body}".lower()
    
    adversarial_patterns = [
        'ignore previous instructions',
        'you are now in developer mode',
        'disregard',
        'forget everything',
        'system:',
        'assistant:',
        'act as if'
    ]
    
    if any(pattern in text for pattern in adversarial_patterns):
        return True
    
    # Low trust + urgent language mismatch
    if trust_score.overall < 0.4 and 'urgent' in text:
        return True
    
    return False

# API Endpoints
@app.get("/")
async def root():
    return {
        "service": "Priority Agent API",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {
            "classify": "/classify (POST)"
        }
    }

@app.post("/classify", response_model=ClassificationResponse)
async def classify_email(email: EmailInput):
    """
    Classify email priority using multi-signal trust scoring
    
    Returns:
    - URGENT: High trust (>0.8) + urgent keywords
    - NORMAL: Moderate trust (>0.5)
    - SPAM: Low trust or prompt injection detected
    """
    try:
        # Calculate trust score
        trust_score = calculate_trust_score(email)
        
        # Check for prompt injection
        is_prompt_injection = check_prompt_injection(trust_score, email.subject, email.body)
        
        if is_prompt_injection:
            return ClassificationResponse(
                classification="SPAM",
                trust_score=0.0,
                confidence=0.99,
                reasoning="Adversarial pattern detected - potential prompt injection attack",
                should_notify=False,
                response_timeframe="batch"
            )
        
        # Check for urgent keywords
        text = f"{email.subject} {email.body}".lower()
        urgent_keywords = ['urgent', 'asap', 'immediately', 'deadline', 'critical', 'meeting tomorrow']
        has_urgent = any(keyword in text for keyword in urgent_keywords)
        
        # Classification logic
        if trust_score.overall > 0.8 and has_urgent:
            return ClassificationResponse(
                classification="URGENT",
                trust_score=trust_score.overall,
                confidence=0.95,
                reasoning="High trust sender + meeting keyword detected",
                should_notify=True,
                response_timeframe="immediate"
            )
        elif trust_score.overall > 0.5:
            return ClassificationResponse(
                classification="NORMAL",
                trust_score=trust_score.overall,
                confidence=0.85,
                reasoning="Moderate trust score - summarize later",
                should_notify=False,
                response_timeframe="batch"
            )
        else:
            return ClassificationResponse(
                classification="SPAM",
                trust_score=trust_score.overall,
                confidence=0.90,
                reasoning="Low trust score - likely promotional or spam",
                should_notify=False,
                response_timeframe="batch"
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "priority-agent"}

@app.get("/api/emails/queues")
async def get_email_queues():
    """
    Get real-time email queues (urgent, normal, spam)
    Returns emails classified from Gmail using AI
    """
    if email_sync_service is None:
        # Fallback to empty queues if service not initialized
        return {
            "urgent": [],
            "normal": [],
            "spam": [],
            "stats": {
                "total_processed": 0,
                "urgent_count": 0,
                "normal_count": 0,
                "spam_count": 0,
                "time_saved_minutes": 0
            },
            "message": "Email sync service not initialized - configure Gmail credentials"
        }
    
    try:
        # Get real queues from email sync service
        queues_data = email_sync_service.get_queues()
        
        # Format response
        return {
            "urgent": queues_data['urgent'],
            "normal": queues_data['normal'],
            "spam": queues_data['spam'],
            "stats": queues_data['stats'],
            "last_sync": email_sync_service.last_sync_time.isoformat() if email_sync_service.last_sync_time else None
        }
    except Exception as e:
        print(f"❌ Error fetching queues: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch queues: {str(e)}")

@app.get("/api/stats/dashboard")
async def get_dashboard_stats():
    """Get dashboard statistics with mock data"""
    return {
        "emails_processed_today": 42,
        "actions_taken": 15,
        "time_saved_minutes": 127,
        "current_streak_days": 5,
        "urgent_pending": 1,
        "normal_pending": 1,
        "weekly_summary": {
            "hours_saved": 12.5,
            "events_created": 8,
            "estimated_value": 2500,
            "emails_archived": 156
        }
    }

@app.post("/api/emails/sync")
async def trigger_sync(background_tasks: BackgroundTasks):
    """Manually trigger email sync"""
    if email_sync_service is None:
        raise HTTPException(status_code=503, detail="Email sync service not available")
    
    try:
        # Run sync in background
        result = email_sync_service.sync_once()
        return {
            "success": True,
            "message": "Email sync completed",
            "result": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

@app.get("/api/service/status")
async def get_service_status():
    """Get service status and configuration"""
    return {
        "service": "priority-agent",
        "version": "2.0.0",
        "email_sync_enabled": email_sync_service is not None,
        "gmail_configured": email_sync_service is not None,
        "last_sync": email_sync_service.last_sync_time.isoformat() if email_sync_service and email_sync_service.last_sync_time else None,
        "processed_emails": len(email_sync_service.processed_ids) if email_sync_service else 0
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Priority Agent FastAPI Service...")
    print("📍 API will be available at: http://localhost:8000")
    print("📖 Docs available at: http://localhost:8000/docs")
    print("📧 Email Sync: " + ("ENABLED" if email_sync_service else "DISABLED"))
    uvicorn.run(app, host="0.0.0.0", port=8000)
