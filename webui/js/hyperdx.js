/**
 * HyperDX Browser SDK Integration for Agent Zero
 * Provides session replay, trace correlation, and observability
 */

// HyperDX configuration
const HYPERDX_CONFIG = {
    apiKey: 'KksW498NLF7s4Arr5fhprcrnDS1ZU9UU',
    service: 'agent-zero-webui',
    url: 'https://clickstack.taildc2cd.ts.net/v1/traces', // Our ClickStack OTEL endpoint
    consoleCapture: true,
    advancedNetworkCapture: true,
    maskAllInputs: false, // We want to capture input for debugging
    maskAllText: false,
    disableReplay: false,
    // Configure trace propagation for our backend API calls
    tracePropagationTargets: [
        /localhost/i,
        /127\.0\.0\.1/i,
        /agent-zero/i,
        /taildc2cd\.ts\.net/i
    ]
};

// Global HyperDX instance
let hyperDX = null;

/**
 * Initialize HyperDX browser SDK
 */
export async function initializeHyperDX() {
    try {
        // Check if HyperDX is already loaded
        if (window.HyperDX) {
            hyperDX = window.HyperDX;
            
            // Initialize with our configuration
            hyperDX.init(HYPERDX_CONFIG);
            
            console.log('HyperDX initialized successfully');
            
            // Set initial global attributes
            setUserContext();
            
            // Track page load
            hyperDX.addAction('page-load', {
                page: 'agent-zero-webui',
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent
            });
            
            return true;
        } else {
            console.warn('HyperDX SDK not loaded yet, retrying...');
            // Retry after a short delay
            setTimeout(initializeHyperDX, 1000);
            return false;
        }
    } catch (error) {
        console.error('Failed to initialize HyperDX:', error);
        return false;
    }
}

/**
 * Set user context for session correlation
 */
export function setUserContext(userInfo = {}) {
    if (!hyperDX) return;
    
    try {
        const context = {
            userId: userInfo.userId || 'anonymous',
            userEmail: userInfo.userEmail || null,
            userName: userInfo.userName || 'Agent Zero User',
            sessionId: getSessionId(),
            environment: 'production',
            version: getAgentZeroVersion(),
            ...userInfo
        };
        
        hyperDX.setGlobalAttributes(context);
        console.log('HyperDX user context set:', context);
    } catch (error) {
        console.error('Failed to set HyperDX user context:', error);
    }
}

/**
 * Track custom actions in HyperDX
 */
export function trackAction(actionName, metadata = {}) {
    if (!hyperDX) return;
    
    try {
        const actionData = {
            timestamp: new Date().toISOString(),
            sessionId: getSessionId(),
            ...metadata
        };
        
        hyperDX.addAction(actionName, actionData);
        console.log(`HyperDX action tracked: ${actionName}`, actionData);
    } catch (error) {
        console.error(`Failed to track HyperDX action ${actionName}:`, error);
    }
}

/**
 * Track message sending
 */
export function trackMessageSent(message, attachments = []) {
    trackAction('message-sent', {
        messageLength: message.length,
        hasAttachments: attachments.length > 0,
        attachmentCount: attachments.length,
        attachmentTypes: attachments.map(a => a.type)
    });
}

/**
 * Track tool execution
 */
export function trackToolExecution(toolName, args = {}) {
    trackAction('tool-execution', {
        toolName,
        argsCount: Object.keys(args).length
    });
}

/**
 * Track agent response
 */
export function trackAgentResponse(responseLength, toolsUsed = []) {
    trackAction('agent-response', {
        responseLength,
        toolsUsed,
        toolCount: toolsUsed.length
    });
}

/**
 * Track error events
 */
export function trackError(error, context = {}) {
    if (!hyperDX) return;
    
    try {
        hyperDX.addAction('error-occurred', {
            errorMessage: error.message || error,
            errorStack: error.stack,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString(),
            ...context
        });
    } catch (e) {
        console.error('Failed to track error in HyperDX:', e);
    }
}

/**
 * Get or generate session ID
 */
function getSessionId() {
    let sessionId = sessionStorage.getItem('agent-zero-session-id');
    if (!sessionId) {
        sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('agent-zero-session-id', sessionId);
    }
    return sessionId;
}

/**
 * Get Agent Zero version (if available)
 */
function getAgentZeroVersion() {
    // Try to get version from global variable or default
    return window.AGENT_ZERO_VERSION || 'unknown';
}

/**
 * Enable/disable advanced network capture dynamically
 */
export function toggleNetworkCapture(enabled) {
    if (!hyperDX) return;
    
    try {
        if (enabled) {
            hyperDX.enableAdvancedNetworkCapture();
        } else {
            hyperDX.disableAdvancedNetworkCapture();
        }
        console.log(`HyperDX network capture ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
        console.error('Failed to toggle HyperDX network capture:', error);
    }
}

// Global error handler
window.addEventListener('error', (event) => {
    trackError(event.error || event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
    });
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    trackError(event.reason, {
        type: 'unhandled-promise-rejection'
    });
});

// Export the HyperDX instance for external use
export { hyperDX };
