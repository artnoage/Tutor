// js/api-service.js

import { tutorController } from './tutor-core.js';
import { settingsManager } from './settings-manager.js';

export let API_URL = 'http://127.0.0.1:8080'; // Default value

async function loadConfig() {
    try {
        // Adjust the path to go up one level from the js folder to the root
        const response = await fetch('../config.json');
        const config = await response.json();
        API_URL = config.API_URL || API_URL;
    } catch (error) {
        console.error('Failed to load configuration:', error);
        // Fallback to default value already set
    }
}

// Load config before exporting functions
await loadConfig();

function getApiKey(model) {
    const lowerModel = model.toLowerCase();
    return settingsManager.getSetting(`${lowerModel}ApiKey`) || '';
}

async function sendAudioToServer(audioBlob, formElements) {
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
        console.time('serverProcessing');
        const response = await fetch(`${API_URL}/process_audio`, {
            method: 'POST',
            body: formData
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
        throw error;
    }
}

async function sendHomeworkRequest(formElements) {
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
        const response = await fetch(`${API_URL}/generate_homework`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
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
    try {
        const requestData = {
            chat_history: formElements.chatObject.chat_history,
            tutors_comments: formElements.chatObject.tutors_comments,
            summary: formElements.chatObject.summary,
            model: formElements.modelSelect.value,
            tutoringLanguage: formElements.tutoringLanguageSelect.value,
            api_key: getApiKey(formElements.modelSelect.value)
        };

        console.log('Sending request data:', requestData);  // Add this line for debugging

        const response = await fetch(`${API_URL}/generate_chat_name`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
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