# utils/helpers.py
import textwrap
import re
from datetime import datetime, timedelta

def format_summary(summary, email_data):
    """Format the AI assistant response"""
    header = f"""📧 Email Summary Assistant
──────────────────────────────
From: {email_data['sender']}
Subject: {email_data['subject']}
──────────────────────────────
"""
    wrapped_summary = textwrap.fill(summary, width=80)
    return f"{header}\n📝 Summary:\n{wrapped_summary}\n\n[Processed with Alibaba AI]"

def is_urgent_keywords(text):
    """Check if text contains urgent keywords"""
    urgent_keywords = [
        'urgent', 'immediate', 'deadline', 'today', 'now', 'critical', 
        'emergency', 'asap', 'important', 'time-sensitive', 'overdue',
        'expired', 'last chance', 'final notice', 'action required',
        'response needed', 'high priority'
    ]
    
    text_lower = text.lower()
    return any(keyword in text_lower for keyword in urgent_keywords)

def get_reply_history(sender_email, gmail_service, max_history=5):
    """Get reply history with a specific sender"""
    try:
        # Extract just the email address from "Name <email@domain.com>" format
        email_match = re.search(r'[\w\.-]+@[\w\.-]+', sender_email)
        clean_email = email_match.group(0) if email_match else sender_email
        
        print(f"🔍 Fetching reply history for: {clean_email}")
        history = gmail_service.get_email_history(clean_email, max_history)
        
        if not history:
            return "No previous conversation history found"
        
        # Format the history for AI context
        history_text = "Previous conversation history:\n"
        for i, entry in enumerate(history, 1):
            history_text += f"{i}. Subject: {entry['subject']}\n"
            history_text += f"   Date: {entry['date']}\n"
        
        return history_text
        
    except Exception as e:
        print(f"⚠️ Error getting reply history: {str(e)}")
        return "Unable to retrieve conversation history"

def extract_core_content(text):
    """Extract core content from email text by removing signatures, disclaimers, etc."""
    # Split into lines
    lines = text.split('\n')
    filtered_lines = []
    
    # Common patterns to skip
    skip_patterns = [
        'regards', 'sincerely', 'best regards', 'thank you', 'thanks',
        'signature', 'disclaimer', 'confidential', 'unsubscribe',
        'phone:', 'email:', 'website:', 'address:', 'copyright',
        'sent from my', 'this email was sent', 'mailing list'
    ]
    
    for line in lines:
        line_lower = line.lower().strip()
        
        # Skip empty lines
        if not line_lower:
            continue
        
        # Skip lines containing skip patterns
        if any(pattern in line_lower for pattern in skip_patterns):
            continue
        
        # Skip very short lines (likely signatures)
        if len(line_lower) < 10 and not any(c.isupper() for c in line_lower):
            continue
        
        filtered_lines.append(line)
    
    return '\n'.join(filtered_lines[:15])  # Return first 15 meaningful lines

def is_business_hours():
    """Check if current time is during business hours (9 AM - 6 PM, Monday-Friday)"""
    now = datetime.now()
    return 9 <= now.hour < 18 and 0 <= now.weekday() < 5

def calculate_response_priority(email_data, reply_history):
    """Calculate priority score based on various factors"""
    score = 1  # Base score
    
    # Urgent keywords boost
    if is_urgent_keywords(email_data['subject'] + ' ' + email_data['body']):
        score += 3
    
    # Sender importance (simplified)
    important_senders = ['boss', 'manager', 'director', 'ceo', 'client', 'customer']
    if any(sender in email_data['sender'].lower() for sender in important_senders):
        score += 2
    
    # Time sensitivity
    time_sensitive_phrases = ['today', 'tomorrow', 'by eod', 'deadline', 'asap']
    if any(phrase in email_data['body'].lower() for phrase in time_sensitive_phrases):
        score += 2
    
    # Recent reply history
    if reply_history and 'today' in reply_history.lower():
        score += 1
    
    # Business hours factor
    if is_business_hours():
        score += 1
    
    return min(10, score)  # Cap at 10

def clean_email_address(email_str):
    """Extract clean email address from 'Name <email@domain.com>' format"""
    match = re.search(r'[\w\.-]+@[\w\.-]+', email_str)
    return match.group(0) if match else email_str