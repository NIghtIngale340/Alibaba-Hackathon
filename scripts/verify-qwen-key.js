/**
 * Quick test to verify Qwen API key is working
 * Run: node scripts/verify-qwen-key.js
 */

const fs = require('fs');
const path = require('path');

// Read API key from .env file
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const apiKeyMatch = envContent.match(/QWEN_API_KEY=(.+)/);
const QWEN_API_KEY = apiKeyMatch ? apiKeyMatch[1].trim() : null;

async function testQwenAPI() {
  console.log('\n🔍 Testing Qwen API Key...\n');
  
  if (!QWEN_API_KEY) {
    console.error('❌ QWEN_API_KEY not found in .env file');
    process.exit(1);
  }
  
  console.log(`✓ API Key found: ${QWEN_API_KEY.substring(0, 10)}...`);
  console.log('✓ Making test request to Qwen API...\n');
  
  try {
    const response = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${QWEN_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [
          {
            role: 'user',
            content: 'Hello, this is a test. Please respond with "OK".',
          },
        ],
      }),
    });

    console.log(`Response Status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Request Failed');
      console.error('Status:', response.status);
      console.error('Response:', errorText);
      
      if (response.status === 401) {
        console.error('\n💡 Solutions:');
        console.error('1. Check if API key is valid at https://dashscope.aliyun.com/');
        console.error('2. Verify you have active credits in your Alibaba Cloud account');
        console.error('3. Make sure the API key has not expired');
        console.error('4. Try generating a new API key');
      }
      
      process.exit(1);
    }

    const data = await response.json();
    console.log('✅ API Key is VALID!\n');
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log('\n🎉 Qwen API is working correctly!');
    console.log('You can now use the Calendar Agent.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testQwenAPI();
