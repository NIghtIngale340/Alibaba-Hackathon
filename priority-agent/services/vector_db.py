# services/vector_db.py
import os
import json
import numpy as np
from datetime import datetime
from typing import Dict, Any
import re

class VectorDB:
    def __init__(self):
        """Initialize vector database for urgent emails and normal database for others"""
        self.urgent_db_path = "urgent_emails_db.json"
        self.normal_db_path = "normal_emails_db.json"
        self.urgent_emails = []
        self.normal_emails = []
        
        # Load existing databases
        self._load_existing_databases()
    
    def _load_existing_databases(self):
        """Load existing databases from disk if available"""
        # Load urgent emails database
        if os.path.exists(self.urgent_db_path):
            try:
                with open(self.urgent_db_path, 'r', encoding='utf-8') as f:
                    self.urgent_emails = json.load(f)
                print(f"✅ Loaded urgent emails database with {len(self.urgent_emails)} entries")
            except Exception as e:
                print(f"⚠️ Error loading urgent emails database: {str(e)}")
                self.urgent_emails = []
        
        # Load normal emails database
        if os.path.exists(self.normal_db_path):
            try:
                with open(self.normal_db_path, 'r', encoding='utf-8') as f:
                    self.normal_emails = json.load(f)
                print(f"✅ Loaded normal emails database with {len(self.normal_emails)} entries")
            except Exception as e:
                print(f"⚠️ Error loading normal emails database: {str(e)}")
                self.normal_emails = []
    
    def add_urgent_email(self, email_metadata: Dict[str, Any]):
        """Add urgent email to vector database (only once per scanning cycle)"""
        # Check if email already exists in database
        if any(email['email_id'] == email_metadata['email_id'] for email in self.urgent_emails):
            print(f"⏭️  Urgent email already exists in database (ID: {email_metadata['email_id']})")
            return False
        
        # Add qwen-max processing metadata
        email_metadata.update({
            'ai_model': 'qwen-max',
            'processing_timestamp': datetime.now().isoformat(),
            'requires_human_review': email_metadata['confidential_score'] > 0.97
        })
        
        # Add to urgent emails database
        self.urgent_emails.append(email_metadata)
        
        # Save to disk immediately
        try:
            with open(self.urgent_db_path, 'w', encoding='utf-8') as f:
                json.dump(self.urgent_emails, f, indent=2, default=str)
            print(f"✅ Urgent email stored with qwen-max metadata: {email_metadata['subject']} (Score: {email_metadata['confidential_score']})")
            return True
        except Exception as e:
            print(f"❌ Error saving urgent email to database: {str(e)}")
            # Remove from in-memory list if save failed
            self.urgent_emails.pop()
            return False
    
    def add_normal_email(self, email_metadata: Dict[str, Any]):
        """Add normal or spam email to normal database"""
        # Check if email already exists in database
        if any(email['email_id'] == email_metadata['email_id'] for email in self.normal_emails):
            print(f"⏭️  Normal email already exists in database (ID: {email_metadata['email_id']})")
            return False
        
        # Add to normal emails database
        self.normal_emails.append(email_metadata)
        
        # Save to disk immediately
        try:
            with open(self.normal_db_path, 'w', encoding='utf-8') as f:
                json.dump(self.normal_emails, f, indent=2, default=str)
            print(f"✅ Normal/spam email stored: {email_metadata['subject']} (Category: {email_metadata['category']})")
            return True
        except Exception as e:
            print(f"❌ Error saving normal email to database: {str(e)}")
            # Remove from in-memory list if save failed
            self.normal_emails.pop()
            return False
    
    def get_urgent_emails(self):
        """Get all urgent emails from database"""
        return self.urgent_emails
    
    def get_normal_emails(self):
        """Get all normal/spam emails from database"""
        return self.normal_emails
    
    def get_pending_reviews(self):
        """Get urgent emails that require human review (very high confidential scores)"""
        return [email for email in self.urgent_emails 
                if email.get('requires_human_review', False) 
                and email.get('review_status') != 'completed']