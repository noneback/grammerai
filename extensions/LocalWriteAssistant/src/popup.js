// Popup script for LocalWrite Assistant

document.addEventListener('DOMContentLoaded', function() {
  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      
      // Update active tab button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Show active tab pane
      tabPanes.forEach(pane => pane.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
    });
  });
  
  // Elements
  const modelStatusElement = document.getElementById('model-status');
  const highlightToggle = document.getElementById('highlight-toggle');
  const suggestionToggle = document.getElementById('suggestion-toggle');
  const responseSpeed = document.getElementById('response-speed');
  const memoryValueElement = document.getElementById('memory-value');
  const clearCacheButton = document.getElementById('clear-cache');
  
  // Model settings elements
  const providerSelect = document.getElementById('provider');
  const apiUrlInput = document.getElementById('api-url');
  const apiKeyInput = document.getElementById('api-key');
  const modelNameInput = document.getElementById('model-name');
  const temperatureSlider = document.getElementById('temperature');
  const temperatureValue = document.getElementById('temperature-value');
  const saveModelButton = document.getElementById('save-model');
  const testConnectionButton = document.getElementById('test-connection');
  const saveSettingsButton = document.getElementById('save-settings');
  
  // Temperature slider
  temperatureSlider.addEventListener('input', () => {
    temperatureValue.textContent = temperatureSlider.value;
  });
  
  // Provider selection
  providerSelect.addEventListener('change', () => {
    const provider = providerSelect.value;
    
    switch (provider) {
      case 'ollama':
        apiUrlInput.placeholder = 'http://localhost:11434';
        apiKeyInput.placeholder = '不需要 API 密钥';
        modelNameInput.placeholder = 'llama2, mistral, etc.';
        break;
      case 'openai':
        apiUrlInput.placeholder = 'https://api.openai.com/v1/chat/completions';
        apiKeyInput.placeholder = 'sk-...';
        modelNameInput.placeholder = 'gpt-3.5-turbo, gpt-4, etc.';
        break;
      case 'custom':
        apiUrlInput.placeholder = 'https://your-api-endpoint.com';
        apiKeyInput.placeholder = 'API 密钥 (如需要)';
        modelNameInput.placeholder = '您的模型名称';
        break;
    }
  });
  
  // Load settings
  loadSettings();
  
  // Check model status
  checkModelStatus();
  
  // Update memory usage
  updateMemoryUsage();
  
  // Event listeners
  saveModelButton.addEventListener('click', saveModelSettings);
  saveSettingsButton.addEventListener('click', saveGeneralSettings);
  testConnectionButton.addEventListener('click', testConnection);
  clearCacheButton.addEventListener('click', clearCache);
  highlightToggle.addEventListener('change', saveGeneralSettings);
  suggestionToggle.addEventListener('change', saveGeneralSettings);
  responseSpeed.addEventListener('change', saveGeneralSettings);
  
  // Update memory usage periodically
  setInterval(updateMemoryUsage, 5000);
});

// Load settings from storage
function loadSettings() {
  chrome.storage.local.get({
    // General settings
    highlightErrors: true,
    showSuggestions: true,
    responseSpeed: 'balanced',
    
    // Model settings
    modelConfig: {
      provider: 'ollama',
      apiUrl: 'http://localhost:11434',
      apiKey: '',
      modelName: 'llama2',
      temperature: 0.3
    }
  }, (items) => {
    // General settings
    document.getElementById('highlight-toggle').checked = items.highlightErrors;
    document.getElementById('suggestion-toggle').checked = items.showSuggestions;
    document.getElementById('response-speed').value = items.responseSpeed;
    
    // Model settings
    const config = items.modelConfig;
    document.getElementById('provider').value = config.provider;
    document.getElementById('api-url').value = config.apiUrl;
    document.getElementById('api-key').value = config.apiKey;
    document.getElementById('model-name').value = config.modelName;
    
    const temperatureSlider = document.getElementById('temperature');
    temperatureSlider.value = config.temperature;
    document.getElementById('temperature-value').textContent = config.temperature;
    
    // Trigger provider change to update placeholders
    const event = new Event('change');
    document.getElementById('provider').dispatchEvent(event);
  });
}

// Save model settings
function saveModelSettings() {
  const config = {
    provider: document.getElementById('provider').value,
    apiUrl: document.getElementById('api-url').value,
    apiKey: document.getElementById('api-key').value,
    modelName: document.getElementById('model-name').value,
    temperature: parseFloat(document.getElementById('temperature').value)
  };
  
  chrome.runtime.sendMessage(
    { action: 'updateModelConfig', config },
    (response) => {
      if (response && response.success) {
        showConnectionResult('设置已保存并应用', true);
        checkModelStatus();
      } else {
        showConnectionResult('保存设置失败: ' + (response ? response.error : '未知错误'), false);
      }
    }
  );
}

// Save general settings
function saveGeneralSettings() {
  const highlightErrors = document.getElementById('highlight-toggle').checked;
  const showSuggestions = document.getElementById('suggestion-toggle').checked;
  const responseSpeed = document.getElementById('response-speed').value;
  
  chrome.storage.local.set({
    highlightErrors: highlightErrors,
    showSuggestions: showSuggestions,
    responseSpeed: responseSpeed
  }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "settingsUpdated",
          settings: {
            highlightErrors,
            showSuggestions,
            responseSpeed
          }
        });
      }
    });
  });
}

// Test connection to the API
function testConnection() {
  const connectionResult = document.getElementById('connection-result');
  connectionResult.textContent = '正在测试连接...';
  connectionResult.className = '';
  connectionResult.classList.add('visible');
  
  chrome.runtime.sendMessage(
    { action: 'testConnection' },
    (response) => {
      if (response && response.success) {
        showConnectionResult('连接成功！模型可用。', true);
      } else {
        showConnectionResult('连接失败: ' + (response ? response.error : '未知错误'), false);
      }
    }
  );
}

// Show connection test result
function showConnectionResult(message, isSuccess) {
  const connectionResult = document.getElementById('connection-result');
  connectionResult.textContent = message;
  connectionResult.className = isSuccess ? 'success' : 'error';
  connectionResult.classList.remove('hidden');
  
  // Hide after 5 seconds
  setTimeout(() => {
    connectionResult.classList.add('hidden');
  }, 5000);
}

// Check model status
function checkModelStatus() {
  const modelStatusElement = document.getElementById('model-status');
  
  chrome.runtime.sendMessage({ action: "getModelStatus" }, (response) => {
    if (response && response.isLoaded) {
      modelStatusElement.textContent = '已连接';
      modelStatusElement.className = 'status-value loaded';
    } else {
      modelStatusElement.textContent = '未连接';
      modelStatusElement.className = 'status-value error';
    }
  });
}

// Update memory usage
function updateMemoryUsage() {
  chrome.runtime.sendMessage({ action: "getModelStatus" }, (response) => {
    const memoryValueElement = document.getElementById('memory-value');
    
    if (response && response.memoryUsage) {
      memoryValueElement.textContent = `${response.memoryUsage.total} MB`;
    } else {
      memoryValueElement.textContent = '-- MB';
    }
  });
}

// Clear cache
function clearCache() {
  chrome.runtime.sendMessage(
    { action: "clearCache" },
    (response) => {
      if (response && response.success) {
        alert("缓存已清除");
        updateMemoryUsage();
      } else {
        alert("清除缓存失败");
      }
    }
  );
}
