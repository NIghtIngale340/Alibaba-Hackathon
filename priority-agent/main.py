# main.py
import os
import sys
import time
import threading
import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

# Fix SSL certificate issues on Windows at the very top
import ssl
import urllib3
ssl._create_default_https_context = ssl._create_unverified_context
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Fix path issues for Windows
project_root = Path(__file__).parent.resolve()
sys.path.append(str(project_root))

# Load environment variables with absolute path
env_path = project_root / 'config' / 'settings.env'
load_dotenv(env_path)

from services.gmail_service import GmailService
from services.dashscope_service import DashScopeService
from services.vector_db import VectorDB
from utils.helpers import format_summary, get_reply_history

# Initialize services (will be done in main() but define them globally for thread access)
gmail = None
dashscope = None
vector_db = None
processed_email_ids = set()  # Track processed email IDs to avoid duplicates

def is_spam_or_promotional(email_data):
    """Detect if email is spam or promotional content"""
    text = f"{email_data['subject'].lower()} {email_data['body'].lower()}"
    
    spam_indicators = [
        'unsubscribe', 'privacy policy', 'promotional content', 
        'to stop receiving', 'special offer', 'limited time offer',
        'black friday', 'cyber monday', 'sale', 'discount', 'free gift',
        'coupon', 'deal', 'offer', 'promotion', 'marketing', 'newsletter',
        'forwarded message', 'fwd:', 'save up to', 'up to $', 'off', 'save',
        'expires', 'expiry', 'hurry', 'last chance', 'guarantee', 'winner',
        'congratulations', 'you have won', 'cash', 'prize', 'urgent action required',
        'click here', 'buy now', 'shop now', 'no obligation', 'risk free',
        'deals', 'bargains', 'clearance', 'flash sale', 'daily digest', 'weekly roundup'
    ]
    
    spam_count = sum(1 for indicator in spam_indicators if indicator in text)
    
    # Check for promotional HTML patterns
    if '<a href' in email_data['body'].lower() and ('unsubscribe' in email_data['body'].lower() or 
                                                   'view in browser' in email_data['body'].lower()):
        spam_count += 2
    
    # Check subject line patterns
    if any(pattern in email_data['subject'].lower() for pattern in ['$', '% off', 'free', 'sale', 'deal', 'discount', 'offer']):
        spam_count += 2
    
    # High spam score threshold
    return spam_count >= 3

def categorize_email(email_data):
    """Categorize email based on confidential score with new thresholds"""
    # Use the analysis already performed by GmailService
    urgency_analysis = email_data.get('urgency_analysis', {})
    
    is_urgent = urgency_analysis.get('is_urgent', False)
    confidential_score = urgency_analysis.get('urgency_score', 0.0)
    category = urgency_analysis.get('category', 'OTHER')
    
    if is_urgent and confidential_score >= 0.95:
        category_type = "urgent"
        priority = "high"
    elif confidential_score < 0.85:
        category_type = "normal"
        priority = "low"
    else:
        category_type = "normal"
        priority = "medium"
    
    return {
        'category': category_type,
        'priority': priority,
        'confidential_score': confidential_score,
        'is_urgent': is_urgent,
        'category_detail': category,
        'response_timeframe': urgency_analysis.get('response_timeframe', 'Routine')
    }

def store_email_in_database(email_data, category, urgent_analysis):
    """Store email in appropriate database based on category"""
    global processed_email_ids
    
    # Skip if already processed in this session
    if email_data['id'] in processed_email_ids:
        print(f"⏭️  Email already processed (ID: {email_data['id']})")
        return False
    
    # Prepare email metadata
    email_metadata = {
        'email_id': email_data['id'],
        'subject': email_data['subject'],
        'sender': email_data['sender'],
        'timestamp': datetime.now().isoformat(),
        'category': category,
        'priority': 'high' if category == 'urgent' else 'low',
        'confidential_score': urgent_analysis.get('urgency_score', 0.0),
        'category_detail': urgent_analysis.get('category', 'OTHER'),
        'body_preview': email_data['body'][:200] + "..." if len(email_data['body']) > 200 else email_data['body'],
        'requires_human_review': urgent_analysis.get('urgency_score', 0.0) > 0.97,
        'response_timeframe': urgent_analysis.get('response_timeframe', 'Routine')
    }
    
    try:
        if category == "urgent":
            # Store in vector database ONLY ONCE per scanning
            vector_db.add_urgent_email(email_metadata)
            print(f"✅ Urgent email stored in vector database (Score: {urgent_analysis.get('urgency_score', 0.0):.2f}, Category: {urgent_analysis.get('category', 'OTHER')})")
        else:
            # Store in normal/spam database
            vector_db.add_normal_email(email_metadata)
            print(f"✅ {category.capitalize()} email stored in database (Score: {urgent_analysis.get('urgency_score', 0.0):.2f}, Category: {urgent_analysis.get('category', 'OTHER')})")
        
        # Mark as processed to avoid duplicates
        processed_email_ids.add(email_data['id'])
        return True
        
    except Exception as e:
        print(f"❌ Error storing email in database: {str(e)}")
        return False

def handle_urgent_email(email_data, urgent_analysis):
    """Process urgent emails with AI summarization and priority handling using qwen-max"""
    print("\n" + "="*80)
    print(f"🚨 URGENT CORPORATE EMAIL ALERT (Score: {urgent_analysis.get('urgency_score', 0.0):.2f}/1.0)")
    print(f"🏷️  Category: {urgent_analysis.get('category', 'OTHER')}")
    print(f"⏱️  Response Timeframe: {urgent_analysis.get('response_timeframe', 'Routine')}")
    print("="*80)
    
    # Get AI summary using qwen-max
    print("🧠 Generating AI summary with qwen-max...")
    summary = dashscope.summarize_email(email_data['body'])
    
    # Format and display
    formatted_output = format_summary(summary, email_data)
    print("\n" + formatted_output)
    
    # Save to urgent log with confidential score and suggestions
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f'urgent_{timestamp}.txt'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"🚨 URGENT CORPORATE EMAIL - CONFIDENTIAL SCORE: {urgent_analysis.get('urgency_score', 0.0):.2f}/1.0\n")
        f.write(f"🏷️  Category: {urgent_analysis.get('category', 'OTHER')}\n")
        f.write(f"⏱️  Response Timeframe: {urgent_analysis.get('response_timeframe', 'Routine')}\n")
        f.write(f"🧠 PROCESSED WITH: qwen-max\n")
        f.write("="*80 + "\n\n")
        f.write(formatted_output + "\n\n")
        f.write(f"📧 FULL EMAIL CONTENT:\n{email_data['body']}")
    
    print(f"\n💾 Urgent email summary saved to '{output_file}'")
    
    # Generate action items with qwen-max context
    print("\n📋 RECOMMENDED ACTIONS:")
    print(f"• Respond within {urgent_analysis.get('response_timeframe', 'Routine')}")
    print(f"• Priority level: {urgent_analysis.get('category', 'OTHER')}")
    if urgent_analysis.get('urgency_score', 0.0) >= 0.98:
        print("• ⚠️  This email contains highly sensitive information - handle with extreme care")
        print("• Consider encrypting your response if it contains sensitive information")
    print("• Mark as important in your task management system")
    
    # Optional: Send notification (implement your notification logic here)
    print("\n🔔 Notification sent for urgent email")

def handle_normal_email(email_data, urgent_analysis):
    """Handle normal priority emails - keep unread for manual review"""
    print(f"\n📧 NORMAL PRIORITY EMAIL (Score: {urgent_analysis.get('urgency_score', 0.0):.2f}/1.0)")
    print(f"🏷️  Category: {urgent_analysis.get('category', 'OTHER')}")
    
    # Keep email unread in Gmail for manual review
    print("✅ Email kept UNREAD in Gmail inbox for manual review during regular hours")
    
    # Save to normal email log
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f'normal_{timestamp}.txt'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"📧 NORMAL EMAIL - CONFIDENTIAL SCORE: {urgent_analysis.get('urgency_score', 0.0):.2f}/1.0\n")
        f.write(f"🏷️  Category: {urgent_analysis.get('category', 'OTHER')}\n")
        f.write("="*80 + "\n\n")
        f.write(f"From: {email_data['sender']}\n")
        f.write(f"Subject: {email_data['subject']}\n")
        f.write(f"Body: {email_data['body']}\n")
    
    print(f"💾 Normal email reference saved to '{output_file}'")

def process_new_email(email_data):
    """Process a single new email through the classification pipeline"""
    try:
        print(f"\n🔍 PROCESSING NEW EMAIL: '{email_data['subject']}' from {email_data['sender']}")
        print("-" * 60)
        
        # STEP 1: Check if spam/promotional
        if is_spam_or_promotional(email_data):
            print(f"🗑️  SPAM/PROMOTIONAL DETECTED: '{email_data['subject']}'")
            success = gmail.mark_as_spam(email_data['id'])
            if success:
                print("✅ Email moved to Spam folder")
                # Store in database as spam
                spam_analysis = {
                    'is_urgent': False,
                    'urgency_score': 0.0,
                    'category': 'SPAM',
                    'reason': 'Detected as promotional/spam content',
                    'response_timeframe': 'None'
                }
                store_email_in_database(email_data, "spam", spam_analysis)
            else:
                print("⚠️  Failed to move email to Spam folder, keeping in inbox")
            return
        
        # STEP 2: Get urgency analysis (already done by GmailService)
        urgency_analysis = email_data.get('urgency_analysis', {})
        
        # STEP 3: Categorize email with qwen-max analysis
        email_category = categorize_email(email_data)
        is_urgent = email_category['is_urgent']
        
        # STEP 4: Store in appropriate database (only once per scanning)
        store_email_in_database(email_data, email_category['category'], urgency_analysis)
        
        # STEP 5: Process based on classification
        if is_urgent:
            print(f"⚡ PROCESSING AS URGENT EMAIL (Score: {urgency_analysis.get('urgency_score', 0.0):.2f}/1.0)")
            print(f"   Category: {urgency_analysis.get('category', 'OTHER')}")
            print(f"   Response Timeframe: {urgency_analysis.get('response_timeframe', 'Routine')}")
            # Mark as read first for urgent emails
            gmail.mark_as_read(email_data['id'])
            handle_urgent_email(email_data, urgency_analysis)
        else:
            print(f"📧 PROCESSING AS NORMAL PRIORITY EMAIL (Score: {urgency_analysis.get('urgency_score', 0.0):.2f}/1.0)")
            print(f"   Category: {urgency_analysis.get('category', 'OTHER')}")
            handle_normal_email(email_data, urgency_analysis)
        
        print("-" * 60)
        print(f"✅ Email processing complete: '{email_data['subject']}'")
        
    except Exception as e:
        print(f"❌ Error processing email '{email_data['subject']}': {str(e)}")
        # Fallback: mark as read if it's causing repeated errors
        try:
            gmail.mark_as_read(email_data['id'])
            print("⚠️  Marked problematic email as read to prevent repeated failures")
        except:
            pass

def check_for_new_emails():
    """Check for new emails and process them"""
    global gmail, vector_db, processed_email_ids
    
    print(f"\n⏰ Checking for new emails at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}...")
    
    try:
        # Clear the processed email IDs set for each new scanning cycle
        processed_email_ids.clear()
        print("🧹 Cleared processed email cache for new scanning cycle")
        
        # Get new unread emails from the last 10 seconds
        new_emails = gmail.get_new_unread_emails(max_emails=5)
        
        if not new_emails:
            print("📭 No new emails found in this check")
            return
        
        print(f"📬 Found {len(new_emails)} new emails to process")
        
        # Process each email
        for email_data in new_emails:
            # Process in a separate thread to avoid blocking the main loop
            thread = threading.Thread(
                target=process_new_email,
                args=(email_data,),
                daemon=True
            )
            thread.start()
            # Small delay between processing emails
            time.sleep(0.5)
        
    except Exception as e:
        print(f"❌ Error checking for new emails: {str(e)}")
        print("🔄 Attempting to re-authenticate with Gmail...")
        try:
            gmail = GmailService()
            print("✅ Re-authentication successful")
        except Exception as auth_error:
            print(f"❌ Re-authentication failed: {str(auth_error)}")

def main():
    global gmail, dashscope, vector_db, processed_email_ids
    
    print("="*80)
    print("🚀 JOYBREAD CORPORATE EMAIL INTELLIGENCE SYSTEM")
    print("⏱️  REAL-TIME EMAIL PROCESSING | qwen-max AI INTEGRATION")
    print("="*80)
    
    try:
        # Validate environment variables
        dashscope_api_key = os.getenv('DASHSCOPE_API_KEY')
        if not dashscope_api_key:
            raise ValueError("❌ DASHSCOPE_API_KEY missing in config/settings.env")
        print("✅ DashScope API key loaded")
        
        # Initialize services
        print("\n🔧 Initializing services...")
        gmail = GmailService()
        dashscope = DashScopeService()
        vector_db = VectorDB()
        
        print("\n✅ All services initialized successfully")
        print("- Gmail Service: Connected and authenticated")
        print("- DashScope Service: qwen-max model ready for AI summarization")
        print("- Vector Database: Ready for email storage")
        
        # Main monitoring loop
        print("\n" + "="*80)
        print("🔄 EMAIL MONITORING STARTED")
        print("="*80)
        print(f"⏰ System will check for new emails every 10 seconds")
        print("📧 Intelligent processing pipeline with qwen-max AI:")
        print("   • 🚨 Urgent/Confidential emails (Score ≥ 0.95): qwen-max summarization + corporate category analysis")
        print("   • 📧 Normal priority emails (Score < 0.85): Kept unread for manual review")
        print("   • 🗑️  Spam/promotional: Auto-moved to Gmail Spam folder")
        print(f"💾 DATABASE STORAGE: All emails stored exactly ONCE per scanning cycle")
        print("   • 🗄️  Vector DB: Only urgent emails stored here with full corporate context")
        print("   • 💾 Normal DB: Spam and normal emails stored in separate database")
        print("\n🏢 CORPORATE EMAIL CATEGORIES:")
        print("   • 📅 MEETINGS: Calendar invites, scheduling changes, meeting requests")
        print("   • 💰 BILLING: Invoices, payment requests, financial approvals")
        print("   • 🏥 HEALTH: Medical appointments, health checkups, benefits enrollment")
        print("   • 👥 PERSONNEL: HR notifications, performance reviews, compliance training")
        print("   • 🔒 SECURITY: Security alerts, password resets, compliance requirements")
        print("   • ✅ DECISIONS: Approvals needed, executive requests, time-sensitive decisions")
        print("\n🧠 qwen-max INTELLIGENCE FEATURES:")
        print("   • Corporate context-aware urgency analysis")
        print("   • Professional email summarization with action items")
        print   ("   • Response timeframe recommendations based on business priorities")
        print("   • Security-aware handling of sensitive content")
        print("\nPress Ctrl+C to stop the system")
        print("-" * 80)
        
        while True:
            check_for_new_emails()
            
            # Wait 10 seconds before next check
            for i in range(10, 0, -1):
                print(f"\r😴 Next check in {i} seconds... ", end="", flush=True)
                time.sleep(1)
            print("\r" + " " * 50, end="\r")  # Clear the line
            
    except KeyboardInterrupt:
        print("\n\n🛑 Email monitoring system stopped by user")
        print("✅ All processed emails have been handled appropriately")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ SYSTEM ERROR: {str(e)}")
        print("\n🔧 Troubleshooting steps:")
        print("1. Check config/settings.env has valid DASHSCOPE_API_KEY")
        print("2. Ensure credentials/credentials.json exists and is valid")
        print("3. Verify your Gmail is added as TEST USER in Google Cloud Console")
        print("4. Delete tokens/token.pickle and restart the system")
        print("5. Check network connectivity and firewall settings")
        
        # Attempt recovery
        recovery_choice = input("\n🔄 Attempt automatic recovery? (y/n): ").strip().lower()
        if recovery_choice == 'y':
            print("🔄 Attempting recovery...")
            try:
                # Clear token and re-authenticate
                token_path = os.path.join(os.getcwd(), "tokens", "token.pickle")
                if os.path.exists(token_path):
                    os.remove(token_path)
                    print("✅ Token file cleared")
                
                # Re-initialize services
                gmail = GmailService()
                print("✅ Gmail service re-initialized")
                
                print("✅ Recovery successful! Restarting monitoring...")
                main()
            except Exception as recovery_error:
                print(f"❌ Recovery failed: {str(recovery_error)}")
                sys.exit(1)
        else:
            sys.exit(1)

if __name__ == "__main__":
    main()