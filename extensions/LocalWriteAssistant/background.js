
let aiModel = null;
let isModelLoaded = false;

async function initExtension() {
  console.log("LocalWrite Assistant: Initializing extension");
  
  try {
    aiModel = new self.LocalAIModel();
    await aiModel.initialize();
    isModelLoaded = aiModel.isModelLoaded();
    
    chrome.storage.local.set({ 
      modelStatus: isModelLoaded,
      memoryUsage: aiModel.getMemoryUsage()
    });
    
    console.log("LocalWrite Assistant: Initialization complete");
  } catch (error) {
    console.error("Error initializing extension:", error);
    chrome.storage.local.set({ 
      modelStatus: false,
      error: error.message
    });
  }
}

async function processText(text) {
  if (!isModelLoaded || !aiModel) {
    console.warn("Model not connected yet");
    return { 
      success: false, 
      message: "Model not connected" 
    };
  }
  
  try {
    console.log("Processing text:", text);
    
    const result = await aiModel.processText(text);
    
    chrome.storage.local.set({ 
      memoryUsage: aiModel.getMemoryUsage(),
      performanceMetrics: aiModel.getPerformanceMetrics()
    });
    
    return {
      success: true,
      corrections: result.corrections,
      processingTime: result.processingTime
    };
  } catch (error) {
    console.error("Error processing text:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function updateModelConfig(config) {
  try {
    if (!aiModel) {
      aiModel = new self.LocalAIModel();
    }
    
    const result = await aiModel.saveConfig(config);
    
    await aiModel.initialize();
    isModelLoaded = aiModel.isModelLoaded();
    
    chrome.storage.local.set({ 
      modelStatus: isModelLoaded,
      memoryUsage: aiModel.getMemoryUsage()
    });
    
    return {
      success: true,
      isLoaded: isModelLoaded
    };
  } catch (error) {
    console.error("Error updating model configuration:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "processText") {
    processText(request.text)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message 
      }));
    return true; // Required for async response
  } 
  else if (request.action === "getModelStatus") {
    if (aiModel) {
      sendResponse({ 
        isLoaded: isModelLoaded,
        memoryUsage: aiModel.getMemoryUsage(),
        performanceMetrics: aiModel.getPerformanceMetrics(),
        modelConfig: aiModel.modelConfig
      });
    } else {
      sendResponse({ isLoaded: false });
    }
    return true;
  }
  else if (request.action === "updateModelConfig") {
    updateModelConfig(request.config)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message 
      }));
    return true;
  }
  else if (request.action === "clearCache") {
    if (aiModel) {
      aiModel.clearCache()
        .then(result => sendResponse({ success: result }))
        .catch(error => sendResponse({ 
          success: false, 
          error: error.message 
        }));
      return true;
    }
    sendResponse({ success: false, message: "Model not initialized" });
    return true;
  }
  else if (request.action === "testConnection") {
    if (aiModel) {
      aiModel.testConnection()
        .then(result => sendResponse({ success: result }))
        .catch(error => sendResponse({ 
          success: false, 
          error: error.message 
        }));
      return true;
    }
    sendResponse({ success: false, message: "Model not initialized" });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  initExtension();
});

chrome.runtime.onStartup.addListener(() => {
  initExtension();
});

self.importScripts('model.js');
