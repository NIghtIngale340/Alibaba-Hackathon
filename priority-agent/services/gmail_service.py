# services/gmail_service.py
import os
import pickle
import base64
import re
import time
import ssl
import urllib3
from pathlib import Path
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from bs4 import BeautifulSoup
import html2text

# Fix SSL certificate issues on Windows
ssl._create_default_https_context = ssl._create_unverified_context
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class GmailService:
    def __init__(self):
        # Updated scope to allow marking emails as read
        self.SCOPES = [os.getenv('GMAIL_SCOPES', 'https://www.googleapis.com/auth/gmail.modify')]
        # Use script directory instead of current working directory
        script_dir = Path(__file__).parent.parent.resolve()
        self.tokens_dir = script_dir / "tokens"
        self.credentials_path = script_dir / "credentials" / "credentials.json"
        self.token_path = self.tokens_dir / "token.pickle"
        
        # Ensure tokens directory exists
        self.tokens_dir.mkdir(parents=True, exist_ok=True)
        
        # Verify required scope for marking emails as read
        if os.getenv('MARK_READ_AFTER_PROCESSING', 'true').lower() == 'true':
            if 'modify' not in self.SCOPES[0] and 'full' not in self.SCOPES[0]:
                print("⚠️ WARNING: MARK_READ_AFTER_PROCESSING enabled but missing required permissions")
                print("🔧 Required scope: https://www.googleapis.com/auth/gmail.modify")
                print("📝 Update config/settings.env and delete tokens/token.pickle to re-authenticate")
        
        self.service = self._authenticate()
    
    def _authenticate(self):
        """Handle Gmail authentication with robust error recovery"""
        creds = None
        
        # Only load token if file exists and is not empty
        if self.token_path.exists() and self.token_path.stat().st_size > 0:
            try:
                with open(self.token_path, 'rb') as token:
                    creds = pickle.load(token)
                print("✅ Loaded existing credentials")
            except (EOFError, pickle.UnpicklingError, ValueError, TypeError) as e:
                print(f"⚠️ Corrupted token file detected: {str(e)}")
                print("🔄 Deleting invalid token and re-authenticating...")
                if self.token_path.exists():
                    self.token_path.unlink()
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
                if not self.credentials_path.exists():
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
        """Fetch all unread emails that arrived in the last 24 hours, excluding spam"""
        try:
            import datetime
            yesterday = (datetime.datetime.now() - datetime.timedelta(days=1)).strftime('%Y/%m/%d')
            
            # Get unread emails that are NOT in spam or promotions tabs
            results = self.service.users().messages().list(
                userId='me',
                q=f'is:unread after:{yesterday} -in:spam -in:promotions',
                maxResults=max_emails
            ).execute()
            
            messages = results.get('messages', [])
            if not messages:
                print("📭 No new unread emails found (excluding spam/promotions)")
                return []
            
            print(f"📬 Found {len(messages)} potential new emails")
            emails = []
            
            for i, message in enumerate(messages, 1):
                print(f"📥 Processing email {i}/{len(messages)}...")
                try:
                    email_data = self._get_email_content(message['id'])
                    if email_data and not self._is_spam_content(email_data):
                        emails.append(email_data)
                    else:
                        print(f"🗑️  Filtered out spam/promotional email: {email_data.get('subject', 'Unknown Subject') if email_data else 'Unknown'}")
                except Exception as e:
                    print(f"❌ Error processing email {i}: {str(e)}")
            
            print(f"✅ {len(emails)} non-spam emails identified for processing")
            return emails
            
        except Exception as e:
            print(f"❌ Error fetching unread emails: {str(e)}")
            return []
    
    def mark_as_read(self, message_id):
        """Mark an email as read after processing"""
        try:
            self.service.users().messages().modify(
                userId='me',
                id=message_id,
                body={'removeLabelIds': ['UNREAD']}
            ).execute()
            print(f"✅ Successfully marked email {message_id} as read")
            return True
        except HttpError as error:
            if error.resp.status == 403:
                print(f"⚠️ Permission denied when marking email as read. Check your GMAIL_SCOPES setting.")
                print("🔧 Required scope for marking emails as read: https://www.googleapis.com/auth/gmail.modify")
                return False
            print(f"⚠️ Failed to mark email as read: {str(error)}")
            return False
        except Exception as e:
            print(f"⚠️ Failed to mark email as read: {str(e)}")
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
        """Basic spam content detection"""
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
            'congratulations', 'you have won', 'cash', 'prize', 'urgent action required'
        ]
        
        spam_count = sum(1 for indicator in spam_indicators if indicator in text)
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