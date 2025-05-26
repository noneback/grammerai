
class LocalAIModel {
  constructor() {
    this.isLoaded = false;
    this.modelConfig = {
      provider: 'custom', // 'openai', 'ollama', 'custom'
      apiUrl: '',
      apiKey: '',
      modelName: '',
      temperature: 0.3,
      maxTokens: 100
    };
    
    this.memoryUsage = {
      total: 0,
      model: 0,
      other: 0
    };
    
    this.perfMonitor = {
      loadTime: 0,
      inferenceTime: 0,
      totalCalls: 0,
      averageInferenceTime: 0
    };
    
    this.startTime = 0;
    this.endTime = 0;
    
    this.cache = new Map();
    this.MAX_CACHE_SIZE = 50;
  }

  async initialize() {
    console.log('Initializing model connection...');
    
    try {
      this.startTime = performance.now();
      
      await this.loadConfig();
      
      const testResult = await this.testConnection();
      
      this.endTime = performance.now();
      this.perfMonitor.loadTime = this.endTime - this.startTime;
      
      this.isLoaded = testResult;
      console.log(`Model connection initialized in ${this.perfMonitor.loadTime.toFixed(2)}ms`);
      
      this.memoryUsage.model = 10; // Minimal memory usage since we're not loading models
      this.memoryUsage.other = 20;
      this.memoryUsage.total = this.memoryUsage.model + this.memoryUsage.other;
      
      return testResult;
    } catch (error) {
      console.error('Failed to initialize model connection:', error);
      return false;
    }
  }

  async loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['modelConfig'], (result) => {
        if (result.modelConfig) {
          this.modelConfig = { ...this.modelConfig, ...result.modelConfig };
          console.log('Loaded model configuration:', this.modelConfig);
        } else {
          console.log('No saved model configuration found, using defaults');
        }
        resolve();
      });
    });
  }

  async saveConfig(config) {
    return new Promise((resolve) => {
      const updatedConfig = { ...this.modelConfig, ...config };
      chrome.storage.local.set({ modelConfig: updatedConfig }, () => {
        this.modelConfig = updatedConfig;
        console.log('Saved model configuration:', updatedConfig);
        resolve(true);
      });
    });
  }

  async testConnection() {
    try {
      if (!this.modelConfig.apiUrl) {
        console.warn('API URL not configured');
        return false;
      }
      
      if (this.modelConfig.provider === 'ollama') {
        const response = await fetch(`${this.modelConfig.apiUrl}/api/tags`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.status}`);
        }
        
        console.log('Ollama connection successful');
        return true;
      }
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (this.modelConfig.apiKey) {
        headers['Authorization'] = `Bearer ${this.modelConfig.apiKey}`;
      }
      
      if (this.modelConfig.provider === 'openai' || 
          (this.modelConfig.provider === 'custom' && 
           (this.modelConfig.apiUrl.includes('openai') || 
            this.modelConfig.apiUrl.includes('moonshot')))) {
        
        let baseUrl = this.modelConfig.apiUrl;
        if (baseUrl.endsWith('/chat/completions') || baseUrl.endsWith('/completions')) {
          baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/'));
        }
        if (baseUrl.endsWith('/v1')) {
          baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/'));
        }
        
        const modelsUrl = `${baseUrl}/v1/models`;
        
        try {
          const response = await fetch(modelsUrl, {
            method: 'GET',
            headers
          });
          
          if (response.ok) {
            console.log('OpenAI-compatible API connection successful');
            return true;
          }
        } catch (e) {
          console.log('Models endpoint not available, trying minimal chat completion');
        }
        
        const chatUrl = `${baseUrl}/v1/chat/completions`;
        
        const response = await fetch(chatUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: this.modelConfig.modelName || 'gpt-3.5-turbo',
            messages: [
              {
                role: 'user',
                content: 'Hello'
              }
            ],
            max_tokens: 1
          })
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        console.log('API connection successful via chat completion');
        return true;
      }
      
      try {
        const response = await fetch(this.modelConfig.apiUrl, {
          method: 'GET',
          headers
        });
        
        if (response.ok) {
          console.log('Custom API connection successful');
          return true;
        }
      } catch (e) {
        console.log('GET request failed, trying POST');
      }
      
      const response = await fetch(this.modelConfig.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: 'test',
          model: this.modelConfig.modelName
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      console.log('API connection successful');
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  isModelLoaded() {
    return this.isLoaded;
  }

  async processText(text) {
    if (!this.isLoaded) {
      throw new Error('Model not connected');
    }
    
    console.log('Processing text with external model:', text);
    
    const cacheKey = text;
    if (this.cache.has(cacheKey)) {
      console.log('Using cached result');
      return this.cache.get(cacheKey);
    }
    
    this.startTime = performance.now();
    
    try {
      let corrections = [];
      
      if (!this.modelConfig.apiUrl) {
        corrections = this.processWithRules(text);
      } else {
        switch (this.modelConfig.provider) {
          case 'ollama':
            corrections = await this.processWithOllama(text);
            break;
          case 'openai':
            corrections = await this.processWithOpenAI(text);
            break;
          case 'custom':
          default:
            corrections = await this.processWithCustomAPI(text);
            break;
        }
      }
      
      this.endTime = performance.now();
      const processingTime = this.endTime - this.startTime;
      
      this.perfMonitor.inferenceTime += processingTime;
      this.perfMonitor.totalCalls += 1;
      this.perfMonitor.averageInferenceTime = 
        this.perfMonitor.inferenceTime / this.perfMonitor.totalCalls;
      
      console.log(`Text processed in ${processingTime.toFixed(2)}ms`);
      
      const result = { corrections, processingTime };
      
      this.cache.set(cacheKey, result);
      if (this.cache.size > this.MAX_CACHE_SIZE) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      
      return result;
    } catch (error) {
      console.error('Error processing text:', error);
      
      const corrections = this.processWithRules(text);
      
      this.endTime = performance.now();
      const processingTime = this.endTime - this.startTime;
      
      return { corrections, processingTime };
    }
  }

  async processWithOllama(text) {
    try {
      const prompt = `
        You are a grammar checking assistant. Analyze the following text and identify any grammar errors.
        For each error, provide:
        1. The original text with the error
        2. The suggested correction
        3. A brief explanation of the grammar rule
        4. The position of the error in the text
        
        Format your response as a JSON array of objects with the following structure:
        [
          {
            "original": "text with error",
            "suggestion": "corrected text",
            "type": "grammar",
            "explanation": "explanation of the rule",
            "position": 0
          }
        ]
        
        Text to analyze: "${text}"
      `;
      
      const response = await fetch(`${this.modelConfig.apiUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelConfig.modelName || 'llama2',
          prompt: prompt,
          stream: false,
          options: {
            temperature: this.modelConfig.temperature,
            num_predict: this.modelConfig.maxTokens
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      const jsonMatch = data.response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const corrections = JSON.parse(jsonMatch[0]);
          return corrections;
        } catch (e) {
          console.error('Failed to parse JSON from Ollama response:', e);
        }
      }
      
      return this.processWithRules(text);
    } catch (error) {
      console.error('Error with Ollama API:', error);
      return this.processWithRules(text);
    }
  }

  async processWithOpenAI(text) {
    try {
      const response = await fetch(this.modelConfig.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.modelConfig.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelConfig.modelName || 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a grammar checking assistant. Analyze the text and identify any grammar errors. 
                        For each error, provide the original text, suggested correction, explanation, and position.
                        Respond with a JSON array of objects with the structure:
                        [{"original": "text with error", "suggestion": "corrected text", "type": "grammar", "explanation": "explanation", "position": 0}]`
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: this.modelConfig.temperature,
          max_tokens: this.modelConfig.maxTokens
        })
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      const content = data.choices[0].message.content;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        try {
          const corrections = JSON.parse(jsonMatch[0]);
          return corrections;
        } catch (e) {
          console.error('Failed to parse JSON from OpenAI response:', e);
        }
      }
      
      return this.processWithRules(text);
    } catch (error) {
      console.error('Error with OpenAI API:', error);
      return this.processWithRules(text);
    }
  }

  async processWithCustomAPI(text) {
    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (this.modelConfig.apiKey) {
        headers['Authorization'] = `Bearer ${this.modelConfig.apiKey}`;
      }
      
      const response = await fetch(this.modelConfig.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: text,
          model: this.modelConfig.modelName,
          temperature: this.modelConfig.temperature,
          max_tokens: this.modelConfig.maxTokens
        })
      });
      
      if (!response.ok) {
        throw new Error(`Custom API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (Array.isArray(data)) {
        return data;
      } else if (data.corrections && Array.isArray(data.corrections)) {
        return data.corrections;
      }
      
      return this.processWithRules(text);
    } catch (error) {
      console.error('Error with custom API:', error);
      return this.processWithRules(text);
    }
  }

  processWithRules(text) {
    const corrections = [];
    
    const svAgreementRegex = /\b(I|we|you|they)\s+(has|was)\b|\b(he|she|it)\s+(have|were)\b/gi;
    let match;
    while ((match = svAgreementRegex.exec(text)) !== null) {
      const original = match[0];
      let suggestion;
      
      if (/\b(I|we|you|they)\s+has\b/i.test(original)) {
        suggestion = original.replace(/has\b/i, 'have');
      } else if (/\b(I|we|you|they)\s+was\b/i.test(original)) {
        suggestion = original.replace(/was\b/i, 'were');
      } else if (/\b(he|she|it)\s+have\b/i.test(original)) {
        suggestion = original.replace(/have\b/i, 'has');
      } else if (/\b(he|she|it)\s+were\b/i.test(original)) {
        suggestion = original.replace(/were\b/i, 'was');
      }
      
      corrections.push({
        original,
        suggestion,
        type: 'grammar',
        explanation: 'Subject-verb agreement',
        position: match.index
      });
    }
    
    const articleRegex = /\b(a)\s+([aeiou])/gi;
    while ((match = articleRegex.exec(text)) !== null) {
      corrections.push({
        original: match[0],
        suggestion: match[0].replace(/^a\s+/i, 'an '),
        type: 'grammar',
        explanation: 'Article usage before vowel sound',
        position: match.index
      });
    }
    
    const commaSpliceRegex = /\b([^,;:.!?]+),\s+([^,;:.!?]+\b[.!?])/g;
    while ((match = commaSpliceRegex.exec(text)) !== null) {
      corrections.push({
        original: match[0],
        suggestion: match[0].replace(',', ';'),
        type: 'grammar',
        explanation: 'Comma splice (two independent clauses joined by a comma)',
        position: match.index
      });
    }
    
    return corrections;
  }

  getMemoryUsage() {
    return {
      total: this.memoryUsage.total,
      model: this.memoryUsage.model,
      other: this.memoryUsage.other
    };
  }

  async clearCache() {
    console.log('Clearing model cache...');
    
    try {
      this.cache.clear();
      
      this.perfMonitor.inferenceTime = 0;
      this.perfMonitor.totalCalls = 0;
      this.perfMonitor.averageInferenceTime = 0;
      
      console.log('Cache cleared successfully');
      return true;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return false;
    }
  }
  
  getPerformanceMetrics() {
    return {
      loadTime: this.perfMonitor.loadTime,
      averageInferenceTime: this.perfMonitor.averageInferenceTime,
      totalCalls: this.perfMonitor.totalCalls
    };
  }
}

self.LocalAIModel = LocalAIModel;
