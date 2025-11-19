# services/gmail_service.py
import os
import pickle
import base64
import re
import time
import ssl
import urllib3
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from bs4 import BeautifulSoup
import html2text
from datetime import datetime, timedelta
import json
from openai import OpenAI

# Fix SSL certificate issues on Windows
ssl._create_default_https_context = ssl._create_unverified_context
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class GmailService:
    def __init__(self):
        # Updated scope to allow marking emails as read and modifying labels
        self.SCOPES = [os.getenv('GMAIL_SCOPES', 'https://www.googleapis.com/auth/gmail.modify')]
        self.tokens_dir = os.path.join(os.getcwd(), "tokens")
        self.credentials_path = os.path.join(os.getcwd(), "credentials", "credentials.json")
        self.token_path = os.path.join(self.tokens_dir, "token.pickle")
        
        # Ensure tokens directory exists
        os.makedirs(self.tokens_dir, exist_ok=True)
        
        # Verify required scope for marking emails as read
        if os.getenv('MARK_READ_AFTER_PROCESSING', 'true').lower() == 'true':
            if 'modify' not in self.SCOPES[0] and 'full' not in self.SCOPES[0]:
                print("⚠️ WARNING: MARK_READ_AFTER_PROCESSING enabled but missing required permissions")
                print("🔧 Required scope: https://www.googleapis.com/auth/gmail.modify")
                print("📝 Update config/settings.env and delete tokens/token.pickle to re-authenticate")
        
        # Initialize qwen-max client for AI analysis
        self.qwen_client = self._init_qwen_client()
        
        self.service = self._authenticate()
    
    def _init_qwen_client(self):
        """Initialize qwen-max client for AI analysis and summarization"""
        try:
            api_key = os.getenv('DASHSCOPE_API_KEY')
            if not api_key:
                print("⚠️ DASHSCOPE_API_KEY not found in environment variables")
                return None
            
            client = OpenAI(
                api_key=api_key,
                base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
            )
            print("✅ qwen-max AI client initialized successfully")
            return client
        except Exception as e:
            print(f"❌ Failed to initialize qwen-max client: {str(e)}")
            return None
    
    def _authenticate(self):
        """Handle Gmail authentication with robust error recovery"""
        creds = None
        
        # Only load token if file exists and is not empty
        if os.path.exists(self.token_path) and os.path.getsize(self.token_path) > 0:
            try:
                with open(self.token_path, 'rb') as token:
                    creds = pickle.load(token)
                print("✅ Loaded existing credentials")
            except (EOFError, pickle.UnpicklingError, ValueError, TypeError) as e:
                print(f"⚠️ Corrupted token file detected: {str(e)}")
                print("🔄 Deleting invalid token and re-authenticating...")
                if os.path.exists(self.token_path):
                    os.remove(self.token_path)
                creds = None
        
        # If no valid credentials, get new ones
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                try:
                    creds.refresh(Request())
                    print("🔄 Refreshed expired credentials")
                except Exception as e:
                    print(f"❌ Refresh failed: {str(e)}")
                    print("🔄 Forcing full re-authentication...")
                    creds = None
            
            if not creds:
                if not os.path.exists(self.credentials_path):
                    raise FileNotFoundError(
                        f"credentials.json not found at {self.credentials_path}\n"
                        "❗ Please download credentials from Google Cloud Console"
                    )
                
                print("🔑 Starting Gmail authentication flow...")
                print("🌐 A browser window will open shortly - please log in with your TEST USER account")
                print("ℹ️ If you see 'This app isn\'t verified', click 'Advanced' → 'Go to app (unsafe)'")
                
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_path,
                    self.SCOPES
                )
                creds = flow.run_local_server(port=0, prompt='consent')
                
                # Save the credentials
                with open(self.token_path, 'wb') as token:
                    pickle.dump(creds, token)
                print("✅ New credentials saved successfully")
        
        return build('gmail', 'v1', credentials=creds, cache_discovery=False)
    
    def email_still_exists(self, message_id):
        """Check if email still exists after delay (not marked as spam)"""
        try:
            # Try to get the message - if it fails, it was likely marked as spam or deleted
            result = self.service.users().messages().get(
                userId='me',
                id=message_id,
                format='metadata'
            ).execute()
            
            # Check if email has spam or promotions labels
            labels = result.get('labelIds', [])
            if 'SPAM' in labels or 'CATEGORY_PROMOTIONS' in labels:
                print(f"📧 Email marked as spam/promotions: {message_id}")
                return False
            
            return True
        except HttpError as error:
            if error.resp.status == 404:
                print(f"📧 Email no longer exists (likely spam-deleted): {message_id}")
                return False
            print(f"⚠️ Error checking email existence: {str(error)}")
            return True  # Default to True if uncertain
        except Exception as e:
            print(f"⚠️ Error checking email existence: {str(e)}")
            return True
    
    def get_new_unread_emails(self, max_emails=10):
        """Fetch all unread emails that arrived in the last 10 seconds, excluding spam"""
        try:
            # Calculate time 10 seconds ago
            ten_seconds_ago = (datetime.now() - timedelta(seconds=10)).strftime('%Y/%m/%d %H:%M:%S')
            
            # Get unread emails that are NOT in spam or promotions tabs from last 10 seconds
            results = self.service.users().messages().list(
                userId='me',
                q=f'is:unread after:"{ten_seconds_ago}" -in:spam -in:promotions',
                maxResults=max_emails
            ).execute()
            
            messages = results.get('messages', [])
            if not messages:
                return []
            
            emails = []
            for message in messages:
                email_data = self._get_email_content(message['id'])
                if email_ and not self._is_spam_content(email_data):
                    # Add corporate urgency analysis
                    email_data['urgency_analysis'] = self._analyze_corporate_urgency(email_data)
                    emails.append(email_data)
            
            return emails
            
        except Exception as e:
            print(f"❌ Error fetching unread emails: {str(e)}")
            return []
    
    def _analyze_corporate_urgency(self, email_data):
        """Analyze email for corporate urgency patterns using qwen-max"""
        if not self.qwen_client:
            print("⚠️ qwen-max client not available - using rule-based analysis")
            return self._rule_based_urgency_analysis(email_data)
        
        try:
            # Create structured prompt for corporate urgency analysis
            prompt = f"""
You are a corporate executive assistant specializing in urgent email detection. Analyze this email and determine if it requires immediate attention based on corporate priorities. Focus on these critical categories:

1. MEETINGS & SCHEDULES: Calendar invites, meeting changes, rescheduling requests, time-sensitive coordination
2. BILLING & PAYMENTS: Invoices, payment requests, overdue notices, financial approvals
3. HEALTH & WELLNESS: Medical appointments, health checkups, benefits enrollment deadlines, wellness programs
4. PERSONNEL MATTERS: HR notifications, performance reviews, compliance training deadlines
5. SECURITY & COMPLIANCE: Security alerts, policy updates, mandatory training, compliance requirements
6. TIME-SENSITIVE DECISIONS: Approvals needed, decisions with deadlines, urgent requests from executives

Email to analyze:
From: {email_data['sender']}
Subject: {email_data['subject']}
Content: {email_data['body'][:500]}  # Use first 500 characters for analysis

Provide your analysis in this JSON format:
{{
    "is_urgent": boolean,
    "urgency_score": 0.0-1.0,
    "category": "MEETINGS"|"BILLING"|"HEALTH"|"PERSONNEL"|"SECURITY"|"DECISIONS"|"OTHER",
    "reason": "Brief explanation of urgency classification",
    "response_timeframe": "Immediate (<1 hour)"|"Today"|"This week"|"Routine"
}}

Focus on genuine business urgency, not marketing or promotional content.
"""
            
            response = self.qwen_client.chat.completions.create(
                model="qwen-max",
                messages=[
                    {"role": "system", "content": "You are a corporate executive assistant analyzing email urgency."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,  # Low temperature for consistent, factual analysis
                max_tokens=200
            )
            
            # Parse JSON response
            analysis_result = json.loads(response.choices[0].message.content.strip())
            print(f"🧠 qwen-max urgency analysis: {analysis_result['category']} ({analysis_result['urgency_score']:.2f})")
            return analysis_result
            
        except Exception as e:
            print(f"⚠️ qwen-max analysis failed: {str(e)}")
            print("🔄 Falling back to rule-based urgency analysis")
            return self._rule_based_urgency_analysis(email_data)
    
    def _rule_based_urgency_analysis(self, email_data):
        """Fallback rule-based urgency analysis for corporate emails"""
        text = f"{email_data['subject'].lower()} {email_data['body'].lower()}"
        sender = email_data['sender'].lower()
        
        analysis = {
            'is_urgent': False,
            'urgency_score': 0.0,
            'category': 'OTHER',
            'reason': 'No urgent indicators detected',
            'response_timeframe': 'Routine'
        }
        
        # Corporate urgency keywords and patterns
        corporate_patterns = {
            'MEETINGS': [
                'meeting', 'calendar invite', 'schedule', 'appointment', 'conference call',
                'zoom meeting', 'teams meeting', 'reschedule', 'cancel meeting', 'new meeting',
                'reminder:', 'agenda', 'doodle poll'
            ],
            'BILLING': [
                'invoice', 'payment due', 'bill', 'overdue', 'payment request', 
                'wire transfer', 'purchase order', 'expense report', 'reimbursement',
                'finance department', 'accounts payable', 'accounts receivable'
            ],
            'HEALTH': [
                'medical appointment', 'health checkup', 'doctor appointment', 'wellness program',
                'benefits enrollment', 'insurance', 'prescription', 'lab results', 'vaccination',
                'hr wellness', 'health screening'
            ],
            'PERSONNEL': [
                'performance review', 'salary review', 'promotion', 'job offer', 
                'termination', 'layoff', 'compliance training', 'harassment training',
                'policy acknowledgment', 'employee handbook', 'hr notification'
            ],
            'SECURITY': [
                'security alert', 'password reset', 'suspicious activity', 'data breach',
                'compliance requirement', 'security training', 'phishing attempt',
                'malware detected', 'system vulnerability'
            ],
            'DECISIONS': [
                'approval required', 'your decision needed', 'sign off', 'authorize',
                'executive request', 'urgent decision', 'deadline approaching', 'time-sensitive'
            ]
        }
        
        # Check sender domains for corporate patterns
        corporate_senders = [
            '@company.com', '@organization.org', '@enterprise.com', '@corp.com',
            'hr@', 'finance@', 'accounts@', 'payroll@', 'security@', 'compliance@',
            'medicals@', 'benefits@', 'wellness@', 'meetings@', 'scheduling@'
        ]
        
        # Score the email based on patterns
        score = 0.0
        found_category = None
        
        for category, patterns in corporate_patterns.items():
            for pattern in patterns:
                if pattern in text:
                    score += 0.2
                    if not found_category and pattern in email_data['subject'].lower():
                        found_category = category
                        score += 0.3  # Higher weight if in subject line
        
        # Check sender domain
        for domain in corporate_senders:
            if domain in sender:
                score += 0.3
                break
        
        # Time-sensitive indicators
        time_indicators = ['today', 'tomorrow', 'deadline', 'urgent', 'immediate', 'asap', 'within 24 hours']
        for indicator in time_indicators:
            if indicator in text:
                score += 0.4
                break
        
        # Normalize score
        score = min(1.0, score)
        
        if score >= 0.7:
            analysis['is_urgent'] = True
            analysis['urgency_score'] = score
            analysis['category'] = found_category or 'DECISIONS'
            analysis['reason'] = f"Rule-based detection: High urgency score ({score:.2f})"
            
            if score >= 0.9:
                analysis['response_timeframe'] = "Immediate (<1 hour)"
            elif score >= 0.8:
                analysis['response_timeframe'] = "Today"
            else:
                analysis['response_timeframe'] = "This week"
        
        return analysis
    
    def summarize_urgent_email(self, email_data):
        """Generate professional summary for urgent corporate emails using qwen-max"""
        if not self.qwen_client:
            print("⚠️ qwen-max not available for summarization")
            return "AI summarization unavailable - please review full email content"
        
        try:
            # Create structured prompt for corporate email summarization
            analysis = email_data.get('urgency_analysis', {})
            category = analysis.get('category', 'GENERAL')
            urgency_score = analysis.get('urgency_score', 0.0)
            
            prompt = f"""
You are an executive assistant summarizing an URGENT CORPORATE EMAIL. This email has been classified as category: {category} with urgency score: {urgency_score:.2f}/1.0.

Provide a concise, professional summary that captures:
1. The core action required or information conveyed
2. Any deadlines or time-sensitive elements
3. Next steps or recommended actions
4. Key contacts or stakeholders involved

Format your response as:
SUMMARY: [2-3 sentence professional summary]
ACTION REQUIRED: [Yes/No - if yes, what specific action]
DEADLINE: [Specific date/time or "None"]
PRIORITY: [Critical/High/Medium/Low based on urgency score]

Email content:
From: {email_data['sender']}
Subject: {email_data['subject']}
Content: {email_data['body']}

Keep the summary factual, professional, and actionable. Focus on business impact and required responses.
"""
            
            response = self.qwen_client.chat.completions.create(
                model="qwen-max",
                messages=[
                    {"role": "system", "content": "You are an executive assistant providing professional email summaries for urgent corporate communications."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,  # Low temperature for factual, consistent summaries
                max_tokens=250
            )
            
            summary = response.choices[0].message.content.strip()
            print("✅ qwen-max summary generated successfully")
            return summary
            
        except Exception as e:
            print(f"⚠️ qwen-max summarization failed: {str(e)}")
            fallback_summary = f"URGENT EMAIL - CATEGORY: {category}\n"
            fallback_summary += f"From: {email_data['sender']}\n"
            fallback_summary += f"Subject: {email_data['subject']}\n"
            fallback_summary += "AI summarization failed - please review full content"
            return fallback_summary
    
    def mark_as_read(self, message_id):
        """Mark an email as read after processing"""
        try:
            self.service.users().messages().modify(
                userId='me',
                id=message_id,
                body={'removeLabelIds': ['UNREAD']}
            ).execute()
            return True
        except Exception as e:
            print(f"⚠️ Failed to mark email as read: {str(e)}")
            return False
    
    def mark_as_spam(self, message_id):
        """Mark an email as spam in Gmail"""
        try:
            # Add SPAM label and remove INBOX label
            self.service.users().messages().modify(
                userId='me',
                id=message_id,
                body={
                    'addLabelIds': ['SPAM'],
                    'removeLabelIds': ['INBOX']
                }
            ).execute()
            print(f"✅ Email marked as spam: {message_id}")
            return True
        except Exception as e:
            print(f"⚠️ Failed to mark email as spam: {str(e)}")
            return False
    
    def get_email_history(self, sender_email, max_results=5):
        """Get reply history with a specific sender"""
        try:
            # Extract clean email address
            clean_email = self._extract_clean_email(sender_email)
            
            # Search for emails from this sender (excluding spam)
            results = self.service.users().messages().list(
                userId='me',
                q=f'from:{clean_email} -in:spam -in:promotions',
                maxResults=max_results
            ).execute()
            
            messages = results.get('messages', [])
            history = []
            
            for message in messages:
                try:
                    msg = self.service.users().messages().get(
                        userId='me',
                        id=message['id'],
                        format='metadata',
                        metadataHeaders=['From', 'To', 'Subject', 'Date']
                    ).execute()
                    
                    headers = msg['payload']['headers']
                    subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
                    date = next((h['value'] for h in headers if h['name'] == 'Date'), 'Unknown Date')
                    
                    history.append({
                        'subject': subject,
                        'date': date,
                        'message_id': message['id']
                    })
                except Exception as e:
                    print(f"⚠️ Error processing historical email: {str(e)}")
            
            return history
            
        except Exception as e:
            error_msg = str(e)
            if "SSL" in error_msg or "certificate" in error_msg.lower():
                return "Unable to retrieve conversation history due to SSL certificate issues"
            return f"Unable to retrieve conversation history: {error_msg}"
    
    def _extract_clean_email(self, email_str):
        """Extract clean email address from 'Name <email@domain.com>' format"""
        match = re.search(r'[\w\.-]+@[\w\.-]+', email_str)
        return match.group(0) if match else email_str
    
    def _is_spam_content(self, email_data):
        """Enhanced spam content detection"""
        if not email_data:
            return True
        
        text = f"{email_data['subject'].lower()} {email_data['body'].lower()}"
        
        spam_indicators = [
            'unsubscribe', 'privacy policy', 'promotional content', 
            'to stop receiving', 'special offer', 'limited time offer',
            'black friday', 'cyber monday', 'sale', 'discount', 'free gift',
            'coupon', 'deal', 'offer', 'promotion', 'marketing', 'newsletter',
            'forwarded message', 'fwd:', 'save up to', 'up to $', 'off', 'save',
            'expires', 'expiry', 'hurry', 'last chance', 'guarantee', 'winner',
            'congratulations', 'you have won', 'cash', 'prize', 'urgent action required',
            'click here', 'buy now', 'shop now', 'no obligation', 'risk free'
        ]
        
        spam_count = sum(1 for indicator in spam_indicators if indicator in text)
        
        # Check for promotional HTML patterns
        if '<a href' in email_data['body'].lower() and 'unsubscribe' in email_data['body'].lower():
            spam_count += 2
        
        # Check subject line patterns
        if any(pattern in email_data['subject'].lower() for pattern in ['$', '% off', 'free', 'sale', 'deal']):
            spam_count += 1
        
        return spam_count >= 2
    
    def _get_email_content(self, message_id):
        """Extract email content and metadata"""
        msg = self.service.users().messages().get(
            userId='me', id=message_id, format='full'
        ).execute()
        
        headers = msg['payload']['headers']
        subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
        sender = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown Sender')
        
        # Get email body
        body = self._extract_body(msg['payload'])
        max_length = int(os.getenv('MAX_EMAIL_LENGTH', 4000))
        return {
            'id': message_id,
            'subject': subject,
            'sender': sender,
            'body': body[:max_length]
        }
    
    def _extract_body(self, payload):
        """Recursively extract email body from parts with better HTML handling"""
        body = ""
        
        # Check if this payload has parts (multipart message)
        if 'parts' in payload:
            for part in payload['parts']:
                # Look for text/plain part first (preferred for summaries)
                if part.get('mimeType') == 'text/plain' and not body:
                    body = self._get_part_body(part)
                # Fallback to text/html if no text/plain available
                elif part.get('mimeType') == 'text/html' and not body:
                    body = self._get_part_body(part)
                    # Convert HTML to readable text
                    body = self._html_to_text(body)
                # Handle nested multipart messages
                elif 'parts' in part:
                    nested_body = self._extract_body(part)
                    if nested_body and not body:
                        body = nested_body
        
        # If still no body found, check if this payload itself is text/html
        if not body and payload.get('mimeType') == 'text/html':
            body = self._get_part_body(payload)
            body = self._html_to_text(body)
        
        # Final fallback: if we have data but no body, try to decode it
        if not body and 'body' in payload and 'data' in payload['body']:
            try:
                body = base64.urlsafe_b64decode(
                    payload['body']['data']
                ).decode('utf-8', errors='ignore')
                
                # If it's HTML, convert to text
                if '<html' in body.lower() or '<div' in body.lower() or '<p' in body.lower():
                    body = self._html_to_text(body)
            except Exception as e:
                print(f"⚠️ Error decoding body: {str(e)}")
                body = ""
        
        return body.strip() if body else "No readable content found"
    
    def _get_part_body(self, part):
        """Safely extract body content from a part"""
        try:
            if 'body' in part and 'data' in part['body']:
                return base64.urlsafe_b64decode(
                    part['body']['data']
                ).decode('utf-8', errors='ignore')
        except Exception as e:
            print(f"⚠️ Error decoding part body: {str(e)}")
        return ""
    
    def _html_to_text(self, html):
        """Convert HTML to readable text with multiple fallback strategies"""
        if not html or len(html.strip()) == 0:
            return "No content available"
        
        try:
            # Strategy 1: Use html2text for best formatting
            h = html2text.HTML2Text()
            h.ignore_links = False
            h.ignore_images = True
            h.ignore_emphasis = True
            h.body_width = 0  # No wrapping
            h.single_line_break = True
            text = h.handle(html)
            
            # Clean up common artifacts
            text = re.sub(r'\n\s*\n', '\n\n', text)  # Remove excessive newlines
            text = re.sub(r'\[.*?\]\(.*?\)', '', text)  # Remove markdown links
            text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)  # Remove URLs
            
            if len(text.strip()) > 100:  # Only use if we got substantial content
                return text.strip()
        except Exception as e:
            print(f"⚠️ html2text conversion failed: {str(e)}")
        
        try:
            # Strategy 2: BeautifulSoup fallback
            soup = BeautifulSoup(html, 'html.parser')
            
            # Remove unwanted elements
            for element in soup(['script', 'style', 'head', 'title', 'meta', 'header', 'footer', 'nav', 'aside', 'form']):
                element.decompose()
            
            # Handle tables more gracefully
            for table in soup.find_all('table'):
                table_text = table.get_text(strip=True)
                if len(table_text) > 10:  # Only keep tables with meaningful content
                    table.replace_with(f"\n[TABLE CONTENT: {table_text}]\n")
                else:
                    table.decompose()
            
            # Get clean text
            text = soup.get_text(separator='\n', strip=True)
            
            # Clean up the text
            lines = [line.strip() for line in text.split('\n') if line.strip()]
            cleaned_text = '\n'.join(lines)
            
            if len(cleaned_text) > 100:  # Only use if we got substantial content
                return cleaned_text
        except Exception as e:
            print(f"⚠️ BeautifulSoup conversion failed: {str(e)}")
        
        # Strategy 3: Simple regex fallback
        try:
            # Remove HTML tags
            text = re.sub(r'<[^>]+>', '', html)
            # Remove extra whitespace
            text = re.sub(r'\s+', ' ', text).strip()
            return text if len(text) > 10 else "Content extraction failed"
        except Exception as e:
            print(f"⚠️ Final fallback failed: {str(e)}")
            return html[:200] + "..." if len(html) > 200 else html  # Last resort
    
    def handle_urgent_email(self, email_data):
        """Process urgent corporate emails and send to urgent handler"""
        try:
            analysis = email_data.get('urgency_analysis', {})
            if not analysis.get('is_urgent', False):
                print("ℹ️ Email not classified as urgent - skipping urgent handler")
                return False
            
            print(f"\n🚨 URGENT CORPORATE EMAIL DETECTED")
            print(f"   Category: {analysis.get('category', 'UNKNOWN')}")
            print(f"   Urgency Score: {analysis.get('urgency_score', 0.0):.2f}/1.0")
            print(f"   Response Timeframe: {analysis.get('response_timeframe', 'Unknown')}")
            print(f"   Reason: {analysis.get('reason', 'No reason provided')}")
            
            # Generate AI summary
            print("🧠 Generating AI summary with qwen-max...")
            summary = self.summarize_urgent_email(email_data)
            
            # Prepare urgent email payload for handler
            urgent_payload = {
                'email_id': email_data['id'],
                'sender': email_data['sender'],
                'subject': email_data['subject'],
                'timestamp': datetime.now().isoformat(),
                'category': analysis.get('category', 'GENERAL'),
                'urgency_score': analysis.get('urgency_score', 0.0),
                'response_timeframe': analysis.get('response_timeframe', 'Routine'),
                'summary': summary,
                'full_content': email_data['body'][:1000] + "..." if len(email_data['body']) > 1000 else email_data['body'],
                'analysis_reason': analysis.get('reason', 'AI analyzed'),
                'requires_human_review': analysis.get('urgency_score', 0.0) >= 0.85
            }
            
            print("\n✅ Urgent email processed and ready for handler")
            print("-" * 60)
            print(summary)
            print("-" * 60)
            
            # This is where you would send to your urgent handler
            # In a real implementation, this might call an API, write to a database, or send a notification
            self._send_to_urgent_handler(urgent_payload)
            
            return True
            
        except Exception as e:
            print(f"❌ Error handling urgent email: {str(e)}")
            return False
    
    def _send_to_urgent_handler(self, urgent_payload):
        """Send urgent email data to the urgent handler system"""
        try:
            print(f"📤 Sending urgent email to handler: '{urgent_payload['subject']}'")
            
            # In a real implementation, you might:
            # 1. Save to a database with urgent flag
            # 2. Send via webhook to an urgent handling service
            # 3. Create a high-priority notification
            # 4. Write to a dedicated urgent emails file
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            urgent_file = f"urgent_email_{timestamp}.json"
            
            with open(urgent_file, 'w', encoding='utf-8') as f:
                json.dump(urgent_payload, f, indent=2, ensure_ascii=False)
            
            print(f"✅ Urgent email saved to handler file: {urgent_file}")
            print(f"🔔 Notification: Urgent {urgent_payload['category']} email requires attention")
            
            # Mark as read since it's been processed and sent to handler
            self.mark_as_read(urgent_payload['email_id'])
            
        except Exception as e:
            print(f"⚠️ Error sending to urgent handler: {str(e)}")
            # Don't mark as read if handler failed, so it can be processed again