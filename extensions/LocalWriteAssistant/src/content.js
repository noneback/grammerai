
const config = {
  debounceTime: 500, // ms to wait after typing before processing
  minTextLength: 3,  // minimum text length to process
};

let activeElement = null;
let suggestionPanel = null;
let debounceTimer = null;
let errorMarkers = [];

function init() {
  console.log("LocalWrite Assistant: Content script initialized");
  
  document.addEventListener('focusin', handleFocusIn);
  document.addEventListener('input', handleInput);
  document.addEventListener('keydown', handleKeyDown);
  
  createSuggestionPanel();
  
  checkModelStatus();
}

function checkModelStatus() {
  chrome.runtime.sendMessage({ action: "getModelStatus" }, (response) => {
    if (response && response.isLoaded) {
      console.log("Model is loaded and ready");
    } else {
      console.log("Model is not loaded yet");
    }
  });
}

function handleFocusIn(event) {
  const element = event.target;
  
  if (isTextInput(element)) {
    activeElement = element;
    console.log("Focus detected on text input");
    
    if (getElementText(element).length >= config.minTextLength) {
      processElementText(element);
    }
  } else {
    activeElement = null;
    hideSuggestionPanel();
  }
}

function handleInput(event) {
  const element = event.target;
  
  if (isTextInput(element)) {
    activeElement = element;
    
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    debounceTimer = setTimeout(() => {
      const text = getElementText(element);
      if (text.length >= config.minTextLength) {
        processElementText(element);
      } else {
        clearErrorMarkers();
        hideSuggestionPanel();
      }
    }, config.debounceTime);
  }
}

function handleKeyDown(event) {
  if (event.ctrlKey && event.key === 'Enter' && suggestionPanel && suggestionPanel.style.display !== 'none') {
    event.preventDefault();
    applyTopSuggestion();
  }
  
  if (event.ctrlKey && event.shiftKey && event.key === ' ') {
    event.preventDefault();
    toggleSuggestionPanel();
  }
}

function processElementText(element) {
  const text = getElementText(element);
  
  chrome.runtime.sendMessage(
    { action: "processText", text: text },
    (response) => {
      if (response && response.success) {
        handleSuggestions(element, response.corrections);
      } else {
        console.error("Error processing text:", response ? response.error : "Unknown error");
      }
    }
  );
}

function handleSuggestions(element, corrections) {
  clearErrorMarkers();
  
  if (corrections && corrections.length > 0) {
    addErrorMarkers(element, corrections);
    
    updateSuggestionPanel(corrections);
    
    positionSuggestionPanel(element);
  } else {
    hideSuggestionPanel();
  }
}

function createSuggestionPanel() {
  if (suggestionPanel) return;
  
  suggestionPanel = document.createElement('div');
  suggestionPanel.className = 'lwa-suggestion-panel';
  suggestionPanel.style.display = 'none';
  document.body.appendChild(suggestionPanel);
}

function updateSuggestionPanel(corrections) {
  if (!suggestionPanel) return;
  
  suggestionPanel.innerHTML = '';
  
  const header = document.createElement('div');
  header.className = 'lwa-panel-header';
  header.textContent = 'LocalWrite Assistant';
  suggestionPanel.appendChild(header);
  
  corrections.forEach((correction, index) => {
    const item = document.createElement('div');
    item.className = 'lwa-suggestion-item';
    
    const suggestionText = document.createElement('div');
    suggestionText.className = 'lwa-suggestion-text';
    suggestionText.textContent = correction.suggestion;
    
    const explanation = document.createElement('div');
    explanation.className = 'lwa-explanation';
    explanation.textContent = correction.explanation;
    
    const replaceButton = document.createElement('button');
    replaceButton.className = 'lwa-replace-button';
    replaceButton.textContent = '一键替换';
    replaceButton.onclick = () => {
      applySuggestion(correction);
    };
    
    item.appendChild(suggestionText);
    item.appendChild(explanation);
    item.appendChild(replaceButton);
    
    suggestionPanel.appendChild(item);
  });
}

function positionSuggestionPanel(element) {
  if (!suggestionPanel || !element) return;
  
  const rect = element.getBoundingClientRect();
  
  suggestionPanel.style.top = `${window.scrollY + rect.bottom + 10}px`;
  suggestionPanel.style.left = `${window.scrollX + rect.right - suggestionPanel.offsetWidth}px`;
  
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  if (parseFloat(suggestionPanel.style.left) < 0) {
    suggestionPanel.style.left = '10px';
  }
  
  if (parseFloat(suggestionPanel.style.top) + suggestionPanel.offsetHeight > window.scrollY + viewportHeight) {
    suggestionPanel.style.top = `${window.scrollY + rect.top - suggestionPanel.offsetHeight - 10}px`;
  }
  
  suggestionPanel.style.display = 'block';
}

function hideSuggestionPanel() {
  if (suggestionPanel) {
    suggestionPanel.style.display = 'none';
  }
}

function toggleSuggestionPanel() {
  if (suggestionPanel) {
    if (suggestionPanel.style.display === 'none') {
      suggestionPanel.style.display = 'block';
    } else {
      suggestionPanel.style.display = 'none';
    }
  }
}

function applyTopSuggestion() {
  const items = suggestionPanel.querySelectorAll('.lwa-suggestion-item');
  if (items.length > 0) {
    items[0].querySelector('.lwa-replace-button').click();
  }
}

function applySuggestion(correction) {
  if (!activeElement) return;
  
  const text = getElementText(activeElement);
  const newText = text.replace(correction.original, correction.suggestion);
  
  setElementText(activeElement, newText);
  
  processElementText(activeElement);
}

function addErrorMarkers(element, corrections) {
  chrome.storage.local.get({ highlightErrors: true }, (settings) => {
    if (!settings.highlightErrors) {
      return; // Skip highlighting if disabled in settings
    }
    
    const text = getElementText(element);
    
    corrections.forEach(correction => {
      try {
        if (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea') {
          console.log(`Error detected: "${correction.original}" -> "${correction.suggestion}"`);
        } 
        else if (element.isContentEditable) {
          const instances = findTextInstances(element, correction.original);
          
          instances.forEach(instance => {
            const range = document.createRange();
            range.setStart(instance.node, instance.startOffset);
            range.setEnd(instance.node, instance.endOffset);
            
            const marker = document.createElement('span');
            marker.className = `lwa-error-marker ${correction.type === 'grammar' ? 'lwa-grammar-error' : 'lwa-style-suggestion'}`;
            marker.textContent = correction.original;
            marker.title = correction.explanation;
            
            const tooltip = document.createElement('div');
            tooltip.className = 'lwa-tooltip';
            tooltip.textContent = correction.explanation;
            marker.appendChild(tooltip);
            
            marker.addEventListener('click', () => {
              applySuggestion(correction);
            });
            
            range.deleteContents();
            range.insertNode(marker);
            
            errorMarkers.push(marker);
          });
        }
      } catch (error) {
        console.error('Error adding marker:', error);
      }
    });
  });
}

function findTextInstances(element, searchText) {
  const instances = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
  
  let node;
  while (node = walker.nextNode()) {
    const nodeText = node.nodeValue;
    let position = nodeText.indexOf(searchText);
    
    while (position !== -1) {
      instances.push({
        node: node,
        startOffset: position,
        endOffset: position + searchText.length
      });
      
      position = nodeText.indexOf(searchText, position + 1);
    }
  }
  
  return instances;
}

function clearErrorMarkers() {
  errorMarkers.forEach(marker => {
    if (marker.parentNode) {
      marker.parentNode.removeChild(marker);
    }
  });
  errorMarkers = [];
}

function isTextInput(element) {
  if (!element) return false;
  
  const tagName = element.tagName.toLowerCase();
  
  if (tagName === 'input') {
    const type = element.type.toLowerCase();
    return type === 'text' || type === 'email' || type === 'search' || type === 'url';
  }
  
  if (tagName === 'textarea') {
    return true;
  }
  
  if (element.isContentEditable) {
    return true;
  }
  
  return false;
}

function getElementText(element) {
  if (!element) return '';
  
  const tagName = element.tagName.toLowerCase();
  
  if (tagName === 'input' || tagName === 'textarea') {
    return element.value;
  }
  
  if (element.isContentEditable) {
    return element.textContent;
  }
  
  return '';
}

function setElementText(element, text) {
  if (!element) return;
  
  const tagName = element.tagName.toLowerCase();
  
  if (tagName === 'input' || tagName === 'textarea') {
    element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
  
  if (element.isContentEditable) {
    element.textContent = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
