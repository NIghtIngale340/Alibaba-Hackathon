# services/dashscope_service.py
import os
import json
from openai import OpenAI
from dotenv import load_dotenv

class DashScopeService:
    def __init__(self):
        """Initialize with qwen-max model (premium)"""
        # Load environment variables
        load_dotenv('config/settings.env')
        
        self.api_key = os.getenv("DASHSCOPE_API_KEY")
        if not self.api_key:
            raise ValueError("❌ DASHSCOPE_API_KEY missing in config/settings.env")
        
        # Use qwen-max model (premium version)
        self.model = "qwen-max"
        self.client = OpenAI(
            api_key=self.api_key,
            base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
        )
        print(f"✅ Using premium AI model: {self.model}")
    
    def summarize_email(self, email_content):
        """Generate professional summary using qwen-max"""
        try:
            # Optimized prompt for email summarization
            messages = [
                {"role": "system", "content": "You are an executive assistant. Summarize emails concisely while preserving key information, action items, and important details. Be professional and accurate."},
                {"role": "user", "content": f"Summarize this email in 3-4 professional sentences:\n\n{email_content}"}
            ]
            
            print("🧠 Generating AI summary with qwen-max...")
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.2,    # Lower for more factual output
                max_tokens=200,     # Sufficient for email summaries
                top_p=0.85
            )
            
            summary = response.choices[0].message.content.strip()
            print(f"✅ qwen-max summary generated successfully")
            
            return summary
            
        except Exception as e:
            error_msg = str(e)
            if "AccessDenied.Unpurchased" in error_msg:
                return "❌ Model access denied. Please purchase qwen-max credits at DashScope console"
            elif "InvalidApiKey" in error_msg:
                return "❌ Invalid API key. Please check your DashScope API key in config/settings.env"
            return f"❌ AI summarization failed: {error_msg[:100]}"
    
    def analyze_confidentiality(self, email_content):
        """Use qwen-max to analyze email confidentiality level"""
        try:
            prompt = f"""
You are a security analyst. Analyze this email and determine its confidentiality level on a scale of 0.0-1.0 where:
- 0.0-0.4: Public information, no confidentiality concerns
- 0.5-0.7: Internal business information, requires discretion
- 0.8-1.0: Highly confidential, sensitive information that could cause significant damage if disclosed

Consider these factors:
1. Contains sensitive business information (financial data, trade secrets, strategic plans)
2. Contains personal/HR information (salaries, performance reviews, personal details)
3. Contains legal/security information (lawsuits, breaches, compliance issues)
4. Sender/receiver relationship and context
5. Explicit confidentiality markers (confidential, private, internal only)

Email content:
{email_content}

Return ONLY the numerical score (0.0-1.0) with no other text.
"""
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a security analyst specializing in information classification."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,  # Very low for factual accuracy
                max_tokens=10
            )
            
            score_text = response.choices[0].message.content.strip()
            try:
                score = float(score_text)
                return min(1.0, max(0.0, score))  # Clamp between 0.0 and 1.0
            except ValueError:
                print(f"⚠️ Invalid score format from AI: '{score_text}'")
                return 0.5  # Default to medium confidentiality
                
        except Exception as e:
            print(f"⚠️ Confidentiality analysis failed: {str(e)}")
            return 0.5  # Default to medium confidentiality

    def generate_response_suggestions(self, email_content):
        """Generate suggested responses for urgent emails using qwen-max"""
        try:
            prompt = f"""
You are an executive assistant. Generate 3 concise, professional response suggestions for this email. Each suggestion should be 1-2 sentences max.

Format your response EXACTLY like this:
1. [First suggestion text]
2. [Second suggestion text] 
3. [Third suggestion text]

Email content:
{email_content}
"""
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an executive assistant generating professional email response suggestions."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=150
            )
            
            suggestions = response.choices[0].message.content.strip()
            return suggestions
            
        except Exception as e:
            return f"Could not generate response suggestions: {str(e)}"