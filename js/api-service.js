// js/api-service.js

import { tutorController } from './tutor-core.js';
import { settingsManager } from './settings-manager.js';

export let API_URL = '/api'; // Default value - will be proxied through Vite server

async function loadConfig() {
    /**
     * Loads the configuration from a JSON file.
     * Updates the API_URL if found in the config.
     */
    try {
        // Skip config loading entirely - use hardcoded values based on hostname
        const currentHost = window.location.hostname;
        if (currentHost !== 'localhost' && currentHost !== '127.0.0.1' && currentHost !== '0.0.0.0') {
            console.log(`Running on external domain (${currentHost}), using production API_URL`);
            API_URL = '/tutor/api';
        } else {
            console.log(`Running on local domain (${currentHost}), using development API_URL`);
            API_URL = '/api';
        }
        return;
    } catch (error) {
        console.warn('Error in loadConfig, using default API_URL:', API_URL);
    }
}

// Initialize configuration immediately
loadConfig().then(() => {
    console.log('Configuration loaded successfully');
    console.log('Final API_URL:', API_URL);
}).catch(error => {
    console.error('Error during configuration loading:', error);
    // Set default API URL based on hostname
    const currentHost = window.location.hostname;
    if (currentHost !== 'localhost' && currentHost !== '127.0.0.1' && currentHost !== '0.0.0.0') {
        API_URL = '/tutor/api';
    } else {
        API_URL = '/api';
    }
    console.log('Using fallback API_URL:', API_URL);
});

function getApiKey(model) {
    /**
     * Retrieves the API key for the specified model.
     * @param {string} model - The model name.
     * @returns {string} The API key for the model.
     */
    const lowerModel = model.toLowerCase();
    return settingsManager.getSetting(`${lowerModel}ApiKey`) || '';
}

async function sendAudioToServer(audioBlob, formElements) {
    /**
     * Sends recorded audio to the server for processing.
     * @param {Blob} audioBlob - The audio data to send.
     * @param {Object} formElements - Form elements containing user settings.
     * @returns {Object} The processed result from the server.
     */
    // Get the current chat object
    const currentChat = tutorController.getCurrentChat();
    
    const audioData = {
        tutoringLanguage: formElements.tutoringLanguageSelect.value,
        tutorsLanguage: formElements.tutorsLanguageSelect.value,
        tutorsVoice: formElements.tutorsVoiceSelect.value,
        partnersVoice: formElements.partnersVoiceSelect.value,
        interventionLevel: formElements.interventionLevelSelect.value,
        chatObject: currentChat, // Use the current chat object
        disableTutor: formElements.disableTutorCheckbox.checked,
        accentignore: formElements.accentIgnoreCheckbox.checked,
        model: formElements.modelSelect.value,
        playbackSpeed: formElements.playbackSpeedSlider.value,
        pauseTime: formElements.pauseTimeSlider.value,
        api_key: getApiKey(formElements.modelSelect.value)
    };

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('data', JSON.stringify(audioData));

    try {
        console.log(`Sending audio to ${API_URL}/process_audio`);
        console.time('serverProcessing');
        
        // Use a timestamp to bypass cache and potential ad blocker issues
        const timestamp = Date.now();
        const url = `${API_URL}/process_audio?t=${timestamp}`;
        console.log(`Using URL with timestamp: ${url}`);
        
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            // Add these headers to help prevent ad blocker interference
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            // Add credentials to handle any cookie-based auth
            credentials: 'include',
            // Bypass cache
            cache: 'no-store'
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        console.timeEnd('serverProcessing');
        return {
            audio_base64: result.audio_base64,
            chatObject: result.chatObject
        };
    } catch (error) {
        console.error('Error sending audio to server:', error);
        
        // Provide more helpful error messages based on the error type
        if (error.message.includes('Failed to fetch')) {
            if (API_URL.includes('127.0.0.1') || API_URL.includes('localhost')) {
                console.error('Connection to local server failed. Possible causes:');
                console.error('1. Server is not running at ' + API_URL);
                console.error('2. Browser extension (ad blocker) is blocking the request');
                console.error('3. CORS policy is preventing the request');
                throw new Error('Connection to local server failed. Check console for details.');
            } else {
                throw new Error('Failed to connect to server. Check if the server is running and accessible.');
            }
        }
        
        throw error;
    }
}

async function sendHomeworkRequest(formElements) {
    /**
     * Sends a request to generate homework based on the current chat.
     * @param {Object} formElements - Form elements containing user settings.
     * @returns {string} The generated homework content.
     */
    const requestData = {
        tutoringLanguage: formElements.tutoringLanguageSelect.value,
        tutorsLanguage: formElements.tutorsLanguageSelect.value,
        tutorsVoice: formElements.tutorsVoiceSelect.value,
        partnersVoice: formElements.partnersVoiceSelect.value,
        interventionLevel: formElements.interventionLevelSelect.value,
        chatObject: formElements.chatObject,
        disableTutor: formElements.disableTutorCheckbox.checked,
        accentignore: formElements.accentIgnoreCheckbox.checked,
        model: formElements.modelSelect.value,
        playbackSpeed: formElements.playbackSpeedSlider.value,
        pauseTime: formElements.pauseTimeSlider.value,
        api_key: getApiKey(formElements.modelSelect.value)
    };

    try {
        // Use a timestamp to bypass cache and potential ad blocker issues
        const timestamp = Date.now();
        const url = `${API_URL}/generate_homework?t=${timestamp}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            credentials: 'include',
            body: JSON.stringify(requestData),
            cache: 'no-store'
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        return result.homework;
    } catch (error) {
        console.error('Error sending homework request to server:', error);
        throw error;
    }
}

async function generateChatName(formElements) {
    /**
     * Generates a name for the chat based on its content.
     * @param {Object} formElements - Form elements containing chat data and settings.
     * @returns {string} The generated chat name.
     */
    try {
        console.log('Form elements received:', formElements);
        console.log('Model select value:', formElements.modelSelect ? formElements.modelSelect.value : 'undefined');
        console.log('Tutoring language select value:', formElements.tutoringLanguageSelect ? formElements.tutoringLanguageSelect.value : 'undefined');
        
        const requestData = {
            chat_history: formElements.chatObject.chat_history,
            tutors_comments: formElements.chatObject.tutors_comments,
            summary: formElements.chatObject.summary,
            model:  formElements.modelSelect.value,
            tutoringLanguage: formElements.tutoringLanguageSelect.value,
            api_key: getApiKey(formElements.modelSelect.value)
        };

        console.log('Sending request data:', requestData);

        // Use a timestamp to bypass cache and potential ad blocker issues
        const timestamp = Date.now();
        const url = `${API_URL}/generate_chat_name?t=${timestamp}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            credentials: 'include',
            body: JSON.stringify(requestData),
            cache: 'no-store'
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        return result.chatName;
    } catch (error) {
        console.error('Error generating chat name:', error);
        // Return a default chat name if there's an error
        return `Chat ${new Date().toLocaleString()}`;
    }
}

export { sendAudioToServer, sendHomeworkRequest, generateChatName };
